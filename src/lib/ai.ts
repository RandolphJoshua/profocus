import { addDays } from './date';
import { currentSeason, goalTrajectory, seasonProgress, weekScores, weekStats } from './stats';
import type { AppState, BlockKind, DateKey } from './types';

/** Bring-your-own-key AI coach. The key lives only in localStorage under AI_KEY, never in AppState. */
export type Provider = 'gemini' | 'openai-compatible';

export interface AiConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  /** Only for openai-compatible, e.g. https://api.groq.com/openai/v1 or https://openrouter.ai/api/v1 */
  baseUrl?: string;
}

export const AI_KEY = 'profocus:ai';
export const DEFAULT_MODELS: Record<Provider, string> = { gemini: 'gemini-3.8-flash', 'openai-compatible': 'llama-3.3-70b-versatile' };

const GEMINI_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 20_000;
const ERROR_MAX = 200;
const TEMPERATURE = 0.4;

export function loadAiConfig(): AiConfig | null {
  try {
    const raw = localStorage.getItem(AI_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    if ((o.provider !== 'gemini' && o.provider !== 'openai-compatible') || typeof o.apiKey !== 'string' || !o.apiKey || typeof o.model !== 'string' || !o.model) return null;
    return { provider: o.provider, apiKey: o.apiKey, model: o.model, ...(typeof o.baseUrl === 'string' && o.baseUrl ? { baseUrl: o.baseUrl } : {}) };
  } catch {
    return null;
  }
}

export function saveAiConfig(c: AiConfig | null): void {
  try {
    if (c) localStorage.setItem(AI_KEY, JSON.stringify(c));
    else localStorage.removeItem(AI_KEY);
  } catch {
    /* storage unavailable: the config just won't persist */
  }
}

export interface CoachContext {
  today: DateKey;
  season?: { name: string; theme?: string; weekOf: number; weeksTotal: number; daysLeft: number };
  goals: { title: string; status: string; trajectory: string }[];
  priorities: { title: string; done: boolean }[];
  todayTasks: { title: string; done: boolean; estimateMin?: number; blocked: boolean }[];
  blocks: { title: string; start: number; end: number; kind: BlockKind }[];
  lastWeek?: { focusTotal: number; tasksCompleted: number; highlightsDone: number; highlightsSet: number; habitRate: number; scoreMean?: number };
  openCount: number;
  overdueCount: number;
  highlight?: { text: string; done: boolean };
}

/** Titles and numbers only: never notes, reflections or emails. */
export function buildContext(state: AppState, today: DateKey, weekStart: DateKey): CoachContext {
  const season = currentSeason(state.seasons, today);
  const sp = season ? seasonProgress(state, season.id, today) : undefined;
  const prev = addDays(weekStart, -7);
  const prevStats = weekStats(state, prev, today);
  const elapsed = weekScores(state, prev, today).filter((s) => s.date <= today);
  const plan = state.days[today];
  const todays = state.tasks.filter((t) => t.date === today);
  const dayBlocks = state.blocks.filter((b) => b.date === today);
  const hasLastWeekData = prevStats.focusTotal > 0 || prevStats.tasksCompleted > 0 || prevStats.highlightsSet > 0;
  return {
    today,
    ...(season && sp ? { season: { name: season.name, ...(season.theme ? { theme: season.theme } : {}), weekOf: sp.weekOf, weeksTotal: sp.weeksTotal, daysLeft: sp.daysLeft } } : {}),
    goals: state.goals.filter((g) => g.status === 'active').map((g) => ({ title: g.title, status: g.status, trajectory: goalTrajectory(state, g.id, today).status })),
    priorities: (state.reviews[weekStart]?.priorities ?? []).map((p) => ({ title: p.title, done: p.done })),
    todayTasks: todays.map((t) => ({ title: t.title, done: t.done, estimateMin: t.estimateMin, blocked: dayBlocks.some((b) => b.taskId === t.id) })),
    blocks: dayBlocks.map((b) => ({ title: b.title, start: b.start, end: b.end, kind: b.kind })),
    ...(hasLastWeekData ? {
      lastWeek: {
        focusTotal: prevStats.focusTotal, tasksCompleted: prevStats.tasksCompleted, highlightsDone: prevStats.highlightsDone,
        highlightsSet: prevStats.highlightsSet, habitRate: Math.round(prevStats.habitRate * 100) / 100,
        ...(elapsed.length ? { scoreMean: Math.round(elapsed.reduce((n, s) => n + s.score, 0) / elapsed.length) } : {}),
      },
    } : {}),
    openCount: state.tasks.filter((t) => !t.done).length,
    overdueCount: state.tasks.filter((t) => !t.done && t.date && t.date < today).length,
    ...(plan?.highlight ? { highlight: { text: plan.highlight, done: !!plan.highlightDone } } : {}),
  };
}

export const SYSTEM_PROMPT =
  'You are a calm, concrete productivity coach inside a personal planner. Use only the data you are given. ' +
  'Answer in plain sentences, no emoji, no headings, no lists, under 90 words for notes. ' +
  'For suggestions return JSON only: {"suggestions":[{"text":"…","title":"…"}]} where text is one sentence of advice and title is a short outcome (under 10 words) the user could adopt as a weekly priority.';

const clip = (s: string) => s.slice(0, ERROR_MAX);

async function providerError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '');
  try {
    const j = JSON.parse(raw) as { error?: { message?: unknown } | string; message?: unknown };
    const m = typeof j.error === 'string' ? j.error : j.error?.message ?? j.message;
    if (typeof m === 'string' && m) return clip(m);
  } catch {
    /* not JSON */
  }
  return clip(raw.trim() || `Request failed (${res.status})`);
}

