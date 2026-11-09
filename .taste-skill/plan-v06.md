# ProFocus v0.6 — Seasons screen + AI coach (bring your own key)

Read `CLAUDE.md`, `.claude/skills/profocus/SKILL.md`, `.taste-skill/plan.md` (Part C design rules), `.taste-skill/plan-seasons.md`. Same rules: smallest complete change, tokens only, no shadows at rest/gradients/emoji/glyph icons (inline SVG for icons, like the nav), one filled primary per screen, `.num` on figures, nothing under 12px, tests for new logic, no git commands, no attribution lines. Two agents in parallel with strict file ownership.

---

## Part S — Seasons as its own screen — Agent S

Owns: `src/App.tsx`, new `src/views/SeasonsView.tsx`, `src/components/SeasonPanel.tsx`, `src/views/GoalsView.tsx`, `src/features.css` (append), `src/views/SettingsView.tsx` **only** the shortcuts list text ("1–8"), `src/screens.test.tsx` (seasons test only), `src/lib/stats.ts` only if a new pure helper is needed (add at the end; tested).

### Nav
Add **Seasons** between Goals and Habits: Today 1 · Week 2 · Tasks 3 · Goals 4 · Seasons 5 · Habits 6 · Review 7 · Settings 8. Hash `#seasons`. Icon: a simple inline SVG (four small squares in a 2×2, or a quarter-circle arc) in the same stroke style as the others. Update the shortcuts text in Settings.

### Seasons screen (`src/views/SeasonsView.tsx`) — the screen's one question: "Where am I in this season?"
- h1 "Seasons"; grey line: "Autumn push · Week 5 of 12" when running, otherwise "No season running".
- **Running season — the big block** (tonal panel): name 20px/600, theme in grey, then the progress line, then a **week strip**: one cell per week of the season (W1…W12), 24px tall, in a row; past weeks filled `--accent` if that week had priorities planned (`reviews[weekStart].priorities?.length`) else `--rule`; the current week outlined 1px `--text`; future weeks `--panel`. Under it `.num` "7 of 12 weeks planned so far" (count planned among elapsed weeks). Then the season's goals as compact rows (title + trajectory pill, done ones struck through) with "Remove" text buttons, and an "Add a goal to this season" select of goals not in it (+ Add). Buttons: secondary **Edit season**, text **Close season**.
- **Not running — the empty state is an explainer, not a sentence**: three short numbered steps as plain paragraphs (no numbering glyphs; use "First / Then / Finally" words): "Pick a theme — what these weeks are about." / "Choose the goals that get the space; everything else waits." / "Plan each week against them; the strip fills in as you go." Then the **season form inline** (not a modal): Name, Theme, Start (default today), Length select 6/8/12/16 (default 12) with "Ends Sun 25 Jan", goal checkboxes, primary **Start season**. Reuse `SeasonForm`'s logic (export what you need from `SeasonPanel.tsx`; keep the modal version for *Edit*).
- **Past seasons**: always visible below (not collapsed) as rows: name · dates · "2 of 3 goals done" · review note in grey. "No past seasons yet." when none.
- Goals screen: replace the big panel with one line at the top: "Autumn push · Week 5 of 12 · 55 days left" with a text link "Open season →" to `#seasons` (or "No season running · Start one →"). Keep the *This season / Later* split and the per-row add/remove.
- Render test: visiting `#seasons` with no season shows the explainer and the inline form; starting one shows the week strip with 12 cells.
- Inspector on `#seasons` (running, with `?demo=1`) and `#goals`; also screenshot `#seasons` with an empty state (clear storage, no demo) at 1440 and 390.

---

## Part A — AI coach, bring your own key — Agent A

Owns: new `src/lib/ai.ts` (+ test), new `src/state/coach.tsx`, new `src/components/CoachNote.tsx`, `src/views/SettingsView.tsx` (a new "AI coach" section only — Agent S edits one text line elsewhere in that file; make your edit a self-contained block and do not reformat the file), `src/views/TodayView.tsx`, `src/components/PlanWeek.tsx`, `src/views/ReviewView.tsx`, `src/lib/types.ts` (two optional fields), `src/lib/storage.ts`, new `src/coach.css` (import it from `src/main.tsx` as one added line), tests.

### Why
Superfocus's remaining edge is coaching: "your coach drafts the week around your goals", daily/weekly notes, suggestions you can accept. We do the same with a model the user pays for (or gets free): Google's Gemini API has a free tier; Groq and OpenRouter expose free models behind an OpenAI-compatible endpoint. The key is the user's own and **never leaves their browser**: it is stored in `localStorage` under `profocus:ai` (not in `AppState`, so it is never synced to Supabase).

