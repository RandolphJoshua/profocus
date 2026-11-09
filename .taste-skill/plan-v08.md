# ProFocus v0.8 — reliable calendar sync + a dynamic UI pass

Read `CLAUDE.md`, `.claude/skills/profocus/SKILL.md`, `.taste-skill/plan.md` Part C (design rules), `.taste-skill/plan-calendar-write.md`. Rules as before: smallest complete change, tokens only, tests for new logic, no git commands, no attribution lines anywhere. Two agents work in parallel with strict file ownership (listed per part).

---

## Part C — calendar sync that keeps working (Agent C)

Owns: `src/state/auth.tsx`, `src/state/calendar.tsx`, `src/lib/calendar.ts` (+ test), new `src/lib/googleToken.ts` (+ test), new `api/google-token.ts`, `src/views/WeekView.tsx` (header only), `src/views/SettingsView.tsx` (Account section only), `docs/google-oauth-setup.md`, `README.md` (calendar paragraph only), `package.json` only if a dev type package is strictly needed.

### Problems being fixed (observed by the user: a block added in Week never reached Google)
1. The Google provider token lives only in React memory: a reload loses it and sync silently stops.
2. Google access tokens expire after ~1 h and nothing renews them.
3. Nothing on screen says *why* sync is not happening.

### C1. Keep the token across reloads — `src/lib/googleToken.ts` (pure + storage, tested)
```ts
export interface GoogleToken { accessToken: string; expiresAt: number; refreshToken?: string }
export function saveGoogleToken(t: GoogleToken | null): void      // localStorage 'profocus:gtoken', try/catch
export function loadGoogleToken(now = Date.now()): GoogleToken | null
export function isFresh(t: GoogleToken | null, now = Date.now()): boolean   // expiresAt - 60_000 > now
```
In `auth.tsx`: when a session arrives with `provider_token`, save `{ accessToken, expiresAt: now + 55 min, refreshToken: session.provider_refresh_token ?? previous.refreshToken }`. On mount, if no provider_token comes with the session, load the stored token. Expose `providerToken` (only while fresh) and `ensureGoogleToken(): Promise<string | null>` which returns a fresh token, refreshing it via C2 when expired and a refresh token exists. Sign-out clears the stored token. Never log tokens.

### C2. Renew it — Vercel function `api/google-token.ts`
A Node serverless function (Vercel runs files in `/api` automatically; write it as `export default async function handler(req, res)` with plain Node `IncomingMessage/ServerResponse` types — no new runtime dependency; use global `fetch`).
- `POST` only; body `{ refresh_token }`; header `Authorization: Bearer <supabase access token>`.
- Verify the caller: `GET ${process.env.VITE_SUPABASE_URL}/auth/v1/user` with headers `apikey: VITE_SUPABASE_PUBLISHABLE_KEY` and the caller's bearer → must be 200, else 401.
- Exchange: `POST https://oauth2.googleapis.com/token` form-encoded `client_id=GOOGLE_CLIENT_ID, client_secret=GOOGLE_CLIENT_SECRET, refresh_token, grant_type=refresh_token` → respond `{ access_token, expires_in }`. Missing env → `501 { error: 'not-configured' }`. Google error → `400 { error: <google error> }`. Never echo tokens or secrets in logs or errors.
- Client: `ensureGoogleToken` calls `/api/google-token` with the current Supabase session's `access_token`; on success save the new access token (keep the refresh token); on `501` or failure return null (status then reads "Reconnect").
- Add `api/` to `tsconfig` include only if needed for typecheck; it must not break `tsc --noEmit` or the Vite build (if Node types are missing, keep the file JS-typed via JSDoc or exclude `api/` from the app tsconfig — the app build must stay clean).

### C3. Use it in `calendar.tsx`
Every import / reconcile first calls `ensureGoogleToken()`; a 401 from Google triggers one refresh + retry, then `expired`. Import also runs on app load when `calendarConnected` and a fresh-or-refreshable token exist (not only right after OAuth). Keep every safety rule from plan-calendar-write (ids only via `eventIdFor`, never touch foreign events).
Add `syncNow(): Promise<void>` to `useCalendar()` = refresh (force) then reconcile. Expose `pending: number` = count of local blocks in the window not yet mirrored (from `planWrites` on the current state and own events) so the UI can show "2 waiting".

### C4. Visible status
- **Week header** (right side, under the nav): one 12px line + one text button, from `useCalendar()`:
  - connected + write on: "Google Calendar · synced 12:03" (or "· 2 waiting" / "· syncing…") and **Sync now**;
  - connected + write off: "Google Calendar · import only" and **Turn on sync** (sets `calendarWrite`);
  - expired / no token: "Google Calendar · reconnect needed" and **Reconnect** (calendar sign-in);
  - error: the error text in `--negative` and **Retry**;
  - not linked: nothing.
- **Settings → Account** calendar line: same states; under the write toggle add the line "Only blocks on the calendar grid sync. Drag a task onto a day, or give it a time like @3pm." 

### C5. Tests
`src/lib/googleToken.test.ts` (save/load/fresh/expiry, corrupt storage). `src/lib/calendar.test.ts` unchanged except anything you touch. A small test for the API handler's input validation is welcome (mock fetch + env), but keep it in `src/` or skip if the test environment can't import it cleanly.

### C6. Docs
`docs/google-oauth-setup.md`: new short section "Keep calendar sync alive" — add **GOOGLE_CLIENT_ID** and **GOOGLE_CLIENT_SECRET** (the same OAuth client as Supabase) to Vercel → Project → Environment Variables (Production + Preview), redeploy; without them sync works for an hour after each Reconnect. README calendar paragraph: one sentence on the same.

