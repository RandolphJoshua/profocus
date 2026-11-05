# ProFocus v0.4 — Superfocus gap features

Read `CLAUDE.md`, `.claude/skills/profocus/SKILL.md`, then `.taste-skill/plan.md` (Part C design rules) and `.taste-skill/plan-sync.md` (auth/sync shape). Rules unchanged: smallest complete change, tokens-only styling, no shadows at rest, no gradients, no emoji/glyph icons, one filled primary per screen, `.num` on figures, nothing under 12px, tests for new logic, no git commands, no attribution lines.

Two agents work in parallel. **Agent D1** owns Part D1; **Agent D2** owns Part D2. The file ownership below is strict so you never edit the same file.

---

## Part D1 — Google Calendar import (read-only) — Agent D1

Owns: `src/lib/types.ts`, `src/state/reducer.ts` (+ test), `src/state/auth.tsx`, `src/lib/calendar.ts` (+ test), `src/state/calendar.tsx`, `src/components/DayColumn.tsx`, `src/components/BlockEditor.tsx`, `src/views/SettingsView.tsx` (Account section only), `src/views/WeekView.tsx` (header only), `src/styles.css` (append only), `src/main.tsx` (provider wiring only).

### Why
Superfocus "plans around the real constraints in your week" by syncing calendars. We pull the user's Google Calendar events for the visible range and show them as read-only `meeting` blocks on the timeline, so *Plan my day* and drag-to-create schedule around them.

### How the token works
Supabase's Google provider can request extra scopes. `signInWithGoogle({ calendar: true })` calls
`supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, scopes: 'https://www.googleapis.com/auth/calendar.readonly', queryParams: { access_type: 'offline', prompt: 'consent' } } })`.
After the redirect, `session.provider_token` is a Google access token (valid ~1 h). Supabase does **not** refresh it; when a Calendar API call returns 401, we mark the calendar as disconnected and show "Reconnect" (which re-runs the same sign-in). Keep the provider token only in memory/session storage via Supabase's own session object; never copy it into app state or localStorage yourself.

### Data model (`types.ts`)
```ts
// TimeBlock gets:
source?: 'google';      // imported, read-only in the editor
externalId?: string;    // Google event id
```
Reducer: `SET_EXTERNAL_BLOCKS { source: 'google'; range: { from: DateKey; to: DateKey }; blocks: TimeBlock[] }` — removes every block with that `source` whose `date` is within `range` (inclusive), then adds the given blocks. Test: blocks outside the range survive; user-made blocks survive; duplicates by externalId are replaced.

### `src/lib/calendar.ts` — pure, tested
```ts
export interface GoogleEvent { id: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; status?: string }
/** Google events → TimeBlocks. All-day events are skipped. Multi-day timed events are clipped to their start day. Cancelled events are skipped. Times use the local day of `start.dateTime`. */
export function eventsToBlocks(events: GoogleEvent[], makeId: (eventId: string) => string): TimeBlock[]
export function calendarListUrl(from: DateKey, to: DateKey): string   // https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=<from 00:00 local ISO>&timeMax=<to+1 00:00 local ISO>&maxResults=250
```
Block id = `g-<eventId>` (stable, so re-imports replace cleanly). `kind: 'meeting'`, `title: summary ?? 'Busy'`, `source: 'google'`, `externalId: event.id`.

### `src/state/calendar.tsx` — `CalendarProvider` + `useCalendar()`
State: `{ status: 'off' | 'connected' | 'expired' | 'error' | 'loading', lastImportAt?: string, error?: string, connect(): void, refresh(range?): Promise<void>, disconnect(): void }`.
- `status === 'off'` when no provider token has ever been seen this session and `settings.calendarConnected` is not true. Store `settings.calendarConnected?: boolean` (add to `Settings`; default undefined) so other devices know a calendar is linked and show "Reconnect" instead of "Connect".
- On a session with `provider_token`: fetch the current week ± 1 week (from `startOfWeek(today)` − 7 days to + 13 days), `fetch(url, { headers: { Authorization: 'Bearer ' + token } })`, map with `eventsToBlocks`, dispatch `SET_EXTERNAL_BLOCKS`, set `lastImportAt`, set `calendarConnected: true`.
- 401/403 → `status: 'expired'` (403 with "accessNotConfigured" or "insufficient" in the body → `error: 'Enable the Google Calendar API and the calendar.readonly scope in Google Cloud (see docs/google-oauth-setup.md §1.4).'`). Network/other → `status: 'error'` with the message. Never throw.
- `refresh()` also runs on `visibilitychange` → visible if the last import is older than 15 minutes and status is `connected`.
- `disconnect()` → `SET_EXTERNAL_BLOCKS` with an empty list over a wide range (−365..+365 days), `calendarConnected: false`, status `off`.

### UI
- **Settings → Account** (signed-in state only): a second line "Google Calendar: Not connected · [Connect]" / "Connected · imported 12:03 · [Refresh] [Disconnect]" / "Expired · [Reconnect]" / the error text in `--negative` with [Reconnect]. Buttons are text buttons; no primary. When signed out: nothing.
- **Week header**: right of the week navigation, a 12px grey line "Calendar imported 12:03" when connected; nothing otherwise.
- **Blocks with `source === 'google'`**: in `DayColumn`, not draggable/resizable (no pointer handlers, `cursor: default`), rendered as the `meeting` style plus a small grey "G" text mark before the title (text, not an icon); clicking opens `BlockEditor` in a **read-only** mode: title, time, "From Google Calendar", and only a Close button. In `BlockEditor`, if `draft.source === 'google'` render that read-only body.
- `nextFreeSlot` already treats every block as busy, so imported events are respected by *Plan my day*; no change needed.

