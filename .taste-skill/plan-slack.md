# Slack status while focusing

The user asked: "when I start a focus session, update my Slack status." Build it browser-only, using the same
bring-your-own-key pattern as the AI coach: the user pastes a Slack **User OAuth Token** (`xoxp-…`), and it stays in this
browser's localStorage and is never synced. I verified that Slack's Web API answers browser POSTs with
`access-control-allow-origin: *` when the body is `application/x-www-form-urlencoded` and the token is in the
body. So send **no custom headers**: no `Authorization`, and no JSON content-type, which would trigger a preflight
that Slack rejects.

## `src/lib/slack.ts` (+ `slack.test.ts`)
- `SLACK_KEY = 'profocus:slack'`. `SlackConfig = { token: string; text: string; emoji: string; withTask: boolean; dnd: boolean }`.
  Defaults: text `'Focusing'`, emoji `':headphones:'`, withTask `false` (task titles become visible to the whole
  workspace, so it is opt-in), dnd `true`.
- `loadSlackConfig()` / `saveSlackConfig(c | null)`. Wrap them in try/catch and validate shape on load (it is untrusted
  storage). `validateToken(t)` returns an error string or null: empty gives "Paste a token first.";
  `xoxb-` gives "That's a bot token. Use the User OAuth Token (starts with xoxp-)."; anything not `xoxp-` gives
  "User tokens start with xoxp-."
- Pure builders:
  - `focusStatusParams(cfg, { minutes, taskTitle, nowMs })` returns `URLSearchParams` with `token` and
    `profile=JSON.stringify({ status_text, status_emoji, status_expiration })`. The text is `cfg.text`, plus
    `" · " + taskTitle` when `withTask` and a title exist, cut to 100 chars. The expiration is
    `Math.floor(nowMs/1000) + minutes*60`, so the status clears itself even if the tab is closed.
  - `clearStatusParams(token)` returns the empty text, empty emoji and expiration 0.
- `slackCall(method, params, fetchImpl = fetch)` POSTs to `https://slack.com/api/${method}` with `body: params`
  (a URLSearchParams body gives the form content-type on its own). It parses the JSON. When `ok:false` it throws an
  `Error` with a friendly message:
  - `invalid_auth` / `token_revoked` / `account_inactive`: "Slack rejected the token. Make a new one."
  - `missing_scope`: "The token is missing a scope: add users.profile:write (and dnd:write for Do Not Disturb)."
  - `not_allowed_token_type`: the bot-token message above.
  - `ratelimited`: "Slack is rate-limiting; try again in a minute."
  - otherwise: `Slack error: <code>`.
  A network failure gives "Couldn't reach Slack."
- `startFocusStatus(cfg, minutes, taskTitle?)` calls `users.profile.set`. Then, if `cfg.dnd`, it calls `dnd.setSnooze`
  with `num_minutes`.
- `endFocusStatus(cfg)` calls `users.profile.set` with the clear params. Then, if `cfg.dnd`, it calls `dnd.endSnooze`,
  ignoring the `snooze_not_active` error.
- `testSlack(token)` calls `auth.test` and returns `"Connected as <user> in <team>"`.
- Tests mock `fetchImpl`. Cover:
  - the params and expiration, with and without the task, including the 100-char cut
  - the clear params
  - the error mapping
  - DND called or skipped
  - `snooze_not_active` ignored
  - token validation
  - load with corrupt storage giving null

## `src/state/slackFocus.ts`: `useSlackFocusSync()`
Mount it once in the app shell, next to the other shell effects in `src/App.tsx`. It reads `useTimer()`, `useStore()`
(for the task title) and `useToast()`.
- When `mode === 'focus' && running` becomes true, or `endsAt` changes while running (resume), call
  `startFocusStatus` with `minutes = Math.max(1, Math.ceil((endsAt - Date.now())/60000))`. Then set the localStorage
  flag `profocus:slack-active = '1'`.
- When focus stops running (pause, reset, finish, stop-and-log, skip, or switch to a break) and the flag is set, call
  `endFocusStatus` and remove the flag. **Only clear a status ProFocus set**, so a status the user set by hand
  is never wiped.
- When there is no config, do nothing. On an error, show one toast, `Slack status: <message>`, and keep the timer
  working. Keep the last error in a tiny module store (a subscribe/getSnapshot pair) so Settings can show it.
- Use refs so a re-render does not repeat calls. Starting the timer once makes exactly one start call.

## Settings: a "Slack status" section, placed right after "AI coach" in `src/views/SettingsView.tsx`
It follows the CoachSection pattern. The intro reads: "Optional. Sets your Slack status while a focus session runs and
clears it when you stop."
- **Fields:**
  - User OAuth Token: a password input with no autocomplete and no spellcheck, plus the hint "Stays in this browser.
    Never synced."
  - Status text
  - Status emoji, with the hint "Slack emoji code, e.g. :headphones:"
  - Checkbox: "Add the task name". Its hint: "Your whole workspace sees it."
  - Checkbox: "Pause notifications while focusing (Do Not Disturb)"
- **Buttons:** Save, Test (shows the `auth.test` result), Remove token.
- **Status line:** shows the last sync error from the module store.
- **How-to hint** (a short ordered list):
  1. Open api.slack.com/apps (link it with `target="_blank" rel="noopener noreferrer"`), then Create New App, then From
     scratch, and pick your workspace.
  2. Under OAuth & Permissions, then **User Token Scopes**, add `users.profile:write` and `dnd:write`.
  3. Install to Workspace, then copy the **User OAuth Token** (`xoxp-…`).
  4. Paste it here, Save, Test.

  Add one muted line: "Some workspaces need an admin to approve new apps."

## Docs
- `docs/GUIDE.md`: a short section, "Slack status while focusing", with the same steps.
- `README.md`: one line in the feature list.

## Constraints
- Do not touch `api/`, `src/lib/calendar*`, `src/state/calendar.tsx`, `src/state/auth.tsx` or `src/state/sync.tsx`.
  Keep changes to `timer.tsx` at zero unless a value is truly unreachable.
- No new dependencies. No `console.log`. Never log or toast the token.
- The styling uses existing classes and needs no new CSS, or only a few lines in `features.css`.

## Verify
`npm run typecheck && npm test && npm run build` must all pass. Do not run any git commands. Report:
- the files changed
- the tests added
- anything you could not verify. A real Slack call is not verifiable here, but the browser CORS behaviour was checked by
  me with curl.
