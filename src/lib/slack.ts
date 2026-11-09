/** Slack status while focusing. The user token lives only in localStorage under SLACK_KEY, never in AppState. */
export interface SlackConfig {
  token: string;
  text: string;
  emoji: string;
  withTask: boolean;
  dnd: boolean;
}

export const SLACK_KEY = 'profocus:slack';
export const DEFAULT_SLACK: Omit<SlackConfig, 'token'> = { text: 'Focusing', emoji: ':headphones:', withTask: false, dnd: true };

const SLACK_API = 'https://slack.com/api/';
const STATUS_MAX = 100;
const SECONDS_PER_MINUTE = 60;

const BOT_TOKEN_MESSAGE = "That's a bot token. Use the User OAuth Token (starts with xoxp-).";

export class SlackError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'SlackError';
    this.code = code;
  }
}

export function loadSlackConfig(): SlackConfig | null {
  try {
    const raw = localStorage.getItem(SLACK_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.token !== 'string' || !o.token || typeof o.text !== 'string' || typeof o.emoji !== 'string' || typeof o.withTask !== 'boolean' || typeof o.dnd !== 'boolean') return null;
    return { token: o.token, text: o.text, emoji: o.emoji, withTask: o.withTask, dnd: o.dnd };
  } catch {
    return null;
  }
}

export function saveSlackConfig(c: SlackConfig | null): void {
  try {
    if (c) localStorage.setItem(SLACK_KEY, JSON.stringify(c));
    else localStorage.removeItem(SLACK_KEY);
  } catch {
    /* storage unavailable: the config just won't persist */
  }
}

export function validateToken(t: string): string | null {
  const token = t.trim();
  if (!token) return 'Paste a token first.';
  if (token.startsWith('xoxb-')) return BOT_TOKEN_MESSAGE;
  if (!token.startsWith('xoxp-')) return 'User tokens start with xoxp-.';
  return null;
}

interface FocusInfo {
  minutes: number;
  taskTitle?: string;
  nowMs: number;
}

export function focusStatusParams(cfg: SlackConfig, { minutes, taskTitle, nowMs }: FocusInfo): URLSearchParams {
  const title = taskTitle?.trim();
  const text = (cfg.withTask && title ? `${cfg.text} · ${title}` : cfg.text).slice(0, STATUS_MAX);
  const profile = { status_text: text, status_emoji: cfg.emoji, status_expiration: Math.floor(nowMs / 1000) + minutes * SECONDS_PER_MINUTE };
  return new URLSearchParams({ token: cfg.token, profile: JSON.stringify(profile) });
}

export function clearStatusParams(token: string): URLSearchParams {
  return new URLSearchParams({ token, profile: JSON.stringify({ status_text: '', status_emoji: '', status_expiration: 0 }) });
}

function messageFor(code: string): string {
  switch (code) {
    case 'invalid_auth':
    case 'token_revoked':
    case 'account_inactive':
      return 'Slack rejected the token. Make a new one.';
    case 'missing_scope':
      return 'The token is missing a scope: add users.profile:write (and dnd:write for Do Not Disturb).';
    case 'not_allowed_token_type':
      return BOT_TOKEN_MESSAGE;
    case 'ratelimited':
      return 'Slack is rate-limiting; try again in a minute.';
    default:
      return `Slack error: ${code}`;
  }
}

export async function slackCall(method: string, params: URLSearchParams, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  let data: unknown;
  try {
    // No custom headers: a URLSearchParams body is form-encoded, which avoids a CORS preflight.
    const res = await fetchImpl(`${SLACK_API}${method}`, { method: 'POST', body: params });
    data = await res.json();
  } catch {
    throw new SlackError("Couldn't reach Slack.", 'network');
  }
  const o = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (o.ok !== true) {
    const code = typeof o.error === 'string' && o.error ? o.error : 'unknown';
    throw new SlackError(messageFor(code), code);
  }
  return o;
}

export async function startFocusStatus(cfg: SlackConfig, minutes: number, taskTitle?: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await slackCall('users.profile.set', focusStatusParams(cfg, { minutes, taskTitle, nowMs: Date.now() }), fetchImpl);
  if (cfg.dnd) await slackCall('dnd.setSnooze', new URLSearchParams({ token: cfg.token, num_minutes: String(minutes) }), fetchImpl);
}

export async function endFocusStatus(cfg: SlackConfig, fetchImpl: typeof fetch = fetch): Promise<void> {
  await slackCall('users.profile.set', clearStatusParams(cfg.token), fetchImpl);
  if (!cfg.dnd) return;
  try {
    await slackCall('dnd.endSnooze', new URLSearchParams({ token: cfg.token }), fetchImpl);
  } catch (e) {
    if (!(e instanceof SlackError && e.code === 'snooze_not_active')) throw e;
  }
}

export async function testSlack(token: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const out = await slackCall('auth.test', new URLSearchParams({ token }), fetchImpl);
  return `Connected as ${String(out.user ?? 'unknown')} in ${String(out.team ?? 'unknown')}`;
}
