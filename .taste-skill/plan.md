# ProFocus v0.2 — spec for implementation agents

Read `.claude/skills/profocus/SKILL.md` and `CLAUDE.md` first. Rules that hold for every agent:

- Vite + React 18 + TypeScript strict, no new runtime dependencies. `npm run typecheck && npm test && npm run build` must pass before you report.
- Smallest complete change. No abstractions, options or "for later" code beyond this spec. Keep existing file structure.
- Old saved data must still load: every new field is optional, or filled in `normalizeState`.
- Dates are local `DateKey` strings (`src/lib/date.ts`); times of day are minutes from midnight.
- Do not add git attribution lines to anything. Do not commit; the orchestrator commits.

## Product intent (why these features)

ProFocus already does: daily highlight, tasks, time blocks, focus timer, habits, shutdown, weekly review.
Superfocus (Ali Abdaal) adds four things we are copying in spirit, not in look: **goals** that tasks roll up to,
**guided planning rituals** (implementation intentions), a **single-task focus mode**, and an **accountability
feedback loop** (a score from planned vs done).

---

## Part A — data layer (agent A) — files: `src/lib/types.ts`, `src/lib/storage.ts`, `src/lib/stats.ts`, `src/state/reducer.ts`, tests

### Types

```ts
export interface Goal {
  id: ID;
  title: string;
  why?: string;            // one line: why this matters
  targetDate?: DateKey;
  status: 'active' | 'done' | 'paused';
  createdAt: string;
  doneAt?: string;
}
// Project gets:  goalId?: ID
// FocusSession gets:  rating?: 1 | 2 | 3   (1 rough, 2 ok, 3 flow) and intention?: string
// DayPlan gets:  plannedAt?: string  (ISO; set when the "Plan my day" ritual finishes)
//                intention?: string  (the focus-mode sentence "I will … by …")
export interface WeekPriority { id: ID; title: string; goalId?: ID; done: boolean }
// WeeklyReview (keyed by week start, state.reviews) gets:
//   priorities?: WeekPriority[]   (max 3, enforce in reducer)
//   plannedAt?: string            (set when "Plan my week" finishes)
// AppState gets:  goals: Goal[]
```

`normalizeState`: `goals: arr(raw.goals, [])`. Add a test.

### Reducer actions (all pure; ids/timestamps arrive on the action)

```
ADD_GOAL {goal} · UPDATE_GOAL {id, patch} · DELETE_GOAL {id}   (DELETE also clears projects[].goalId and priorities[].goalId that point to it)
SET_WEEK_PRIORITIES {week, priorities}   (slice to 3)
TOGGLE_WEEK_PRIORITY {week, id}
RATE_SESSION {id, rating}
```
`SET_DAY` / `SET_REVIEW` already patch arbitrary fields, so `plannedAt`, `intention` need no new actions.

Also add to `src/state/reducer.ts` a pure helper used by the daily ritual:

```ts
/** Next free [start,end) slot of `minutes` on `date` at or after `from`, within day hours, snapped to 15 min. */
export function nextFreeSlot(blocks: TimeBlock[], date: DateKey, from: number, minutes: number, dayStart: number, dayEnd: number): { start: number; end: number } | null
```
Test it (gap between blocks, after last block, none left).

### Stats (`src/lib/stats.ts`) — pure, tested

```ts
export interface DayScore {
  date: DateKey;
  planned: boolean;          // days[date].plannedAt set
  highlightSet: boolean; highlightDone: boolean;
  focusMin: number;          // logged sessions
  blockedMin: number;        // sum of 'focus' blocks that day (the plan)
  habitsDone: number; habitsTotal: number;
  tasksDone: number; tasksPlanned: number;   // tasks with date === date (done counts if done)
  score: number;             // 0–100, see formula
}
export function dayScore(state: AppState, date: DateKey): DayScore
```
Formula (document it in a comment; keep it exactly this so the UI can explain it):
`score = 40·highlight + 30·focus + 15·habits + 15·tasks` where
highlight = 1 if highlightDone else 0 (0 if no highlight set);
focus = min(1, focusMin / max(blockedMin, 60)) — i.e. against the plan, or against an hour if nothing was blocked;
habits = habitsDone/habitsTotal (1 if no habits); tasks = tasksDone/tasksPlanned (1 if none planned). Round.

