# ProFocus

A personal planner for doing fewer things, better. Built for one person (me), runs entirely in the browser, keeps data in localStorage.

**Today**: pick one highlight, plan tasks, drag them onto a time-blocked day, run focus sessions, and close the day with a short shutdown ritual.
**Week**: a 7-day calendar; drag unscheduled tasks onto any day, move and resize blocks across days.
**Tasks**: inbox / today / upcoming / overdue, with projects and colours.
**Habits**: weekly check-offs, streaks and a 4-week heatmap.
**Review**: focus hours by day and project, highlights hit, habit consistency, and weekly reflection prompts.

## Quick-add

Type naturally in any task box:

```
Draft essay intro 45m tomorrow @9am #writing !high
```

| Token | Meaning |
|---|---|
| `#writing` | project (created if new) |
| `today` `tmr` `fri` `2026-12-01` `someday` | date |
| `45m` `1h30m` | estimate |
| `@9am` `@14:30` | also time-blocks it at that time |
| `!high` `!med` `!low` | priority |

Keyboard: `N` quick-add, `1`–`6` switch views, `Space` start/pause the timer.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` produces a static site in `dist/` you can host anywhere (Vercel, Netlify, GitHub Pages).

Back up from **Settings → Export JSON**. Data never leaves your browser.

## Development

```bash
npm test
npm run typecheck
```

Claude Code setup for this repo lives in `.claude/`: a `profocus` project skill plus a curated set of [ECC](https://github.com/affaan-m/ECC) skills, agents and rules (see `.claude/ECC.md`).
