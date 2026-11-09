---
name: profocus
description: How to work on ProFocus, the personal planner in this repo (daily highlight, time-blocked calendar, tasks, focus timer, habits, weekly review). Use for any feature, fix or refactor in this project, before touching src/. Routes to the vendored ECC skills for TDD, React/TypeScript patterns, verification and review.
---

# ProFocus

A single-user planner that runs entirely in the browser. No backend, no accounts: state lives in `localStorage` under `profocus:v1` and can be exported/imported as JSON from Settings.

## The method the app encodes

Keep features in service of this loop; don't add surfaces that don't feed it.

1. **Capture** everything into Tasks (quick-add line, inbox = no date).
2. **Choose one highlight** per day: the thing that makes today a win.
3. **Time-block** it: drag tasks onto the day/week timeline, or let *Plan my day* schedule them into the next free slot.
4. **Focus** in timed sessions linked to a task (full-screen at `#focus`); sessions are logged and rated.
5. **Shut down** at the end of the day: energy, note, tomorrow's highlight, roll over unfinished work.
6. **Review weekly**: daily scores, focus by day and project, highlights hit, habit consistency, reflection; then *Plan my week* picks three goal-linked priorities.

Goals sit above projects (`project.goalId`); everything rolls up: session → task → project → goal.

## Map of the code

| Path | What it is |
|---|---|
| `src/lib/types.ts` | The whole data model (`AppState`). Start here. |
| `src/lib/date.ts` | Local `YYYY-MM-DD` date keys. Never use `toISOString().slice(0,10)` for "today" (it is UTC). |
| `src/lib/parse.ts` | Quick-add grammar: `#project`, `today/tmr/fri/YYYY-MM-DD/someday`, `45m/1h30m`, `@9am/@14:30`, `!high/!med/!low`. |
| `src/lib/stats.ts` | Pure derived numbers: focus minutes, streaks, weekly stats, `dayScore` (the formula is in its comment), `plannedStreak`, `goalProgress`. |
| `src/lib/demo.ts` | Sample state behind `?demo=1` (only when storage is empty). Used for screenshots and the design inspector; keep its totals consistent. |
| `src/lib/storage.ts` | Load/save/normalise state; `normalizeState` is the trust boundary for imported JSON. |
| `src/state/reducer.ts` | Every state change is an `Action` handled by a pure reducer. `quickAddActions` turns a parsed line into actions. |
| `src/state/store.tsx` | Context provider, debounced persistence, cross-tab sync, `useToday`/`useNow`. |
| `src/state/timer.tsx` | Focus/break timer (wall-clock based, survives reloads), logs `FocusSession`s. |
| `src/components/DayColumn.tsx` | Pointer-driven timeline: drag to create, move (across days), resize, drop tasks. |
| `src/lib/supabase.ts`, `src/lib/sync.ts`, `src/state/auth.tsx`, `src/state/sync.tsx` | Optional account + cloud sync: client is `null` without `VITE_SUPABASE_*` env; `chooseSource` decides local vs cloud on sign-in; whole-state upsert to `planner_state`, debounced; pull on focus. Spec: `.taste-skill/plan-sync.md`. |
| `src/lib/calendar.ts`, `src/state/calendar.tsx` | Google Calendar read-only import: provider token from the Google sign-in (memory only), events → `TimeBlock{source:'google'}` via `SET_EXTERNAL_BLOCKS`. Waits for the first cloud sync before importing. Spec: `.taste-skill/plan-features.md` Part D1. |
| `src/views/SeasonsView.tsx`, `src/components/SeasonPanel.tsx` | Seasons screen (week strip, goals in season, inline start form, past seasons); `SeasonPanel.tsx` exports the form/close/past pieces. Stats: `currentSeason`, `seasonProgress`, `seasonWeekAlignment`, `seasonWeekStrip`. |
| `src/lib/ai.ts`, `src/state/coach.tsx`, `src/components/CoachNote.tsx` | Bring-your-own-key AI coach. Key lives only in localStorage `profocus:ai` (never in AppState). `buildContext` sends titles and numbers only. Providers: Gemini, OpenAI-compatible. Spec: `.taste-skill/plan-v06.md` Part A. |
| `src/components/PlanDay.tsx`, `PlanWeek.tsx` | The two guided rituals (3-step modals); `WeekPriorities.tsx` is the shared "this week's three" panel. |
| `src/views/*` | One file per screen: Today, Week, Tasks, Goals, Seasons, Habits, Review, Settings, plus `FocusMode` (full-screen overlay at `#focus`). |
| `src/styles.css` | Design tokens on `:root` (light + dark), "Editorial greeting" app style: white sheet in a warm-stone frame, Instrument Sans body, Instrument Serif for the greeting only, one hue (teal) on data. |

## Rules for changes

- **Data model changes**: add fields as optional so old saved data still loads; if a field must be required, fill it in `normalizeState` and add a test in `src/lib/storage.test.ts`. Bump `version` and migrate only if a shape actually changes.
- **State changes go through the reducer.** Add an `Action` variant, keep the case pure (ids and timestamps come in on the action), and test it in `src/state/reducer.test.ts`.
- **Logic belongs in `src/lib`** as pure functions with unit tests; components stay thin.
- **Dates are local `DateKey` strings**; minutes-from-midnight for times of day.
- **Accessibility**: real buttons, `aria-pressed`/`aria-checked` for toggles, keyboard reachable blocks, visible focus. Check both themes and a 390px-wide viewport.
- **Design rules** (app-screen style, see `.taste-skill/plan.md` Part C and the dealt sheet `.taste-skill/app/direction.json`): every colour and font via a token; no shadows at rest, no gradients, no eyebrow labels, no emoji or glyph icons (inline SVG only), one filled near-black primary button per screen, h1 noun at 24px on every screen (the Today greeting is the one 48px serif), figures tabular (`.num`), nothing under 12px. The design inspector enforces this: `npx vite preview --port 4173 &` then `node <tasteskill>/scripts/inspect.mjs --app "http://localhost:4173/?demo=1#today"` (and `lint.mjs --app src`). Fix every FAIL.
- No new runtime dependencies without a reason; the bundle is React only.

## Workflow (uses the vendored ECC skills)

1. Non-trivial feature: use the `planner` agent or write a short plan first.
2. Write the failing test first: follow `tdd-workflow` (pure logic in `src/lib` and the reducer are the easy targets).
3. Implement following `react-patterns`, `typescript-patterns` and `frontend-patterns`; UI polish via `make-interfaces-feel-better` and `frontend-a11y`.
4. Verify with `verification-loop`, which here means:
   ```bash
   npm run typecheck && npm test && npm run build
   ```
   For UI changes also run the app (`npm run dev`) and click through the flow, or drive it with Playwright (`e2e-testing`).
5. Review with the `code-reviewer` / `react-reviewer` / `typescript-reviewer` agents before committing; `security-review` if touching import/export or anything that parses user files.
6. Commit with conventional messages (`git-workflow`).

ECC provenance and the full list of what was vendored: `.claude/ECC.md`.
