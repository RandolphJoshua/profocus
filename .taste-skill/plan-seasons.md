# ProFocus v0.5 — Seasons

Read `CLAUDE.md`, `.claude/skills/profocus/SKILL.md`, `.taste-skill/plan.md` (Part C design rules) and `.taste-skill/plan-features.md` (D2 for the Goals view conventions). Same rules: smallest complete change, tokens only (`src/features.css` for new CSS), no shadows/gradients/emoji, one filled primary per screen, `.num` on figures, tests for new logic, no git commands, no attribution lines. Old saved data must load (new collection filled in `normalizeState`).

## Intent (Superfocus: "goals are broken down into seasons")
A **season** is a time box — 12 weeks by default — with a one-line theme and the few goals that get space in it. Only one season is current (the one containing today). The point is to make "what deserves space right now" explicit: Plan my week offers season goals first; the Goals screen leads with the season.

## Data (`src/lib/types.ts`, `src/lib/storage.ts`)
```ts
export interface Season {
  id: ID;
  name: string;            // "Autumn push"
  theme?: string;          // one line: what this season is about
  start: DateKey;
  end: DateKey;            // inclusive
  goalIds: ID[];
  createdAt: string;
  closedAt?: string;       // set by "Close season"
  reviewNote?: string;     // written when closing
}
// AppState gets: seasons: Season[]   (normalizeState: arr(raw.seasons, []))
```

## Reducer (`src/state/reducer.ts`, tested)
`ADD_SEASON {season}` · `UPDATE_SEASON {id, patch}` · `DELETE_SEASON {id}` (goals untouched). `DELETE_GOAL` must also remove the id from every `season.goalIds`.

## Stats (`src/lib/stats.ts`, tested)
```ts
export function currentSeason(seasons: Season[], today: DateKey): Season | undefined   // not closed, start <= today <= end; if several, the latest start
export interface SeasonProgress { weekOf: number; weeksTotal: number; daysLeft: number; goalsDone: number; goalsTotal: number; focusMin: number; highlightsHit: number; daysElapsed: number }
export function seasonProgress(state: AppState, seasonId: ID, today: DateKey): SeasonProgress
```
`weeksTotal = ceil(days(start..end)/7)`, `weekOf` clamped 1..weeksTotal, `daysLeft` = days from today to end (0 if past), `focusMin` = sessions with date in [start, min(today,end)], `highlightsHit` = days in that range with `highlightDone`, `daysElapsed` = days from start to min(today, end) inclusive (0 if not started). `goalsDone` counts season goals with status `done`.

## UI

### Goals view (`src/views/GoalsView.tsx`) — the season leads the screen
- Under the h1 line, a **season panel** (tonal `--panel`, radius 22): when a current season exists: its name at 16px/600, the theme in grey, then one line `.num` "Week 5 of 12 · 52 days left · 1 of 3 goals done · 14h 20m focused · highlight hit 23 of 35 days", then a 4px `--rule` track with the elapsed share filled in `--accent`. Text buttons: *Edit* · *Close season*. When none: one grey sentence "No season running. A season is 12 weeks with a theme and the goals that get the space." and a secondary button *Start a season*.
- The goal list is split: **This season** (goals in `goalIds`, in that order) then **Later** (the rest, active first). Each goal row in *Later* gets a text button "Add to season" (only when a season is running); rows in *This season* get "Remove from season". Done/paused goals keep their existing controls.
- **Season form** (a `Modal`): Name · Theme (one line) · Start (date, default today) · Length select (6 / 8 / 12 / 16 weeks, default 12; end = start + weeks·7 − 1, shown as "Ends Sun 25 Jan" next to it) · checkboxes of active goals. Primary *Start season* / *Save*. Validation: name required; end after start.
- **Close season** (a `Modal`): shows the progress line, a textarea "What did this season teach you?" bound to `reviewNote`, buttons *Close season* (sets `closedAt`) and *Keep going*.
- **Past seasons**: below the lists, a collapsed "Past seasons (N)" text toggle revealing rows: name · dates · "2 of 3 goals done" · the review note in grey.

### Plan my week (`src/components/PlanWeek.tsx`), step 2
The goal select lists season goals first under an `<optgroup label="This season">`, then the rest under "Other goals". No other change.

### Today greeting line (`src/views/TodayView.tsx`)
Append "· season week 5 of 12" when a current season exists. Nothing else.

### Demo (`src/lib/demo.ts`)
One current season "Autumn push" started 4 weeks ago, 12 weeks, theme "Finish the draft and get moving", containing both demo goals; one closed season from earlier in the year with a review note. Keep totals consistent.

## Tests
`src/lib/stats.test.ts`: `currentSeason` (none, one, overlapping → latest start, closed ignored), `seasonProgress` (mid-season numbers, before start, after end). `src/state/reducer.test.ts`: add/update/delete, `DELETE_GOAL` cleans `goalIds`. `src/lib/storage.test.ts`: `seasons` default. One render test in `src/screens.test.tsx`: start a season from the Goals view, see it in the panel and the goal under "This season".

## Verify
`npm run typecheck && npm test && npm run build`; preview on port 4177, inspector on `#goals` and `#today` with `?demo=1`, fix FAILs, look at 1440 and 390 screenshots of `#goals`, kill the server. Report what you built, test count, WARNs with a one-line defence.
