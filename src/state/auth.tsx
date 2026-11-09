import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isFresh, loadGoogleToken, saveGoogleToken, type GoogleToken } from '../lib/googleToken';
import { supabase } from '../lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
}
export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in';

interface AuthValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** Google access token from a Calendar sign-in, only while it is still fresh. Persisted in localStorage, renewed through /api/google-token. */
  providerToken: string | null;
  /** A fresh Google access token, renewing it first when needed (`force` renews even a fresh one). null when it cannot be had. */
  ensureGoogleToken: (opts?: { force?: boolean }) => Promise<string | null>;
  signInWithGoogle: (opts?: { calendar?: boolean }) => Promise<string | undefined>;
  sendMagicLink: (email: string) => Promise<string | undefined>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/** Google access tokens last an hour; assume a little less. */
const TOKEN_TTL_MS = 55 * 60_000;
const REFRESH_URL = '/api/google-token';
const MAX_TIMER_MS = 2_000_000_000;

const redirectUrl = () => window.location.origin + window.location.pathname;

/** Drop the OAuth `?code=` from the address bar after a redirect sign-in, keeping the hash. */
function stripAuthCode() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('code')) return;
  url.searchParams.delete('code');
  window.history.replaceState(null, '', url.pathname + url.search + url.hash);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<GoogleToken | null>(null);
  const tokenRef = useRef<GoogleToken | null>(null);
  const [, setTick] = useState(0);
  const refreshing = useRef<Promise<string | null> | null>(null);
  const [loading, setLoading] = useState(supabase !== null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let live = true;
    const keep = (t: GoogleToken | null) => {
      tokenRef.current = t;
      saveGoogleToken(t);
      setToken(t);
    };
    const apply = (session: { user: { id: string; email?: string }; provider_token?: string | null; provider_refresh_token?: string | null } | null) => {
      if (!live) return;
      setUser(session ? { id: session.user.id, email: session.user.email ?? '' } : null);
      if (!session) {
        keep(null);
        return;
      }
      const stored = tokenRef.current ?? loadGoogleToken();
      if (session.provider_token) {
        // The same token re-delivered by a later auth event keeps its original expiry.
        const same = stored?.accessToken === session.provider_token;
        const refreshToken = session.provider_refresh_token ?? stored?.refreshToken;
        keep({
          accessToken: session.provider_token,
          expiresAt: same ? stored.expiresAt : Date.now() + TOKEN_TTL_MS,
          ...(refreshToken ? { refreshToken } : {}),
        });
      } else if (!tokenRef.current && stored) {
        // Reload: Supabase no longer hands out the provider token, so use the one we kept.
        tokenRef.current = stored;
        setToken(stored);
      }
    };
    client.auth
      .getSession()
      .then(({ data }) => {
        apply(data.session);
        if (data.session) stripAuthCode();
      })
      .catch(() => apply(null))
      .finally(() => live && setLoading(false));
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      apply(session);
      if (session) stripAuthCode();
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async (opts?: { calendar?: boolean }) => {
    if (!supabase) return 'Cloud sync is not configured.';
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: opts?.calendar
          ? { redirectTo: redirectUrl(), scopes: CALENDAR_SCOPE, queryParams: { access_type: 'offline', prompt: 'consent' } }
          : { redirectTo: redirectUrl() },
      });
      return error?.message;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not start Google sign-in.';
    }
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    if (!supabase) return 'Cloud sync is not configured.';
    try {
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl() } });
      return error?.message;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not send the link.';
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch {
      // Local data is untouched either way; the next auth event settles the state.
    }
    setUser(null);
    tokenRef.current = null;
    saveGoogleToken(null);
    setToken(null);
  }, []);

  const ensureGoogleToken = useCallback(async (opts?: { force?: boolean }): Promise<string | null> => {
    const cur = tokenRef.current ?? loadGoogleToken();
    if (!cur) return null;
    if (!opts?.force && isFresh(cur)) return cur.accessToken;
    if (!cur.refreshToken || !supabase) return isFresh(cur) ? cur.accessToken : null;
    if (refreshing.current) return refreshing.current;
    const client = supabase;
    const refreshToken = cur.refreshToken;
    const run = async (): Promise<string | null> => {
      try {
        const { data } = await client.auth.getSession();
        const jwt = data.session?.access_token;
        if (!jwt) return null;
        const res = await fetch(REFRESH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
        if (typeof body.access_token !== 'string' || !body.access_token) return null;
        const ttl = typeof body.expires_in === 'number' && body.expires_in > 120 ? (body.expires_in - 300) * 1000 : TOKEN_TTL_MS;
        const next: GoogleToken = { accessToken: body.access_token, expiresAt: Date.now() + ttl, refreshToken };
        tokenRef.current = next;
        saveGoogleToken(next);
        setToken(next);
        return next.accessToken;
      } catch {
        return null;
      } finally {
        refreshing.current = null;
      }
    };
    refreshing.current = run();
    return refreshing.current;
  }, []);

  // Renew shortly before expiry so sync keeps working while the tab stays open; a failure just leaves the token stale.
  useEffect(() => {
    if (!token?.refreshToken) return;
    const wait = Math.min(Math.max(token.expiresAt - 60_000 - Date.now(), 0), MAX_TIMER_MS);
    // The tick re-renders so providerToken drops to null if the renewal failed.
    const t = setTimeout(() => void ensureGoogleToken().finally(() => setTick((n) => n + 1)), wait);
    return () => clearTimeout(t);
  }, [token, ensureGoogleToken]);

  const providerToken = token && isFresh(token) ? token.accessToken : null;

  const status: AuthStatus = supabase === null ? 'disabled' : loading ? 'loading' : user ? 'signed-in' : 'signed-out';
  const value = useMemo(() => ({ user, status, providerToken, ensureGoogleToken, signInWithGoogle, sendMagicLink, signOut }), [user, status, providerToken, ensureGoogleToken, signInWithGoogle, sendMagicLink, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
