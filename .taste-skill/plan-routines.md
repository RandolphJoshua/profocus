# Routines (recurring time blocks) + SOS reset

The user wants to run a daily/weekly operating schedule (TJ Power "DOSE" routine) inside ProFocus. ProFocus has one-off
time blocks, tasks and habits, but nothing recurring. Add **Routines**: recurring time blocks that appear on the Today
timeline and the Week grid on the days they apply. Also add an **SOS reset**, a 20-minute step-by-step rescue opened from ⌘K.
The user's data for this comes in through **Settings → Your data → Add from file** (`MERGE_STATE`), so routines must
survive `normalizeState` and `mergeState`.

## Types (`src/lib/types.ts`)
```ts
export interface Routine {
  id: ID;
  title: string;
  /** Weekdays it runs on: 0 = Sunday … 6 = Saturday. At least one. */
  days: number[];
  /** Minutes from local midnight, 15-min aligned is not required (5-min OK). end > start. */
  start: number;
  end: number;
  kind: BlockKind;
  /** Shown in the block editor and on the Habits/Routines screen; plain text, newlines kept. */
  notes?: string;
  projectId?: ID;
  /** First and last date it applies (inclusive). Both optional. */
  from?: DateKey;
  until?: DateKey;
  paused?: boolean;
  createdAt: string;
}
```
- Add `routines: Routine[]` to `AppState` (an empty array by default) and `routineSkips: string[]` (entries look like `"<routineId>|<YYYY-MM-DD>"`, capped at the last 1000).
- Add `notes?: string` to `TimeBlock`. It is optional and validated as a string up to 2000 chars. Show it in `BlockEditor` as a textarea. Imported plans put their
  how-to in block notes.
- **`normalizeState`** (`src/lib/storage.ts`) validates every routine field:
  - days: unique integers 0-6, non-empty
  - start: 0-1439; end: start+5 to 1440
  - kind: in the enum
  - title: 1-120 chars
  - notes: up to 2000 chars
  - from/until: valid date keys
  
  Drop invalid routines. Keep `routineSkips` as a string array.
- **`mergeState`** adds routines by new id, like the other collections.
- **Reducer actions:** `ADD_ROUTINE`, `UPDATE_ROUTINE` {id, patch}, `DELETE_ROUTINE` (also drops its skips), and `SKIP_ROUTINE` {id, date} / `UNSKIP_ROUTINE`.
  Add them to whatever `BATCH` accepts.

## Instances (`src/lib/routines.ts` + test)
- `routineInstances(state, date): TimeBlock[]` returns one virtual block per routine that applies that day: not paused,
  the weekday is in `days`, inside from/until, and not skipped. The id is `rt:<routineId>:<date>` and it has `routineId` set
  (add `routineId?: ID` to `TimeBlock` as a **render-only** field that is never persisted. `normalizeState` must drop blocks whose id starts with
  `rt:`). The instance carries the routine's title, kind, notes and projectId.
- `blocksForDay(state, date)` returns the real blocks of that date plus the routine instances, sorted by start.
- **Instances are NOT stored in `state.blocks`.** So they do not sync to Google Calendar (the calendar write code reads
  `state.blocks`; keep it that way) and do not bloat sync.
- Use `blocksForDay` in:
  - `DayColumn` (rendering only)
  - the Today timeline
  - any "blocked minutes today" / "free slots" stat (`stats.ts` planDay/dayScore and `nextFreeSlot` in `reducer.ts`)
  - `buildPlanRequest` in `src/lib/aiPlan.ts`, where instances are fixed blocks the AI plans around
  
  Read each call site and only change the ones that compute free time, blocked time or render. `blockedMin` on Today should
  count focus-kind routine instances like focus blocks.

## Rendering and editing
- **Look.** A routine instance renders like a block of its kind, with a small "↻" marker before the title (plain text glyph, no
  icon font). Its pointer handling is like `is-external`: you cannot drag or resize it, and a click opens the editor.
- **The editor.** Clicking an instance opens `BlockEditor` in a routine mode. It shows the title, time and notes (read-only), plus these buttons:
  - **Skip today**, labelled "Skip <weekday>", which sends `SKIP_ROUTINE`
  - **Edit routine…**, which goes to the Routines section
  - **Make a one-off copy**, which adds a real block on that date with the same fields, then skips the routine for that date, so the user can
    move or resize it
- **Overlaps.** Routine instances can overlap Google events or other blocks. Lay overlapping blocks in a day column side by side
  (a simple column-packing pass: blocks that overlap share the width equally). That is good for every block, not only
  routines. Keep it simple and stable.

## Routines management: a section on the Habits screen (`src/views/HabitsView.tsx`), below the habits
- **The list.** Group the routines by time of day (Morning < 12:00, Afternoon < 17:00, Evening). Each row shows the title, "06:00–08:00",
  the day chips (S M T W T F S, active ones filled with accent tint), and a paused state.
- **Row actions.** Edit, Pause/Resume and Delete. Delete shows an undo toast.
- **Add or edit form** (inline or a Modal): title, start, end (`<input type="time">`), day chips as toggle buttons, kind select,
  project select, notes textarea, and from/until dates (optional). Validate end > start and at least one day.
- **Empty state:** "No routines yet. Add one, or import a plan from Settings → Your data → Add from file."

## SOS reset (`src/components/SosReset.tsx`)
- **Opening it.** ⌘K gets a command "SOS: 20-minute reset", which opens a Modal titled "20-minute reset". Also add a quiet "SOS" link-btn at
  the bottom of the sidebar, above the timer (desktop only).
- **The steps**, as a numbered list. The active step is highlighted, with a large countdown for the current step (tabular nums):
  1. "Phone in another room. Sit in silence." 2 min
  2. "Clean the kitchen or make the bed, slowly." 10 min
  3. "Warm shower with the lights dimmed or off." 6 min
  4. "Turn it to lukewarm, then cold for 30–60 seconds." 2 min
  
  Then: "Now pick one task and start it." It has a button **Pick a task** that goes to `#today`.
- **Controls:** Start, Pause, Skip step, Close. Use `setInterval` with cleanup; reduced motion has no animation.
- **The SOS steps** live in `src/lib/sos.ts` as data (title + minutes), so they can be tested and reused.

## Constraints
- Do not touch `api/`, `src/lib/calendar*`, `src/state/calendar.tsx`, `src/state/auth.tsx`, `src/state/sync.tsx`, `src/lib/slack.ts`,
  `src/lib/monday.ts` or `src/lib/sync.ts`.
- No new dependencies. No `console.log`. Files under about 300 lines.

## Tests
- `routines.test.ts`:
  - weekday matching, including a Sunday = 0 edge case
  - from/until bounds
  - paused
  - skips
  - instance ids
  - `blocksForDay` merges and sorts
- `normalizeState`:
  - invalid routines dropped
  - `rt:` blocks dropped
  - notes capped
- `mergeState` adds routines.
- Reducer: add, update, delete (with its skips), skip and unskip.
- A component test: a routine shows on the Week grid on its weekday and not on another day, and "Skip" hides it for that date.
- The SOS countdown advances steps, using fake timers.

## Verify
- `npm run typecheck && npm test && npm run build` must all pass.
- **Playwright** on `vite preview` with `?demo=1`. Add two routines through the UI: one daily 06:00–08:00 (personal), one weekdays
  08:00–10:30 (focus). Check them on Today and Week at 1440 and 390, including an overlap with an existing demo block rendered side by
  side. Open SOS from ⌘K. Look at the screenshots.
- No git commands. Report:
  - the files changed
  - the tests added
  - the screenshot paths
  - anything not verified
