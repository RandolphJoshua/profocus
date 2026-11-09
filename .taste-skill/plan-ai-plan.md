# Plan with AI — tasks and time blocks from a prompt

The user asked: "can I use AI to create tasks, or schedule my day, based on a prompt?" Build a **Plan with AI** dialog. The user
types a request, the model (the AI coach config they already have, BYO key in `profocus:ai`) proposes concrete changes, the
user sees them as a checklist, and **nothing changes until they press Apply**. Undo is available after.

Example prompts it must handle well:
- "Plan my afternoon: 2h on the WABA fix, lunch at 12:30, gym at 6"
- "Break 'Update franchisee check in site' into tasks and schedule them tomorrow morning"
- "Schedule my inbox for tomorrow, high priority first"
- "Add: call Tom about the Excel mapping, 15m, high"

## `src/lib/aiPlan.ts` (+ `aiPlan.test.ts`)
- `buildPlanRequest(state, { today, nowMin, prompt })` returns `{ system, user }`.
  - **The user message** is compact JSON context plus the prompt. Fields:
    - `today` (date and weekday), `now` (HH:MM), and the working day from `settings.dayStartHour` to `settings.dayEndHour`
    - `projects` as `[{name}]`
    - open tasks, at most 80: `[{id, title, estimateMin?, priority?, project?, date?}]`
    - existing blocks for today and the next 6 days: `[{date, start:"HH:MM", end:"HH:MM", title, fixed: true}]`, including Google
      events, so the model plans around them
  - **The system prompt** says, in substance:
    - You are a scheduling assistant for a personal planner.
    - Return **only** JSON matching the schema below.
    - Never move or delete existing blocks.
    - Do not overlap existing blocks or each other.
    - Keep blocks inside the working day, and never before `now` on today.
    - Use 15-minute boundaries.
    - Reuse existing tasks by `id` when the request refers to them.
    - Create new tasks only when needed.
    - Estimates are in minutes.
    - Write titles as plain verbs with no emoji.
    - The `summary` is one short sentence.
    - If the request is not about tasks or scheduling, return empty arrays with a summary saying so.
- **Schema** (the model output):
  ```json
  { "summary": "string",
    "newTasks": [{ "ref": "t1", "title": "string", "estimateMin": 30, "priority": "high|med|low", "project": "name", "date": "YYYY-MM-DD" }],
    "blocks":   [{ "date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM", "title": "string", "kind": "focus|meeting|personal|break", "taskId": "existing id", "taskRef": "t1" }],
    "taskUpdates": [{ "taskId": "existing id", "date": "YYYY-MM-DD", "priority": "high|med|low", "estimateMin": 30 }] }
  ```
  Every field except `title`/`date`/`start`/`end` is optional.
- **`parsePlan(text, state, { today, nowMin })`** is the trust boundary. It is pure and returns `{ summary, items: PlanItem[], dropped: string[] }`.
  - Extract the first JSON object, tolerating code fences.
  - Validate every field. Titles: trimmed, 1-120 chars. Dates: valid, from today up to 60 days ahead. Times: snapped to 15 minutes, inside
    the working day, `end > start`, and not before now on today. Blocks must not overlap existing blocks or each other.
  - Priorities and kinds must be in their enum. `estimateMin` is 5-480.
  - `taskId` must exist and be open. Match `project` by name, case-insensitively, against existing non-archived projects, or drop it.
  - `taskRef` must point at a `newTasks` ref.
  - Cap at 25 new tasks, 25 blocks and 25 updates.
  - Anything invalid is dropped with a short human reason in `dropped`, for example "Skipped ‘Gym’ 18:00–19:00: overlaps Dinner".
  - `PlanItem` is a discriminated union, `{ kind: 'task' | 'block' | 'update', id: string (local key), label: string, detail: string, ... }`,
    and carries what `toActions` needs.
