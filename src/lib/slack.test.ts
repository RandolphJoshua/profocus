import { SLACK_KEY, clearStatusParams, endFocusStatus, focusStatusParams, loadSlackConfig, saveSlackConfig, slackCall, startFocusStatus, testSlack, validateToken, type SlackConfig } from './slack';

const cfg: SlackConfig = { token: 'xoxp-abc', text: 'Focusing', emoji: ':headphones:', withTask: false, dnd: true };
const reply = (body: unknown) => vi.fn((..._a: Parameters<typeof fetch>) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
const methods = (f: ReturnType<typeof reply>) => f.mock.calls.map((c) => String(c[0]).replace('https://slack.com/api/', ''));
const profileOf = (p: URLSearchParams) => JSON.parse(p.get('profile') ?? '{}') as Record<string, unknown>;

beforeEach(() => localStorage.clear());

describe('focusStatusParams', () => {
  it('uses only the task title when status text is empty and the task name is on', () => {
    const cfg: SlackConfig = { token: 'xoxp-1', text: '', emoji: ':dart:', withTask: true, dnd: false };
    const status = (title?: string) => JSON.parse(focusStatusParams(cfg, { minutes: 25, taskTitle: title, nowMs: 0 }).get('profile') ?? '{}').status_text;
    expect(status('Finish chapter 3 outline')).toBe('Finish chapter 3 outline');
    expect(status(undefined)).toBe('Focusing');
  });

  const nowMs = 1_700_000_000_000;
  it('sets text, emoji and an expiration minutes ahead', () => {
    const p = focusStatusParams(cfg, { minutes: 25, taskTitle: 'Write', nowMs });
    expect(p.get('token')).toBe('xoxp-abc');
    expect(profileOf(p)).toEqual({ status_text: 'Focusing', status_emoji: ':headphones:', status_expiration: 1_700_000_000 + 1500 });
  });
  it('adds the task title only when withTask is on', () => {
    expect(profileOf(focusStatusParams({ ...cfg, withTask: true }, { minutes: 5, taskTitle: 'Write', nowMs })).status_text).toBe('Focusing · Write');
    expect(profileOf(focusStatusParams({ ...cfg, withTask: true }, { minutes: 5, nowMs })).status_text).toBe('Focusing');
  });
  it('cuts the text to 100 characters', () => {
    const text = profileOf(focusStatusParams({ ...cfg, withTask: true }, { minutes: 5, taskTitle: 'x'.repeat(300), nowMs })).status_text as string;
    expect(text).toHaveLength(100);
  });
});

it('clearStatusParams empties text and emoji with expiration 0', () => {
  expect(profileOf(clearStatusParams('xoxp-abc'))).toEqual({ status_text: '', status_emoji: '', status_expiration: 0 });
});

describe('slackCall', () => {
  it('posts form-encoded params with no custom headers', async () => {
    const f = reply({ ok: true });
    await slackCall('auth.test', new URLSearchParams({ token: 't' }), f);
    const [url, init] = f.mock.calls[0] ?? [];
    expect(url).toBe('https://slack.com/api/auth.test');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeInstanceOf(URLSearchParams);
  });
  it.each([
    ['invalid_auth', 'Slack rejected the token. Make a new one.'],
    ['token_revoked', 'Slack rejected the token. Make a new one.'],
    ['account_inactive', 'Slack rejected the token. Make a new one.'],
    ['missing_scope', 'The token is missing a scope: add users.profile:write (and dnd:write for Do Not Disturb).'],
    ['not_allowed_token_type', "That's a bot token. Use the User OAuth Token (starts with xoxp-)."],
    ['ratelimited', 'Slack is rate-limiting; try again in a minute.'],
    ['weird', 'Slack error: weird'],
  ])('maps %s', async (code, message) => {
    await expect(slackCall('x', new URLSearchParams(), reply({ ok: false, error: code }))).rejects.toThrow(message);
  });
  it('reports a network failure', async () => {
    await expect(slackCall('x', new URLSearchParams(), vi.fn(() => Promise.reject(new TypeError('fail'))))).rejects.toThrow("Couldn't reach Slack.");
  });
});

describe('start and end', () => {
  it('start sets the profile then snoozes for the minutes', async () => {
    const f = reply({ ok: true });
    await startFocusStatus(cfg, 25, undefined, f);
    expect(methods(f)).toEqual(['users.profile.set', 'dnd.setSnooze']);
    expect((f.mock.calls[1]?.[1]?.body as URLSearchParams).get('num_minutes')).toBe('25');
  });
  it('skips DND when it is off', async () => {
    const f = reply({ ok: true });
    await startFocusStatus({ ...cfg, dnd: false }, 25, undefined, f);
    await endFocusStatus({ ...cfg, dnd: false }, f);
    expect(methods(f)).toEqual(['users.profile.set', 'users.profile.set']);
  });
  it('end clears the profile then ends the snooze', async () => {
    const f = reply({ ok: true });
    await endFocusStatus(cfg, f);
    expect(methods(f)).toEqual(['users.profile.set', 'dnd.endSnooze']);
  });
  it('ignores snooze_not_active but surfaces other errors', async () => {
    const calls = [{ ok: true }, { ok: false, error: 'snooze_not_active' }];
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify(calls.shift()))));
    await expect(endFocusStatus(cfg, f)).resolves.toBeUndefined();
    const g = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'missing_scope' }))));
    await expect(endFocusStatus(cfg, g)).rejects.toThrow('missing a scope');
  });
});

it('testSlack names the user and team', async () => {
  expect(await testSlack('xoxp-abc', reply({ ok: true, user: 'ann', team: 'Acme' }))).toBe('Connected as ann in Acme');
});

describe('validateToken', () => {
  it('explains each failure and accepts user tokens', () => {
    expect(validateToken('  ')).toBe('Paste a token first.');
    expect(validateToken('xoxb-1')).toBe("That's a bot token. Use the User OAuth Token (starts with xoxp-).");
    expect(validateToken('abc')).toBe('User tokens start with xoxp-.');
    expect(validateToken('xoxp-1')).toBeNull();
  });
});

describe('config storage', () => {
  it('round-trips and removes', () => {
    saveSlackConfig(cfg);
    expect(loadSlackConfig()).toEqual(cfg);
    saveSlackConfig(null);
    expect(loadSlackConfig()).toBeNull();
  });
  it('returns null for corrupt or wrong-shape storage', () => {
    localStorage.setItem(SLACK_KEY, '{not json');
    expect(loadSlackConfig()).toBeNull();
    localStorage.setItem(SLACK_KEY, JSON.stringify({ token: 1 }));
    expect(loadSlackConfig()).toBeNull();
    localStorage.setItem(SLACK_KEY, 'null');
    expect(loadSlackConfig()).toBeNull();
  });
});