function endpoint(cfg: AiConfig): { url: string; headers: Record<string, string> } {
  if (cfg.provider === 'gemini') {
    return { url: `${GEMINI_ROOT}/${encodeURIComponent(cfg.model)}:generateContent`, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey } };
  }
  const base = cfg.baseUrl?.trim().replace(/\/+$/, '');
  if (!base) throw new Error('Add a base URL for the OpenAI-compatible provider.');
  if (!base.startsWith('https://')) throw new Error('The base URL must start with https://');
  return { url: `${base}/chat/completions`, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` } };
}

function requestBody(cfg: AiConfig, system: string, user: string, json: boolean): unknown {
  if (cfg.provider === 'gemini') {
    return {
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: TEMPERATURE, ...(json ? { response_mime_type: 'application/json' } : {}) },
    };
  }
  return {
    model: cfg.model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: TEMPERATURE,
    ...(json ? { response_format: { type: 'json_object' } } : {}),
  };
}

function readText(cfg: AiConfig, data: unknown): string | undefined {
  const d = data as {
    candidates?: { content?: { parts?: { text?: unknown }[] } }[];
    choices?: { message?: { content?: unknown } }[];
  };
  const t = cfg.provider === 'gemini' ? d.candidates?.[0]?.content?.parts?.[0]?.text : d.choices?.[0]?.message?.content;
  return typeof t === 'string' && t.trim() ? t : undefined;
}

export async function complete(cfg: AiConfig, system: string, user: string, opts: { json?: boolean } = {}): Promise<string> {
  const { url, headers } = endpoint(cfg);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(requestBody(cfg, system, user, !!opts.json)), signal: controller.signal });
    if (!res.ok) throw new Error(await providerError(res));
    const text = readText(cfg, await res.json());
    if (!text) throw new Error('The model returned an empty answer.');
    return text.trim();
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('The request timed out after 20 seconds.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function parseSuggestions(text: string): { text: string; title?: string }[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as { suggestions?: unknown };
    if (!Array.isArray(v.suggestions)) return [];
    return v.suggestions.flatMap((s): { text: string; title?: string }[] => {
      if (typeof s !== 'object' || s === null) return [];
      const { text: t, title } = s as { text?: unknown; title?: unknown };
      if (typeof t !== 'string' || !t.trim()) return [];
      return [{ text: t.trim(), ...(typeof title === 'string' && title.trim() ? { title: title.trim() } : {}) }];
    });
  } catch {
    return [];
  }
}