```ts
export function plannedStreak(state: AppState, today: DateKey): number   // consecutive days ending today (or yesterday if today not yet planned) with plannedAt
export function weekScores(state: AppState, weekStart: DateKey, today: DateKey): DayScore[]   // 7 entries; days after today have score 0 and planned false
export interface GoalProgress { goalId: ID; focusMin30d: number; tasksDone: number; tasksOpen: number; weeksPrioritised: number; projects: ID[] }
export function goalProgress(state: AppState, goalId: ID, today: DateKey): GoalProgress
```
`focusMin30d`: sessions in the last 30 days whose task/project rolls up to the goal (session.projectId → project.goalId, or session.taskId → task.projectId → goal). `weeksPrioritised`: count of `reviews[*].priorities` entries with this goalId.

Tests for each function in `src/lib/stats.test.ts` and `src/state/reducer.test.ts`. Do not touch any `.tsx` file.

---

## Part C — restyle to the "Editorial greeting" app style (agent C) — files: `src/styles.css`, `index.html`, `src/App.tsx`, `src/views/*`, `src/components/*`, plus new `src/lib/demo.ts`

Design sheet: `.taste-skill/app/direction.json` (reprint with the draw script; key facts repeated here). Rules: the
tasteskill app-screen chapter. The inspector will check: no gradients, no shadows at rest, no eyebrow labels, no
backdrop blur, no tracked uppercase labels, no cream+terracotta, an h1 on every screen, sidebar folded on phones,
text ≥ 11px, greys ≥ 4.5:1, tabular figures on numbers, one hue on data.

### Tokens (replace the whole `:root` palette; keep the dark block but with true-neutral darks)

```css
:root {
  --ground: #f4f3ef;   /* the chrome: sidebar + top strip. Warm stone = "paper" is the product's face */
  --surface: #ffffff;  /* the sheet the screens sit on */
  --panel: #f9f9f8;    /* tonal panels on the sheet, one step off white, no border needed */
  --raised: #ffffff;   /* row cards inside a panel: white, 1px --border */
  --active: #e9e8e3;   /* active nav pill */
  --border: #eaeaea; --rule: #f3f3f3; --control: #d9d9d6;
  --text: #1f201d; --muted: #636361; --faint: #6b6b6b;
  --accent: #1b6e66;   /* deep teal: today's focus blocks, the timer ring, the one selected thing. Under 2% of pixels */
  --accent-tint: #e4f0ee;
  --primary: #1f201d; --primary-ink: #fff;   /* the one filled button per screen is near-black */
  --positive: #2e7d32; --negative: #b42318; --warning: #92400e;
  --pill-positive-bg: #dcfae5; --pill-positive-ink: #04250e;
  --pill-negative-bg: #fdecea; --pill-negative-ink: #7a1d14;
  --pill-neutral-bg: #f3f3f3; --pill-neutral-ink: #3d3d3a;
  --radius-card: 22px; --radius-control: 999px; --radius-row: 12px;
  --gap: 16px; --pad: 20px; --control-height: 38px; --row-height: 63px; --sidebar-width: 224px;
  --font: "Instrument Sans", Inter, system-ui, sans-serif;
  --font-greeting: "Instrument Serif", Georgia, serif;
  --fs-title: 24px; --fs-greeting: 48px; --fs-section: 14px; --fs-kpi: 32px; --fs-body: 14px; --fs-small: 12px;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1); --t-press: 120ms; --t-hover: 150ms; --t-ui: 200ms;
}
:root[data-theme="dark"] (and the prefers-color-scheme block) {
  --ground: #000; --surface: #111; --panel: #171717; --raised: #1c1c1c; --active: #222;
  --border: #262626; --rule: #1c1c1c; --control: #444;
  --text: #fff; --muted: #b4b4b4; --faint: #949494; --primary: #fff; --primary-ink: #000;
  --accent: #3fa79c; --accent-tint: #122422;
  --positive: #3fc07a; --negative: #e5566f; --warning: #e5a93b;
  --pill-positive-bg: #172a1d; --pill-positive-ink: #3fc07a; --pill-negative-bg: #2c1a20; --pill-negative-ink: #e5566f; --pill-neutral-bg: #222; --pill-neutral-ink: #ddd;
}
```
Fonts in `index.html`: replace the Fraunces/Inter link with
`https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Instrument+Serif&display=swap`.
Every colour and font-family in CSS references a token. No `box-shadow` except `.modal` and the focus-mode overlay (those float). No `linear-gradient`, no `backdrop-filter`, no `.eyebrow` (delete the class and every element using it; put that information into the h1 or the grey line under it). Body 14px/20px; `.num { font-variant-numeric: tabular-nums }` on every figure (clock, minutes, counts, stats).

