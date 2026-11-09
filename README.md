# ProFocus

A personal planner for doing fewer things, better. Built for one person (me), runs entirely in the browser, keeps data in localStorage.

**Today**: a two-minute *Plan my day* ritual (triage → highlight → block time), the day's tasks, a time-blocked timeline, focus sessions, habits, this week's three priorities, and a shutdown ritual. The greeting line carries the day's one fact, your planned-days streak and today's score.
**Week**: a 7-day calendar with a *Plan my week* ritual (review last week → pick three priorities linked to goals → protect time for each). Drag tasks onto any day, move and resize blocks.
**Tasks**: inbox / today / upcoming / overdue, with projects that roll up to goals.
**Seasons**: its own screen. A 12-week (or 6/8/16) time box with a theme and the goals that get space; a week-by-week strip fills in as you plan each week; goals split into *this season* / *later*; closing a season asks what it taught you.
**AI coach (optional, your own key)**: Settings → AI coach takes an Anthropic Console API key (default model `claude-opus-5-5`; type `claude-haiku-5-5` for the cheapest), a Gemini key (free from Google AI Studio) or any OpenAI-compatible endpoint (Groq, OpenRouter). The key stays in your browser only. On Today, "Coach, read my day" writes a two-sentence note; in Plan my week, "Draft suggestions" proposes three priorities you can accept with one click. The coach sees titles and numbers, never your notes.
**Goals**: long-term goals with a why and a target date; progress from focus time, tasks done and weeks prioritised, plus a trajectory ("Day 8 of 127 · On track / Adjust / Off track").
**Focus mode**: one task, an intention line, the timer, optional brown noise, nothing else; rate each session rough / ok / flow (shown as focus quality on Review).
**Auto-plan**: "Schedule everything" in Plan my day chains your open tasks into the day's free slots; "Add all three" in Plan my week spreads the priorities over the week.
**Google Calendar**: sign in with Google and connect the calendar from Settings → Account; events for the current week ±1 appear as read-only blocks so planning works around them.
**Habits**: weekly check-offs, streaks and a 4-week heatmap.
**Review**: daily scores (40 highlight · 30 focus vs plan · 15 habits · 15 tasks), focus by day and project, highlights hit, and reflection prompts.

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

Keyboard: `N` quick-add, `1`–`8` switch views, `Space` start/pause the timer, `Esc` leaves focus mode.

Open `/?demo=1` on a fresh browser to see the app filled with sample data.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173. `npm run build` produces a static site in `dist/` you can host anywhere (Vercel, Netlify, GitHub Pages).

Back up from **Settings → Export JSON**. Without an account, data never leaves your browser.

## Optional account and cloud sync

Sign in (Google or a magic link) from **Settings → Account** and your whole planner is mirrored to a single row in Supabase, so it follows you across devices. Signed out, the app is local-only as before. The build needs two publishable values:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
```

Locally they go in `.env.local` (git-ignored); on Vercel, in the project's Environment Variables. The database side is one table, `public.planner_state`, with row-level security so each user can only read and write their own row (migration applied via Supabase; see `.taste-skill/plan-sync.md`).

## Development

```bash
npm test
npm run typecheck
```

Claude Code setup for this repo lives in `.claude/`: a `profocus` project skill plus a curated set of [ECC](https://github.com/affaan-m/ECC) skills, agents and rules (see `.claude/ECC.md`).
