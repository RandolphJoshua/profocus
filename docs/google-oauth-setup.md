# Runbook: Google sign-in for ProFocus (Google Cloud + Supabase)

Goal: let ProFocus users sign in with Google through Supabase Auth. Everything happens in two web dashboards; no code changes, no secrets go into the repo. Work through the steps in order and report the values asked for at the end.

Account to use for both dashboards: the same Google account that owns the Supabase org `profocus`.

## Values you will need

| Name | Value |
|---|---|
| App name | ProFocus |
| Production URL | https://profocus-gilt.vercel.app |
| Supabase project ref | jdhefguipsmsmyhhpmun |
| Supabase auth callback (the one Google must allow) | https://jdhefguipsmsmyhhpmun.supabase.co/auth/v1/callback |
| Local dev URL | http://localhost:5173 |

## Part 1 — Google Cloud Console (https://console.cloud.google.com)

### 1.1 Project
1. Open the project picker (top bar) → **New project** → name `profocus` → Create. Wait for it, then select it.

### 1.2 OAuth consent screen (branding)
1. Left menu → **APIs & Services → OAuth consent screen** (in newer consoles this is **Google Auth Platform → Branding**).
2. If asked for user type: choose **External**.
3. App information: App name `ProFocus`; User support email = your own address.
4. App domain (optional fields can stay empty). Authorised domains: add `profocus-gilt.vercel.app` and `jdhefguipsmsmyhhpmun.supabase.co` (Google rejects the bare `vercel.app` / `supabase.co`: they are public suffixes).
5. Developer contact email = your own address. Save.
6. **Audience** (or "Publishing status"): leave the app in **Testing**. Under **Test users** add your own Google address (and any other address that should be able to sign in). Do **not** click Publish — publishing triggers Google's verification review and is not needed for personal use.

### 1.3 OAuth client
1. **APIs & Services → Credentials** (or **Google Auth Platform → Clients**) → **Create credentials → OAuth client ID**.
2. Application type: **Web application**. Name: `ProFocus web`.
3. **Authorised JavaScript origins** — add exactly:
   - `https://profocus-gilt.vercel.app`
   - `http://localhost:5173`
4. **Authorised redirect URIs** — add exactly one:
   - `https://jdhefguipsmsmyhhpmun.supabase.co/auth/v1/callback`
5. Create. A dialog shows the **Client ID** (ends in `.apps.googleusercontent.com`) and the **Client secret**. Keep this dialog open or download the JSON; you need both values in Part 2.

### 1.4 Calendar API (optional, for a later feature)
Only if asked to prepare Google Calendar access as well:
1. **APIs & Services → Library** → search **Google Calendar API** → Enable.
2. Back in **OAuth consent screen → Data access / Scopes** → Add scope `https://www.googleapis.com/auth/calendar.events` → Update → Save.
The `calendar.events` scope covers reading events (the import) and, if the user switches on **Settings → Account → Show my time blocks in Google Calendar**, adding time blocks as events. ProFocus only ever changes or deletes events it created itself (recognisable by their ProFocus-derived event id); every other event is read-only to it. Users who connected under the old read-only scope reconnect once from Settings.
Nothing else changes; the same client is reused.

### 1.5 Keep calendar sync alive (optional, recommended)
Google access tokens expire after about an hour and Supabase does not renew them. ProFocus renews them through a small Vercel function (`api/google-token.ts`) that needs the same OAuth client:
1. In Vercel → Project → **Settings → Environment Variables**, add **GOOGLE_CLIENT_ID** and **GOOGLE_CLIENT_SECRET** (the Client ID and Client secret from step 1.3, the same ones pasted into Supabase) for **Production** and **Preview**.
2. Redeploy. The function also reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, which are already set for the app.
3. Reconnect Google Calendar once from Settings → Account so Google issues a refresh token.

Without these variables sync still works, but only for about an hour after each Reconnect; the Week header then reads "reconnect needed". The secret is only used server-side and is never sent to the browser.

## Part 2 — Supabase dashboard (https://supabase.com/dashboard)

Open organization **profocus** → project **profocus**.

### 2.1 Enable the Google provider
1. Left menu → **Authentication → Sign In / Providers** (older UI: **Providers**).
2. Click **Google** → toggle **Enable Sign in with Google** on.
3. Paste **Client ID** and **Client Secret** from step 1.3.
4. Leave "Skip nonce check" off. Save.

### 2.2 URL configuration (needed for both Google and magic links)
1. **Authentication → URL Configuration**.
2. **Site URL**: `https://profocus-gilt.vercel.app`
3. **Redirect URLs** → add each of these, one per line:
   - `https://profocus-gilt.vercel.app/**`
   - `https://*-randolphjoshuas-projects.vercel.app/**`
   - `http://localhost:5173/**`
4. Save.

## Part 3 — Verify
1. Open https://profocus-gilt.vercel.app (sign in to Vercel first if it asks; the deployment is behind Vercel Authentication).
2. Go to **Settings → Account** → **Continue with Google** → pick the test-user account → you should land back on ProFocus with the Account section showing your email and "Synced".
3. If Google shows "Access blocked: ProFocus has not completed the Google verification process", the signing-in address is not in the **Test users** list (step 1.2.6).
4. If Google shows "redirect_uri_mismatch", the redirect URI in step 1.3.4 is not exactly `https://jdhefguipsmsmyhhpmun.supabase.co/auth/v1/callback`.

## Report back

Reply with:
- the Google Cloud project name/ID,
- the OAuth **Client ID** (safe to share; never paste the client secret anywhere except the Supabase provider form),
- confirmation that Site URL and the three redirect URLs are saved,
- the result of the Part 3 sign-in test (and the exact error text if it failed).