---

## Part U — make it feel alive (Agent U)

Owns: `src/App.tsx`, new `src/components/Toaster.tsx`, new `src/components/CommandPalette.tsx`, new `src/components/GettingStarted.tsx`, `src/components/TaskItem.tsx`, `src/components/DayColumn.tsx` (visual feedback only — do not change sync or data logic), `src/components/FocusTimer.tsx`, `src/views/TodayView.tsx`, new `src/motion.css` (import from `src/main.tsx` with one added line), `src/styles.css` (append only, at the end), tests in new files.
Do NOT touch: `src/state/*`, `src/lib/calendar.ts`, `src/views/WeekView.tsx`, `src/views/SettingsView.tsx`, `api/` (Agent C).

Design references (read before coding): `/root/.claude/skills/synced/1565b693-f868-4aa5-8795-1eb52de3aa00_92af7b0f-86fb-46f0-bcd0-057a4fe80e34/design-taste-frontend/references/motion.md` §4 Tokens, §6 "Press and hover", "Rolling figures", "Menu or dialog", §8 Reduced motion, §9–10; and `references/app-screens.md` (motion is feedback; keep it quiet and fast). The user explicitly asked for a more dynamic feel, so screen transitions are allowed, but every movement must be short (120–240 ms), transform/opacity only, and collapse to an instant change under `prefers-reduced-motion: reduce`.

### U1. Motion tokens and feedback (`src/motion.css`)
`--ease-out: cubic-bezier(0.22,1,0.36,1)`, `--ease-in-out`, `--t-press 120ms`, `--t-hover 150ms`, `--t-ui 200ms`, `--t-view 220ms`. Press (`:active` scale .97) on every `.btn`, `.check`, nav rows, chips; hover tone step on rows/cards; focus-visible ring unchanged. Reduced-motion block disables all of it.

### U2. Screen transitions (`App.tsx`)
Key the `<main>` content by view; the incoming screen fades in and rises 6px over `--t-view`. Use the View Transitions API when `document.startViewTransition` exists (wrap the `go()` state change), otherwise the CSS keyframe on mount. No exit animation, no layout jump, no delay to interactivity.

### U3. Toasts with Undo (`Toaster.tsx`)
A tiny toast host (bottom-centre on desktop, above the bottom nav on phones; `role="status"`, `aria-live="polite"`; floats, so a shadow is allowed). `toast(text, { action?: { label, run } })` via a context hook. Use it for: task completed → "Done · Undo" (Undo toggles back); task deleted → "Deleted · Undo" (re-add the exact task object); block deleted from the editor → "Block removed · Undo". Auto-dismiss after 5 s, pause on hover, max 3 stacked.

### U4. Task completion that feels good (`TaskItem.tsx`)
On check: the circle fills with a 160 ms scale pop, the title strike-through draws (`text-decoration-color` transition), then after ~600 ms the row collapses (grid-template-rows 1fr→0fr transition) out of the open list. Uncheck reverses without the collapse. Keyboard and screen-reader behaviour unchanged.

### U5. Live numbers (`TodayView.tsx` tiles, `FocusTimer.tsx`)
Today's four count tiles roll to their new value when it changes (motion.md "Rolling figures", ≤ 300 ms, tabular figures, no roll on first paint). The timer ring's progress keeps its smooth transition; the clock does not animate.

### U6. Timeline that follows the day (`TodayView.tsx` / `DayColumn.tsx`)
On first render of Today, the time-block panel scrolls so the now-line sits about a third from the top (smooth unless reduced motion). While dragging a block: the block lifts (scale 1.02 + floating shadow) and the target slot shows a tinted ghost; on drop it settles. Dropping a task onto the grid flashes the new block's background once (accent tint → normal, 400 ms).

### U7. Command palette (`CommandPalette.tsx`, opened with ⌘K / Ctrl+K and a small "Search ⌘K" text button at the top of the sidebar)
A modal list with a text field; arrow keys + Enter; Esc closes. Items, filtered by typed text: every screen ("Go to Week"…), "Plan my day", "Plan my week", "Start focus", "Add task: <typed text>" (uses the existing quick-add parser and actions, so `!high @3pm #project` work), and open tasks by title (Enter → start focus on that task). Full keyboard and screen-reader support (`role="dialog"`, `combobox`/`listbox` pattern, `aria-activedescendant`). Add it to the Settings shortcuts text? — no: Settings belongs to Agent C; mention it in the report instead.

### U8. Getting started (`GettingStarted.tsx` on Today, above the tiles)
For new users only: a compact panel with up to five steps, each a row with a check and a text button that goes to the right place: Sign in (Settings), Connect Google Calendar (Settings), Start a season (Seasons), Plan your week (Week), Plan your day (opens Plan my day). Steps tick themselves from real state (`useAuth`, `settings.calendarConnected`, `currentSeason`, this week's `plannedAt`, today's `plannedAt`). Hidden when all are done or after "Hide" (persist `settings.onboardingHidden` — add that optional field by dispatching `SET_SETTINGS`; do not edit `types.ts` beyond adding that one optional field if needed, coordinate by keeping it optional). Not shown in `?demo=1` sessions.

### U9. Verify
`npm run typecheck && npm test && npm run build`. Preview on port 4191; design inspector `--app` on `#today` and `#week` with `?demo=1`; open the 1440 and 390 screenshots. With Playwright: open the palette with Ctrl+K, add a task through it, complete it, press Undo, check the toast appears and the task returns. Kill the server. Report what you built, test count, inspector WARNs with one-line defences, and anything you could not verify.
