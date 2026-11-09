import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
}
export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in';

interface AuthValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** Google access token from a sign-in that asked for Calendar access. Memory only; Supabase does not refresh it. */
  providerToken: string | null;
  signInWithGoogle: (opts?: { calendar?: boolean }) => Promise<string | undefined>;
  sendMagicLink: (email: string) => Promise<string | undefined>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

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
  const [providerToken, setProviderToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(supabase !== null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let live = true;
    const apply = (session: { user: { id: string; email?: string }; provider_token?: string | null } | null) => {
      if (!live) return;
      setUser(session ? { id: session.user.id, email: session.user.email ?? '' } : null);
      // Token refreshes arrive without a provider token; keep the one we have until sign-out.
      if (!session) setProviderToken(null);
      else if (session.provider_token) setProviderToken(session.provider_token);
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
    setProviderToken(null);
  }, []);

  const status: AuthStatus = supabase === null ? 'disabled' : loading ? 'loading' : user ? 'signed-in' : 'signed-out';
  const value = useMemo(() => ({ user, status, providerToken, signInWithGoogle, sendMagicLink, signOut }), [user, status, providerToken, signInWithGoogle, sendMagicLink, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