- **`toActions(items, selectedIds, now)`** turns the selected items into reducer actions:
  - `ADD_TASK` with fresh ids (`uid()`)
  - `ADD_BLOCK`, with `taskId` resolved from a `taskRef` to the new task's id. If the referenced task was not selected, drop the link but keep the block.
  - `UPDATE_TASK`, recording the previous values for undo
  - It also returns an `undo` action list: `DELETE_TASK`/`DELETE_BLOCK` for the added items, and `UPDATE_TASK` back to the old values. Check the
    reducer for the exact action names.
- **Tests:** a valid plan parsed; fences tolerated; overlap with an existing block dropped with its reason; outside working hours dropped;
  before now dropped; an unknown `taskId` dropped; `taskRef` resolution, including the ref's task being unselected; project matching; the
  caps; `toActions` with undo restoring state (run the real reducer); `buildPlanRequest` includes Google blocks and caps tasks.

## `src/lib/ai.ts`
Extend `complete(cfg, system, user, opts)` with `opts.maxTokens` (default unchanged, 1024) and, for Anthropic,
`opts.effort` (default `'low'`). For a plan, use `maxTokens: 4096` and `effort: 'medium'`. For Gemini and OpenAI-compatible,
pass `json: true` and map `maxTokens` to their fields if trivial: `generationConfig.maxOutputTokens` and `max_tokens`. Keep the existing coach calls
unchanged, and keep the current tests green.

## UI: `src/components/AiPlanDialog.tsx`
A native `<dialog>`, styled like the other modals (PlanDay/PlanWeek).
- **Title** "Plan with AI".
- **The prompt.** A textarea with the placeholder "e.g. Plan my afternoon: 2h on the WABA fix, lunch at 12:30, gym at 6", plus 3 example chips
  that fill it: "Plan the rest of my day", "Schedule my inbox for tomorrow", "Break a task into steps".
  Pressing ⌘/Ctrl+Enter generates.
- **Generate** shows a busy state, "Thinking…", then the preview:
  - the summary
  - grouped lists, **New tasks**, **Time blocks** (shown as "Tue 10 · 13:00–15:00 · WABA fix") and **Changes**, each row with a checkbox, all
    checked by default
  - the dropped reasons in a muted "Skipped" list, if any
- **Apply N** dispatches one `BATCH` and closes. It then shows a toast, "Added 3 tasks and 4 blocks", with **Undo**, which dispatches the undo `BATCH`.
- **Errors.** AI errors show inline, using the coach's error text.
- **No AI configured.** The dialog shows "Set up the AI coach first" with a link to `#settings`.
- **How it opens.** Through a small context or event, the same way App opens Plan my day/week from the palette. Entry points:
  1. A **"Plan with AI"** button on Today, in the header next to Re-plan. Show it only when the AI is configured.
  2. The same button on Week, in the header tools.
  3. A **command palette** item. When the AI is configured and the query is non-empty, show "Ask AI: <query>", which opens the dialog with the
     prompt prefilled and generates at once. Also show a plain "Plan with AI" command.
- **Accessibility.** Label the textarea, give the checkboxes labels, announce results with `role="status"`, and return focus on close.

## Docs
- `docs/GUIDE.md`: a section "Plan with AI" with the examples.
- `README.md`: one feature line.

## Constraints
- Do not touch `api/`, `src/lib/calendar*`, `src/state/calendar.tsx`, `src/state/auth.tsx`, `src/state/sync.tsx`, `src/lib/slack.ts` or
  `src/lib/monday.ts`.
- No new dependencies. No `console.log`. Never log the API key or put it in the UI.
- Files stay under about 300 lines; split `aiPlan.ts` if needed.

## Verify
- `npm run typecheck && npm test && npm run build` must all pass.
- Playwright on `vite preview` with `?demo=1`. Set a fake AI config in localStorage. Route-mock the provider endpoint, or mock at
  the module level, to return a canned plan JSON. Open the dialog, generate, uncheck one item, apply, and check that the tasks and blocks appear; then
  Undo. Screenshot the dialog preview at 1440 and 390 and look at it.
- No git commands. Report:
  - the files changed
  - the tests added
  - the screenshot paths
  - anything not verified (a real model call is not possible here)
