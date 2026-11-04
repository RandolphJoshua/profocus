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
3. **Time-block** it: drag tasks onto the day/week timeline.
4. **Focus** in timed sessions linked to a task; sessions are logged.
5. **Shut down** at the end of the day: energy, note, tomorrow's highlight, roll over unfinished work.
6. **Review weekly**: focus by day and project, highlights hit, habit consistency, reflection.

## Map of the code

| Path | What it is |
|---|---|
| `src/lib/types.ts` | The whole data model (`AppState`). Start here. |
| `src/lib/date.ts` | Local `YYYY-MM-DD` date keys. Never use `toISOString().slice(0,10)` for "today" (it is UTC). |
| `src/lib/parse.ts` | Quick-add grammar: `#project`, `today/tmr/fri/YYYY-MM-DD/someday`, `45m/1h30m`, `@9am/@14:30`, `!high/!med/!low`. |
| `src/lib/stats.ts` | Pure derived numbers: focus minutes, streaks, weekly review stats. |
| `src/lib/storage.ts` | Load/save/normalise state; `normalizeState` is the trust boundary for imported JSON. |
| `src/state/reducer.ts` | Every state change is an `Action` handled by a pure reducer. `quickAddActions` turns a parsed line into actions. |
| `src/state/store.tsx` | Context provider, debounced persistence, cross-tab sync, `useToday`/`useNow`. |
| `src/state/timer.tsx` | Focus/break timer (wall-clock based, survives reloads), logs `FocusSession`s. |
| `src/components/DayColumn.tsx` | Pointer-driven timeline: drag to create, move (across days), resize, drop tasks. |
| `src/views/*` | One file per screen: Today, Week, Tasks, Habits, Review, Settings. |
| `src/styles.css` | Design tokens on `:root` (light + dark). Warm paper palette, Fraunces display + Inter body. |

## Rules for changes

- **Data model changes**: add fields as optional so old saved data still loads; if a field must be required, fill it in `normalizeState` and add a test in `src/lib/storage.test.ts`. Bump `version` and migrate only if a shape actually changes.
- **State changes go through the reducer.** Add an `Action` variant, keep the case pure (ids and timestamps come in on the action), and test it in `src/state/reducer.test.ts`.
- **Logic belongs in `src/lib`** as pure functions with unit tests; components stay thin.
- **Dates are local `DateKey` strings**; minutes-from-midnight for times of day.
- **Accessibility**: real buttons, `aria-pressed`/`aria-checked` for toggles, keyboard reachable blocks, visible focus. Check both themes and a 390px-wide viewport.
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
