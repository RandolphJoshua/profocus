/** Google access token kept across reloads. Never logged; lives in localStorage only, never in app state. */
export interface GoogleToken {
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
  refreshToken?: string;
}

const KEY = 'profocus:gtoken';
const SAFETY_MARGIN_MS = 60_000;

export function saveGoogleToken(t: GoogleToken | null): void {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked or full: the token then lives for this page load only.
  }
}

/** The stored token, even if expired, as long as it can still be renewed. */
export function loadGoogleToken(now = Date.now()): GoogleToken | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.accessToken !== 'string' || !o.accessToken || typeof o.expiresAt !== 'number') return null;
    const refreshToken = typeof o.refreshToken === 'string' && o.refreshToken ? o.refreshToken : undefined;
    const token: GoogleToken = { accessToken: o.accessToken, expiresAt: o.expiresAt, ...(refreshToken ? { refreshToken } : {}) };
    return isFresh(token, now) || refreshToken ? token : null;
  } catch {
    return null;
  }
}

export function isFresh(t: GoogleToken | null, now = Date.now()): boolean {
  return t !== null && t.expiresAt - SAFETY_MARGIN_MS > now;
}
