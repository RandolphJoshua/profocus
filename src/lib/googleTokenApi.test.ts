import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/google-token';

function run(req: { method?: string; headers?: Record<string, string>; body?: unknown }) {
  const out = { code: 0, body: undefined as unknown };
  const res = {
    status(c: number) {
      out.code = c;
      return res;
    },
    setHeader: () => undefined,
    json(b: unknown) {
      out.body = b;
    },
  };
  return handler({ headers: {}, ...req }, res).then(() => out);
}

const ENV = { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'pk', GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
const good = { method: 'POST', headers: { authorization: 'Bearer jwt' }, body: { refresh_token: 'r1' } };

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('api/google-token', () => {
  it('rejects non-POST', async () => expect((await run({ method: 'GET' })).code).toBe(405));
  it('answers 501 when the Google client is not configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    const out = await run(good);
    expect(out.code).toBe(501);
    expect(out.body).toEqual({ error: 'not-configured' });
  });
  it('rejects a missing bearer or refresh token', async () => {
    expect((await run({ ...good, headers: {} })).code).toBe(400);
    expect((await run({ ...good, body: {} })).code).toBe(400);
    expect((await run({ ...good, body: 'not json' })).code).toBe(400);
  });
  it('answers 401 when Supabase does not know the caller', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    expect((await run(good)).code).toBe(401);
  });
  it('returns a new access token and never echoes the secret', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('supabase') ? new Response('{}', { status: 200 }) : new Response(JSON.stringify({ access_token: 'new', expires_in: 3599 }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = await run(good);
    expect(out).toEqual({ code: 200, body: { access_token: 'new', expires_in: 3599 } });
    expect(JSON.stringify(out.body)).not.toContain('secret');
  });
  it('maps a Google error to 400', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.includes('supabase') ? new Response('{}') : new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }))),
    );
    expect(await run(good)).toEqual({ code: 400, body: { error: 'invalid_grant' } });
  });
});
