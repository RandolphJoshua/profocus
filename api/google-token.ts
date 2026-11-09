/**
 * Vercel serverless function: exchange a Google refresh token for a new access token.
 * The caller proves who they are with their Supabase access token. Tokens and secrets are never logged or echoed.
 */
interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
}
declare const process: { env: Record<string, string | undefined> };

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const header = (req: Req, name: string): string => {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? '';
};

function refreshTokenOf(body: unknown): string | null {
  let b = body;
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      return null;
    }
  }
  if (typeof b !== 'object' || b === null) return null;
  const t = (b as Record<string, unknown>).refresh_token;
  return typeof t === 'string' && t.length > 0 && t.length < 2048 ? t : null;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method-not-allowed' });
    return;
  }
  const { VITE_SUPABASE_URL: supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: supabaseKey, GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
  if (!clientId || !clientSecret || !supabaseUrl || !supabaseKey) {
    res.status(501).json({ error: 'not-configured' });
    return;
  }
  const auth = header(req, 'authorization');
  const refreshToken = refreshTokenOf(req.body);
  if (!/^Bearer\s+\S+$/i.test(auth) || !refreshToken) {
    res.status(400).json({ error: 'bad-request' });
    return;
  }
  try {
    const who = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: auth } });
    if (!who.ok) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const google = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    });
    const data = (await google.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
    if (!google.ok || typeof data.access_token !== 'string') {
      res.status(400).json({ error: typeof data.error === 'string' ? data.error : 'refresh-failed' });
      return;
    }
    res.status(200).json({ access_token: data.access_token, expires_in: typeof data.expires_in === 'number' ? data.expires_in : 3600 });
  } catch {
    res.status(502).json({ error: 'upstream-unreachable' });
  }
}