### `src/lib/ai.ts` — pure + one fetch wrapper, tested with a mocked `fetch`
```ts
export type Provider = 'gemini' | 'openai-compatible';
export interface AiConfig { provider: Provider; apiKey: string; model: string; baseUrl?: string }  // baseUrl only for openai-compatible, e.g. https://api.groq.com/openai/v1 or https://openrouter.ai/api/v1
export const DEFAULT_MODELS: Record<Provider, string> = { gemini: 'gemini-3.8-flash', 'openai-compatible': 'llama-3.3-70b-versatile' };
export function loadAiConfig(): AiConfig | null; export function saveAiConfig(c: AiConfig | null): void;   // localStorage, try/catch
export interface CoachContext { today: DateKey; season?: {...}; goals: {title, status, trajectory}[]; priorities: {title, done}[]; todayTasks: {title, done, estimateMin, blocked: boolean}[]; blocks: {title, start, end, kind}[]; lastWeek?: {focusTotal, tasksCompleted, highlightsDone, highlightsSet, habitRate, scoreMean}; openCount: number; overdueCount: number; highlight?: {text, done} }
export function buildContext(state: AppState, today: DateKey, weekStart: DateKey): CoachContext   // titles only: never notes, never emails
export const SYSTEM_PROMPT: string   // "You are a calm, concrete productivity coach… answer in plain sentences, no emoji, no headings, under 90 words for notes; for suggestions return JSON {"suggestions":[{"text":"…","title":"…"}]}"
export async function complete(cfg: AiConfig, system: string, user: string, opts?: { json?: boolean }): Promise<string>
```
`complete`: Gemini → `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` with header `x-goog-api-key`, body `{ system_instruction: {parts:[{text}]}, contents:[{role:'user',parts:[{text}]}], generationConfig: { temperature: 0.4, ...(json ? { response_mime_type: 'application/json' } : {}) } }`, read `candidates[0].content.parts[0].text`. OpenAI-compatible → `POST {baseUrl}/chat/completions` with `Authorization: Bearer`, `{ model, messages:[{role:'system'},{role:'user'}], temperature: 0.4, ...(json ? { response_format: { type: 'json_object' } } : {}) }`, read `choices[0].message.content`. Non-2xx → throw `Error` with the provider's message (first 200 chars). 20 s timeout via `AbortController`. Tests: both request shapes (URL, headers, body), both response parsers, error path, timeout.
`export function parseSuggestions(text: string): { text: string; title?: string }[]` — tolerant: strips code fences, takes the first JSON object, returns [] on failure. Tested.

### Types
`DayPlan.coachNote?: { text: string; at: string }`; `WeeklyReview.coachSuggestions?: { text: string; title?: string }[]`. Optional, so old data loads.

### `src/state/coach.tsx` — `CoachProvider` + `useCoach()`
`{ enabled: boolean, config: AiConfig | null, setConfig(c|null), busy: boolean, error?: string, dailyNote(): Promise<void>, weeklySuggestions(weekStart): Promise<void>, test(): Promise<string> }`.
- `dailyNote()`: builds the context, asks for one note of ≤ 2 sentences about **today** (what is protected, what has no slot, the one thing to do first), stores `SET_DAY {coachNote:{text, at}}`. Never auto-runs more than once per day: Today shows a button if `days[today].coachNote` is missing or older than the day; the user clicks.
- `weeklySuggestions(weekStart)`: asks for exactly 3 suggestions (JSON) for this week, grounded in last week's numbers, the season and goals; stores them on `reviews[weekStart].coachSuggestions` via `SET_REVIEW`.
- `test()`: sends "Reply with the single word OK." and returns the text.
- Every call catches errors into `error`; nothing throws to the UI.

### UI
- **Settings → new section "AI coach"** (two-column row like the others): provider select (Gemini · OpenAI-compatible), API key input (`type="password"`, autocomplete off) with the sentence "Stays in this browser. Never synced." in grey, model input prefilled with the default, base URL input (OpenAI-compatible only; placeholder `https://api.groq.com/openai/v1`), buttons: secondary **Save**, text **Test** (shows "OK — connected" or the error), text **Remove key**. Under the form, 12px grey: "Free options: Google AI Studio (Gemini) · Groq · OpenRouter free models. The coach sees your goal, priority and task titles plus this week's numbers — never your notes." No primary button.
- **Today** (`CoachNote` component under the greeting line, above the tiles; only when `enabled`): if a note exists for today → the note text at 14px with a 12px grey "Coach · 09:12 · Refresh" line; else a secondary button **Coach, read my day** (busy → "Thinking…"); error in `--negative`. When not enabled, render nothing.
- **Plan my week, step 1** (only when `enabled`): under the stats strip, a secondary button **Draft suggestions** → three suggestions as rows: text, and when `title` is present a text button **Use as priority** that fills the first empty priority slot in step 2's local state (the component owns both). Re-draft replaces them.
- **Review**: if `reviews[weekStart].coachSuggestions` exists, show them as a small panel "Coach's suggestions for this week" (read-only). Nothing otherwise.
- Keep everything visually quiet: no robot icons, no sparkle glyphs.

### Tests
`src/lib/ai.test.ts` (shapes, parsers, parseSuggestions, timeout). `src/state/coach.test.tsx`: with no config, Today renders no coach UI and Settings shows the form; with a config in localStorage and `fetch` mocked to return a Gemini-shaped response, clicking "Coach, read my day" stores the note and renders it.

---

## Verify (both)
`npm run typecheck && npm test && npm run build`; previews on 4181 (S) / 4182 (A); inspector on your screens with `?demo=1`; look at 1440 and 390 screenshots; kill your server. Report what you built, test count, remaining WARNs with a one-line defence, what you could not verify (A: a live model call).