### Shell ("Tinted frame, white sheet", variant one)

`.app` is a grid: 224px sidebar on `--ground`, and a `main` that is a white sheet with `border-radius: 16px 0 0 0`-style inset: the sheet butts the sidebar, is inset 8px from the window's right and bottom, radius 16, 1px `--border`, no shadow. Content padding 24px. Sidebar: product mark (`/icon.svg`, recolour to the accent: a simple ring) + "ProFocus" at the top; nav rows 34px pitch, 14px/400 labels in `--muted`, active row = `--active` grey pill with the label in `--text` at 500 (no colour, no left bar); a count only on **Tasks** = inbox count (tasks with no date) when > 0, as plain grey text after the label; keyboard-number hints only on hover. Keep the compact timer at the sidebar bottom. Phone (≤760px): the frame disappears, sheet = screen, bottom bar of destinations (existing) stays; a 48px top bar is not needed.

### Screens

- **Today** = the "home" pattern. Centred 1100px column, 12-col grid (77px cols, 16px gutters). h1 is the greeting in `--font-greeting` 48px/400: `Good morning.` / `Good afternoon.` / `Good evening.` on the first line, then a 14px grey line that is today's **one fact**, computed: if highlight open → "Wednesday 4 November · highlight still open · 2h 30m blocked before 6 pm"; if highlight done → "… · highlight done · 1h 15m focused"; if nothing planned → "… · nothing planned yet". Then four count tiles spanning 3 cols each (128px tall, 16px padding, `--panel`, no border): *Open tasks* · *Blocked today* (minutes) · *Focused* (minutes) · *Habits* (done/total). Values 32px/400 tabular, labels 14px grey, a plain caption line. Then rows 9+3 (tasks panel + highlight panel), then 6+6 (timeline panel + timer/habits/shutdown stacked) — adjust so internal edges meet. Panels: `--panel`, 20px padding, radius 22, a 14px/600 title; row cards (tasks) 63px tall, white, 1px `--border`, radius 12, 8px gaps. Highlight panel: the highlight sentence at 20px/500 (sans, not serif), the big check, nothing else. Timeline keeps its drag behaviour.
- **Every other screen**: h1 = a noun at 24px/600 sans ("Week", "Tasks", "Habits", "Review", "Settings"), one optional 14px grey line under it (the period, a count), actions to the right only if real. The Review stat row becomes one `--panel` strip split by 1px `--border` dividers (label over 32px/400 value), no separate tiles. Settings: two-column rows (450px label column + ~700px `--panel` radius 16 padding 16, sections split by a 1px rule with 32px above/below).
- **Buttons**: one filled near-black primary per screen (`--primary`), secondary = white with 1px `--control`, tertiary = text. All 38px, pill. Inputs 38px, white, 1px `--control`, radius 10.
- **Calendar blocks** (DayColumn): one hue on the data. `focus` kind = `--accent-tint` fill with a 3px `--accent` left edge, title in `--text`; `meeting` = white fill with 1px `--control` outline; `personal` = `--panel` fill; `break` = 1px diagonal hatch (repeating-linear-gradient at 45° between transparent and `--border` is allowed: it is a hatch mark, not a gradient fill — add the comment `taste-skill-ignore` on that line). Project colour appears only as a 6px dot before the block title and before task titles; never as a fill. Done blocks: title struck through, 60% opacity. Now-line: 1px `--negative` with the time in ink. Hour lines 1px `--rule`.
- **Timer ring**: track `--rule`, progress `--accent`; break modes `--positive`. Clock 32px/400 tabular in the sans (not serif). Remove the "breathe" animation.
- **Habits chips** on Today: white, 1px `--control`; done = `--accent-tint` fill with `--accent` 1px border and an ink label. Habit table cells: done = `--accent` fill; the heatmap one hue (`--accent` at full vs `--panel`). Drop per-habit colour pickers' visual use (keep the data; the colour becomes the 6px identity dot only).
- **Priority marks**: high = a 6px `--negative` dot, med = `--warning`, low = none. Status pills only in rows, 20px, pale tint + dark ink of the same hue.
- **Modal**: white, radius 22, 1px border, shadow `0 12px 28px rgba(0,0,0,.14)` (it floats), backdrop `rgba(0,0,0,.32)` with no blur.
- **Motion**: feedback only (press, hover, focus); no entrances. Transform/opacity only, 120–200ms, `--ease-out`; keep `prefers-reduced-motion`.