### Tests
`src/lib/calendar.test.ts`: `eventsToBlocks` (timed event → block with correct minutes, all-day skipped, cancelled skipped, multi-day clipped to its first day, stable ids), `calendarListUrl` range. `src/state/reducer.test.ts`: `SET_EXTERNAL_BLOCKS` cases above. Mock nothing network-bound in tests.

---

## Part D2 — Trajectory, auto-plan, focus quality, ambient sound — Agent D2

Owns: `src/lib/stats.ts` (+ test), `src/views/GoalsView.tsx`, `src/components/PlanDay.tsx`, `src/components/PlanWeek.tsx`, `src/views/ReviewView.tsx`, `src/views/FocusMode.tsx`, `src/lib/demo.ts`, new `src/features.css` (imported from `src/main.tsx` — add the one import line only; D1 also edits `main.tsx` for a provider, so add your line at the very top of the imports and touch nothing else), new tests.

### D2.1 Goal trajectory (Superfocus: "Day 52 of 84 · On track / Adjust / Off track")
`src/lib/stats.ts`:
```ts
export type Trajectory = 'on-track' | 'adjust' | 'off-track' | 'no-date';
export interface GoalTrajectory { dayOf: number; daysTotal: number; daysLeft: number; expected: number; actual: number; status: Trajectory }
export function goalTrajectory(state: AppState, goalId: ID, today: DateKey): GoalTrajectory
```
`daysTotal` = days from `goal.createdAt` date to `targetDate` (min 1); `dayOf` = days elapsed + 1, clamped; `expected` = dayOf/daysTotal; `actual` = tasksDone / (tasksDone + tasksOpen) for tasks under the goal's projects (0 when none). Status: no targetDate → `'no-date'`; `actual >= expected − 0.1` → `'on-track'`; `>= expected − 0.25` → `'adjust'`; else `'off-track'`. Goals with status `done` are `'on-track'` with actual 1. Tests for each band and the no-tasks case.
**Goals view**: each goal row gets a line "Day 52 of 84 · 32 days left · On track" with the status as a 20px pill (positive / warning / negative pale pairs; `no-date` prints "No target date" in grey, no pill), and a 4px progress track (`--rule`) with two marks: the actual share filled in `--accent` and a 1px `--text` tick at the expected share — this is the `Charts.bullet` idea from the design rules: current vs target, never two bars.

### D2.2 Auto-plan ("the coach drafts your week; keep what fits")
- **Plan my day, step 3**: add a secondary button "Schedule everything" above the list: runs `nextFreeSlot` for each unscheduled open task in priority order (same `byPriority`), from `max(now, dayStart)`, chaining: each placed block becomes busy for the next. Tasks that don't fit get the existing "No free slot" mark. One dispatch per block is fine.
- **Plan my week, step 3**: add "Add all three" (secondary) that calls `addTask` for every priority not yet added, defaulting each to a different day (Mon/Tue/Wed of the week, or the first three days ≥ today), 90 min.
- Pure helper in `stats.ts` (tested): `planDay(blocks, tasks, date, from, dayStart, dayEnd): { taskId; start; end }[]` that returns the chained placements without dispatching; the component maps them to `ADD_BLOCK`s.

### D2.3 Focus quality
`stats.ts`: `focusQuality(sessions, days: DateKey[]): { rated: number; quality: number | null }` — quality = mean of ratings mapped 1→0, 2→0.5, 3→1, as a 0–100 integer; `null` when nothing rated. **Review**: in the top divided strip add a fifth cell "Focus quality" showing `72%` or `—` with the caption "n rated". **Today greeting line**: no change. Tests: mapping, empty.

### D2.4 Ambient sound in Focus mode
A text toggle "Sound: off / brown noise" under the controls. Brown noise via WebAudio: an `AudioBufferSourceNode` of 2 s of generated brown noise, looped, through a `GainNode` at 0.08, started on toggle (user gesture), stopped on exit or toggle. Respect `settings.sound === false` by hiding the toggle. No external assets. Clean up the AudioContext on unmount. One small render test that the toggle appears and flips its label (mock `AudioContext` on `window`).

### Demo data
Add a target date to the second demo goal so one goal reads "Adjust" and one "On track"; rate one more session. Keep totals consistent.

---

## Verify (both agents)
`npm run typecheck && npm test && npm run build`, then `npx vite preview --port 4175 &` (D1) / `--port 4176` (D2), run the design inspector (`…/design-taste-frontend/scripts/inspect.mjs --app "http://localhost:<port>/?demo=1#<screen>"`) on the screens you changed (D1: settings, week; D2: goals, review, focus), fix FAILs, look at the 1440 and 390 screenshots, kill your preview server. Report what you built, test counts, remaining WARNs with a one-line defence, and anything you could not verify (D1: the live Google round-trip).
