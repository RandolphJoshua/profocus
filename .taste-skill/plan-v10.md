# v0.10 — Focus length picker, monday.com import

## Part T — change focus length from the timer
Today the length is only in Settings → Focus timer. Add a quick way to change it on the timer itself
(`src/components/FocusTimer.tsx`, in both the compact sidebar timer and the Focus mode screen).
- **When it shows.** When the timer is idle (not running) and in focus mode, show a native
  `<select aria-label="Focus length">` beside or under the clock, with
  options 15, 20, 25, 30, 45, 50, 60, 90 min. If the current `settings.focusMin` is not in that list, add it as an option
  so the select always shows the truth.
- **What it changes.** The choice dispatches `SET_SETTINGS { focusMin }`. The timer already re-syncs an idle, untouched timer to
  the new length (see the effect in `src/state/timer.tsx` around line 104). Check that it does in practice. If the
  timer is idle but partly used, `reset()` it so the new length shows. Do not show the picker while running.
- **Breaks.** In a break mode, offer the same select for that break's length (`shortBreakMin`: 5, 10, 15;
  `longBreakMin`: 15, 20, 30). Hide it if that makes the compact timer too crowded, and keep focus only.
- **Styling.** Use existing control styles, a compact height (28-32px) and the theme tokens. It must fit the 224-240px
  dark sidebar card (dark sidebar tokens: `--sidebar-*`) and the phone layout.
- **Tests.** A Testing Library test: change the select, and the clock shows the new length.

## Part M — new monday.com items become ProFocus tasks
The user's team board **HQ Team Tasks** (id `5105228983`, workspace getyards-squad) gets new items from a Slack zap. The user wants
each **new** item to appear as a ProFocus task automatically. This is browser-only with the user's personal token (the same
pattern as the AI coach and Slack: localStorage `profocus:monday`, never synced). I verified with curl that
`https://api.monday.com/v2` answers CORS preflight with `access-control-allow-origin: *` and allows the headers
`authorization, content-type, api-version`.

Board facts (from the monday API):
- Columns:
  - `name`
  - Owner: people column `multiple_person_mm7p7hex`
  - Priority: status `color_mm7p97z0` with labels Critical / High / Normal
  - Status: `color_mm7pqff3`, where `Done` is the done label; others are Not started, Working on it, Blocked, Awaiting sign-off
  - Due: date `date_mm7p78vn`
  - Details: long text `long_text_mm8aqd87`
- Groups: "New from Slack (to triage)", Tech Support & Design, Automation, Marketing, Done.
- The user is "Randolph Ongtangco", monday user id 95522544. Resolve it at runtime with `query { me { id name } }`; do not
  hard-code it.

### `src/lib/monday.ts` (+ test)
- **Config.** `MondayConfig = { token: string; boardId: string; mineOnly: boolean; projectId?: ID }`, with default board `'5105228983'`
  and `mineOnly: true`. Write load/save functions for localStorage `profocus:monday` and validate on load (it is untrusted).
- **The request.** `mondayQuery(token, query, variables, fetchImpl = fetch)` POSTs JSON to `https://api.monday.com/v2` with headers
  `Authorization: <token>`, `Content-Type: application/json` and `API-Version: 2025-04`. Throw friendly errors:
  - a 401 or `errors` mentioning authentication gives "monday rejected the token. Make a new one."
  - complexity or rate limits give "monday is rate-limiting; try again in a minute."
  - a network failure gives "Couldn't reach monday."
- **Fetching the board.** `fetchBoardItems(cfg)` returns `{ meId, items }`. It uses `items_page(limit: 100)` on the board, with
  `cursor` pagination capped at 5 pages. For each item it returns `id, name, created_at, group { title }`, and the column values for the
  owner, priority, status, due and details columns, read through `column_values(ids: [...]) { id text value }`.
  It parses owner ids from the people column `value` JSON (`personsAndTeams[].id`).