### Demo seed (for the inspector and screenshots)
`src/lib/demo.ts` exporting `demoState(today: DateKey): AppState`: 3 projects (Writing, Work, Health) with colours, 6 tasks today (2 done), 3 inbox tasks, blocks today (focus 9:00–10:30 Writing, meeting 12:00–13:00, focus 14:00–14:30, personal 18:00–19:00), 7 days of sessions (25–75 min), 3 habits with 27 days of plausible log, highlights for the last 5 days, today's highlight "Finish chapter 3 outline". All totals must be consistent (sessions sum to what the tiles show). `main.tsx`: if `location.search` includes `demo=1` and storage is empty, start from `demoState(todayKey())` (do not persist it unless the user changes something — simplest: pass as `initial` to `StoreProvider`; it will persist on first change, which is fine).

### Verify (agent C)
`npm run typecheck && npm test && npm run build`, then `npx vite preview --port 4173 &` and run:
`node /root/.claude/skills/synced/1565b693-f868-4aa5-8795-1eb52de3aa00_92af7b0f-86fb-46f0-bcd0-057a4fe80e34/design-taste-frontend/scripts/lint.mjs --app src` and
`node …/scripts/inspect.mjs --app "http://localhost:4173/?demo=1#today" --out .taste-skill/after-today` (and `#review`, `#settings`).
Fix every FAIL; list remaining WARNs with a one-sentence defence each. Look at the screenshots at 1440 and 390 before reporting. Kill the preview server when done.

---

## Part B — new screens (agent B, after A and C) — new files under `src/views` and `src/components`, edits to `App.tsx`, `TodayView.tsx`, `WeekView.tsx`, `ReviewView.tsx`, `TasksView.tsx`, `FocusTimer.tsx`, `styles.css` (append only)

Use only tokens and classes from Part C. Same visual rules. Each new screen has an h1 noun.

