# ProFocus v0.3 — optional account + cloud sync (Supabase)

Read `CLAUDE.md` and `.claude/skills/profocus/SKILL.md` first. Rules from `.taste-skill/plan.md` still hold: smallest complete change, tokens-only styling, no shadows/gradients/emoji, one primary button per screen, tests for new logic, no git commands, no attribution lines anywhere.

## Intent

ProFocus works entirely in localStorage today. Add an **optional** account so the same data follows the user across devices. Signed out, nothing changes. Signed in, the whole `AppState` is mirrored to one row in Supabase and pulled back on other devices. One user, one row; last writer wins, with a one-time guard against overwriting real data.

Auth methods: **Google** (`signInWithOAuth`) and **magic link** (`signInWithOtp`, email only). No passwords.

## Backend (already provisioned by the orchestrator — you do not create it)

Table `public.planner_state`:
```sql
user_id    uuid primary key references auth.users(id) on delete cascade
state      jsonb not null
updated_at timestamptz not null default now()
```
RLS on; the signed-in user can select / insert / update only `user_id = auth.uid()`.

## Env (Vite exposes `VITE_*` to the browser; both are publishable values, safe in the bundle)

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`. Add `.env.example` with both names and empty values. `.env.local` is already git-ignored. Never read or write any other key.

## Dependency

`npm install @supabase/supabase-js@2` (the one justified runtime dependency; pin whatever 2.x npm resolves).

## Code

### `src/lib/supabase.ts`
```ts
export const supabase: SupabaseClient | null   // null when either env var is missing → app is local-only, exactly as today
```

### `src/lib/sync.ts` — pure logic, unit-tested
```ts
export type SyncChoice = 'remote' | 'local' | 'ask';
/** Decide what to do on sign-in. `localTouched` = local state differs from `emptyState()` (has any task/block/session/habit/goal). */
export function chooseSource(args: { localTouched: boolean; localSavedAt?: string; remote?: { updatedAt: string; touched: boolean } }): SyncChoice
```
Rules: no remote row → `'local'` (upload). Remote exists and local untouched → `'remote'`. Remote exists but untouched (empty state) → `'local'`. Both touched → `'ask'` (the user picks once). Also `export function isTouched(state: AppState): boolean`.

`src/lib/storage.ts`: `saveState` also writes `profocus:savedAt` = ISO now (wrapped in the same try/catch); add `loadSavedAt()`.

### `src/state/auth.tsx` — `AuthProvider` + `useAuth()`
Exposes `{ user: { id, email } | null, status: 'disabled' | 'loading' | 'signed-out' | 'signed-in', signInWithGoogle(), sendMagicLink(email), signOut() }`. `status === 'disabled'` when `supabase` is null. Uses `supabase.auth.getSession()` once and `onAuthStateChange` for updates; clean up the subscription. After a redirect sign-in, strip `?code=…` from the URL with `history.replaceState` (keep the hash). `redirectTo` / `emailRedirectTo` = `window.location.origin + window.location.pathname`.

### `src/state/sync.tsx` — `SyncProvider` (inside `StoreProvider` and `AuthProvider`)
- When `user` becomes non-null: fetch the row. Run `chooseSource`. `'remote'` → `dispatch({type:'REPLACE_STATE', state: normalizeState(row.state)})`. `'local'` → upsert local. `'ask'` → render a `Modal` "Which data should this device use?" with two secondary buttons: "Use cloud data (from <date>)" and "Keep this device's data and upload it" plus a one-line explanation that the other copy is replaced. No primary button. The choice is applied once; nothing happens until chosen.
- After that, every state change → debounced 1500 ms upsert `{ user_id, state, updated_at: now }`. Skip the upsert for a `REPLACE_STATE` that came from the cloud (use a ref flag). Keep the last pushed `updated_at` in a ref.
- On `visibilitychange` → visible (and on `focus`): fetch the row's `updated_at` only; if newer than our last pushed/pulled stamp, fetch the state and `REPLACE_STATE` it (another device wrote). Cheap, no realtime.
- Expose `useSync(): { status: 'off' | 'syncing' | 'synced' | 'error', lastSyncAt?: string, error?: string }`. Errors: catch every Supabase call; set `status: 'error'` with the message; never throw, never lose local data (localStorage keeps saving as before).
- Signing out: stop syncing, keep local data as is (do not wipe).

### UI
- **Settings → new first section "Account"** (same two-column row pattern as the others). `disabled`: grey sentence "Cloud sync is not configured on this build." `signed-out`: an email input + secondary button "Send magic link" (then "Check your email for the link." as a status line), and a secondary button "Continue with Google". `signed-in`: the email, "Synced · last saved 12:03" / "Syncing…" / the error text in `--negative`, and a text button "Sign out". No primary button in this section.
- **Sidebar**: under the timer, one 12px grey line: "Synced" / "Syncing…" / "Sync error" / nothing when disabled or signed out. On the phone bottom bar, nothing.
- Lint/inspect rules unchanged; no new colours.

### Tests
`src/lib/sync.test.ts` for `chooseSource` (all four branches) and `isTouched`. `src/state/auth.test.tsx`: with `supabase` null the Account section renders the "not configured" sentence and the sidebar shows no sync line (mock `../lib/supabase` to export `null`). Keep all existing tests green.

### Verify
`npm run typecheck && npm test && npm run build`. Then `npx vite preview --port 4173 &`, open `http://localhost:4173/?demo=1#settings` with Playwright and screenshot the Account section at 1440 and 390 (`.taste-skill/sync-settings/`), look at both (Read tool), kill the preview. Report: what you built, the test count, and what you could not verify without a live project (the OAuth round-trip and the upsert).