- **Turning items into tasks.** The pure `itemsToNewTasks(items, { meId, mineOnly, seen: Set<string>, existingTitles: Set<string>, projectId, now })`
  returns `{ tasks, seenIds }`. It:
  - skips items whose id is in `seen`
  - skips items whose status is Done
  - with `mineOnly`, skips items whose owners do not include `meId` (an item with **no owner** counts as not mine)
  - skips items whose lower-cased trimmed title matches an open task (to avoid duplicating the earlier manual import)
  - maps priority Critical/High to `'high'` and Normal to `'med'`
  - gives each task: `title` = item name; **no `date`** (the user wants new work in the inbox, so they schedule it themselves); `notes` = "From monday: <group>",
    plus "Due <date>" if set, plus the item URL `https://getyards-squad.monday.com/boards/<board>/pulses/<id>`,
    plus the Details text cut to 500 chars; `projectId` = `cfg.projectId`; `source: 'monday'`; `externalId` = item id
  - returns every examined item id in `seenIds`, imported or skipped, so a skipped item is never re-checked as new
- **Types.** Add `source?: 'monday'` and `externalId?: string` to `Task` in `src/lib/types.ts`, and make sure
  `normalizeState` (in `src/lib/storage.ts`) keeps them, with only those values accepted.
- **Tests.** Cover the mapping, mineOnly, seen, title dedupe, Done skipped, the notes format, config validation, and the error mapping
  (mock fetch).

### Seen ids and the first run
- Add `Settings.mondaySeen?: string[]` to the synced state, so another device does not re-import. Cap it at the last 2000 ids.
  Have `normalizeState` keep it as a string array.
- **The first sync after connecting is a baseline.** Record every current item id as seen and import **nothing**, because the
  board's existing tasks were already imported by hand. Tell the user: "Connected. New items from now on will appear in Tasks."
  Also offer a link button, "Import N open items already there", which imports the currently open matching items through
  `itemsToNewTasks` with an empty `seen` (the title dedupe still applies).

### `src/state/mondaySync.ts`: `useMondaySync()`
Mount it once in the app shell in `src/App.tsx`, next to `useSlackFocusSync()`.
- **When it syncs.** When configured, sync on load, every 10 minutes while the tab is visible, and when the tab becomes visible
  again, with a guard so two syncs never run at once.
- **What a sync does.** It dispatches one `BATCH` with `ADD_TASK` for each new task, plus `SET_SETTINGS { mondaySeen }`. If anything was
  imported, it shows one toast: "3 new tasks from monday", or "New from monday: <title>" for a single task, with an action **View**
  that goes to `#tasks`.
- **Errors.** Keep the last error and last sync time in a small module store, like `slackFocus.ts`. Show a toast only when the
  error message changes, so no repeat every 10 minutes.

### Settings: a "monday.com" section, placed after "Slack status" (use a new `src/views/MondaySection.tsx`, like `SlackSection.tsx`)
- **Intro.** "Optional. New items on your monday board show up in Tasks."
- **Fields:**
  - Personal API token: a password input. Hint: "monday → your avatar → Developers → My access tokens → Show/Copy. Stays in
    this browser."
  - Board ID: defaults to 5105228983, with the hint "From the board URL."
  - Checkbox: "Only items where I'm an Owner" (default on).
  - Project for new tasks: a select of the active projects, or "No project".
- **Buttons.** Save, Sync now (it runs the baseline on the first run, then the normal sync), Disconnect (it removes the token
  and keeps `mondaySeen`).
- **Status line.** "Last checked 10:42 · 2 new" or the last error.

### Docs
- `docs/GUIDE.md`: short sections "Change the focus length" and "New monday items in Tasks".
- `README.md`: one feature line.

## Constraints
- Do not touch `api/`, `src/lib/calendar*`, `src/state/calendar.tsx`, `src/state/auth.tsx`, `src/state/sync.tsx` or `src/lib/slack.ts`.
- No new dependencies. No `console.log`. Never log or toast a token.
- Keep files under about 300 lines each.

## Verify
- `npm run typecheck && npm test && npm run build` must all pass.
- Screenshot the sidebar timer, Focus mode, and the monday settings section with Playwright on `vite preview` and
  `?demo=1`, at 1440 and 390. Look at them, and fix overflow or crowding.
- No git commands. Report:
  - the files changed
  - the tests added
  - the screenshot paths
  - what you could not verify (a real monday call is not possible here)