1. **Goals view** (nav item "Goals" between Tasks and Habits; key 4; renumber the rest). h1 "Goals", grey line "N active · N done". Add form (title, why, target date) → `ADD_GOAL`. Each goal is a row card: title 16px/500, why in grey, target date in grey right-aligned ("Due 2027-03-01" or "No date"), then a 14px line from `goalProgress`: "4h 10m focused in 30 days · 12 tasks done · 3 open · prioritised 2 weeks". Linked projects as identity dots + names. Actions: Pause/Resume, Mark done, Delete (confirm). In **Tasks → Projects** sidebar, each project row gets a small select "Goal: —/…" → `UPDATE_PROJECT {goalId}`.
2. **Plan my week** ritual (`src/components/PlanWeek.tsx`, a Modal with 3 steps, Back/Next, one primary per step). Opened from a primary button "Plan my week" in the Week h1 row (label "Re-plan" if `reviews[week].plannedAt`). Step 1 *Last week*: the `weekStats` numbers of the previous week as a divided strip + the three reflection textareas (bound to `reviews[prevWeek]` via `SET_REVIEW`). Step 2 *This week's three*: three text inputs, each with a goal select (active goals) → `SET_WEEK_PRIORITIES`. Step 3 *Protect time*: for each priority, a "Add as task on …" day select + estimate (default 90m) that creates a task (`ADD_TASK`) with the priority title and the goal's first project (if any); "Done" sets `plannedAt`. After planning, the Week view shows a panel "This week's three" above the calendar with checkboxes (`TOGGLE_WEEK_PRIORITY`), and Today shows the same three (compact, with checkboxes) under the highlight panel.
3. **Plan my day** ritual (`src/components/PlanDay.tsx`, Modal, 3 steps). Opened from a primary "Plan my day" button in the Today greeting row when `!days[today].plannedAt` (otherwise a tertiary "Re-plan"). Step 1 *Triage*: overdue + inbox tasks as a checklist "Do today" (checked → `UPDATE_TASK {date: today}`) with "Move all to today". Step 2 *Highlight*: radio list of today's open tasks + a free-text option → `SET_DAY {highlight, highlightTaskId}`. Step 3 *Block it*: today's unblocked open tasks, each with a "Schedule" button → `nextFreeSlot` from `max(now, dayStart)` for `estimateMin ?? 30` → `ADD_BLOCK` (kind focus, taskId, projectId); shows "9:30–10:15" after; "Done" sets `plannedAt`. The grey line under the greeting adds "· planned N days in a row" when `plannedStreak > 0`.
4. **Focus mode** (`src/views/FocusMode.tsx`, hash `#focus`). Full-screen overlay on `--surface` (z-index above the shell, covers the sidebar): top-left tertiary "Exit (Esc)"; centred column: task title at 24px/500 (or "No task — pick one" with a select of today's open tasks), an intention input "I will … (one line)" bound to `days[today].intention`, the timer ring at 2× size with the clock at 48px/400 tabular (the inspector allows 48 here only because the screen's one question is "how long is left" — keep every other text ≤ 24px), Start/Pause primary + "Stop & log" secondary. Entry: a secondary button "Focus mode" on the Today timer panel and a tertiary one in the sidebar timer. When a focus interval completes while in focus mode (or after Stop & log), show three buttons *Rough / OK / Flow* → `RATE_SESSION` on the most recent session (timer.tsx must expose the id of the last logged session: add `lastSessionId` to the timer context). Esc exits (restore the previous hash). Keyboard Space still toggles.
5. **Scorecard**. Today: the greeting's grey line gets "· score 72" when the day has any data, and the four tiles stay as they are. Review: add a panel "Daily scores" — seven columns (Mon…Sun), each a label and the score at 32px/400 (`—` for future days, `0` prints as 0), with the week's mean as the strip's first cell "Week 61"; below, one 12px line explaining the formula: "40 highlight · 30 focus vs plan · 15 habits · 15 tasks". Grey for every number; the week mean in ink. No chart.

Tests: a render test per new modal (open, click through, assert the dispatch result in state) in `src/App.test.tsx` or sibling files; `nextFreeSlot` and `dayScore` are already tested in Part A.
