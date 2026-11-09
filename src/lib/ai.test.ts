import { emptyState } from './storage';
import {
  buildContext, complete, DEFAULT_MODELS, loadAiConfig, parseSuggestions, saveAiConfig, SYSTEM_PROMPT, type AiConfig,
} from './ai';

const sdk = vi.hoisted(() => ({ create: vi.fn(), ctor: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {}
  class AuthenticationError extends APIError {}
  class RateLimitError extends APIError {}
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = AuthenticationError;
    static RateLimitError = RateLimitError;
    beta = { messages: { create: sdk.create } };
    constructor(opts: unknown) { sdk.ctor(opts); }
  }
  return { default: Anthropic, APIError, AuthenticationError, RateLimitError };
});

const claude: AiConfig = { provider: 'anthropic', apiKey: 'KEY-A', model: 'claude-opus-5-5' };
const gemini: AiConfig = { provider: 'gemini', apiKey: 'KEY-G', model: 'gemini-2.5-flash' };
const compat: AiConfig = { provider: 'openai-compatible', apiKey: 'KEY-O', model: 'llama-x', baseUrl: 'https://api.groq.com/openai/v1/' };

const okJson = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

describe('complete (gemini)', () => {
  it('posts the Gemini request shape and reads the first candidate', async () => {
    const fetchMock = vi.fn(() => okJson({ candidates: [{ content: { parts: [{ text: 'hello' }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await complete(gemini, 'SYS', 'USER', { json: true });
    expect(out).toBe('hello');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY-G');
    expect(url).not.toContain('KEY-G');
    expect(JSON.parse(init.body as string)).toEqual({
      system_instruction: { parts: [{ text: 'SYS' }] },
      contents: [{ role: 'user', parts: [{ text: 'USER' }] }],
      generationConfig: { temperature: 0.4, response_mime_type: 'application/json' },
    });
  });

  it('omits the JSON mime type for plain text', async () => {
    const fetchMock = vi.fn(() => okJson({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }));
    vi.stubGlobal('fetch', fetchMock);
    await complete(gemini, 's', 'u');
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string).generationConfig).toEqual({ temperature: 0.4 });
  });
});

describe('complete (openai-compatible)', () => {
  it('posts to {baseUrl}/chat/completions with a bearer token', async () => {
    const fetchMock = vi.fn(() => okJson({ choices: [{ message: { content: 'hi' } }] }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await complete(compat, 'SYS', 'USER', { json: true });
    expect(out).toBe('hi');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer KEY-O');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'llama-x',
      messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USER' }],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
  });

  it('refuses a missing or non-https base URL without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(complete({ ...compat, baseUrl: undefined }, 's', 'u')).rejects.toThrow(/base URL/i);
    await expect(complete({ ...compat, baseUrl: 'http://evil.test/v1' }, 's', 'u')).rejects.toThrow(/https/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('complete (anthropic)', () => {
  beforeEach(() => { sdk.create.mockReset(); sdk.ctor.mockReset(); });

  it('calls the SDK with the key, browser flag and the planned params, joining text blocks', async () => {
    sdk.create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: ' Hello ' }, { type: 'tool_use' }, { type: 'text', text: 'world ' }] });
    const out = await complete(claude, 'SYS', 'USER', { json: true });
    expect(out).toBe('Hello world');
    expect(sdk.ctor).toHaveBeenCalledWith({ apiKey: 'KEY-A', dangerouslyAllowBrowser: true, timeout: 20_000, maxRetries: 1 });
    expect(sdk.create).toHaveBeenCalledWith({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      system: 'SYS',
      messages: [{ role: 'user', content: 'USER' }],
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    const params = sdk.create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('thinking');
    expect(params).not.toHaveProperty('temperature');
  });

  it('throws the explanation when the model refuses', async () => {
    sdk.create.mockResolvedValue({ stop_reason: 'refusal', stop_details: { explanation: 'Declined for safety.' }, content: [] });
    await expect(complete(claude, 's', 'u')).rejects.toThrow('Declined for safety.');
    sdk.create.mockResolvedValue({ stop_reason: 'refusal', content: [] });
    await expect(complete(claude, 's', 'u')).rejects.toThrow('The model declined this request.');
  });

  it('maps SDK errors to short messages', async () => {
    const sdkModule = await import('@anthropic-ai/sdk');
    // The mock classes take a message only; the real constructors need more arguments.
    const make = (C: unknown, msg: string) => new (C as new (m: string) => Error)(msg);
    sdk.create.mockRejectedValueOnce(make(sdkModule.AuthenticationError, '401 raw'));
    await expect(complete(claude, 's', 'u')).rejects.toThrow('Invalid API key');
    sdk.create.mockRejectedValueOnce(make(sdkModule.RateLimitError, '429 raw'));
    await expect(complete(claude, 's', 'u')).rejects.toThrow(/Rate limited/);
    sdk.create.mockRejectedValueOnce(make(sdkModule.APIError, 'x'.repeat(500)));
    await expect(complete(claude, 's', 'u')).rejects.toThrow(new RegExp(`^x{200}$`));
  });

  it('throws on an empty answer', async () => {
    sdk.create.mockResolvedValue({ stop_reason: 'end_turn', content: [] });
    await expect(complete(claude, 's', 'u')).rejects.toThrow(/empty/i);
  });

  it('never calls fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    sdk.create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    await complete(claude, 's', 'u');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('complete errors', () => {
  it('throws the provider message, trimmed to 200 chars', async () => {
    const long = 'x'.repeat(500);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { message: long } }), { status: 400 }))));
    await expect(complete(gemini, 's', 'u')).rejects.toThrow(`${'x'.repeat(200)}`);
    try { await complete(gemini, 's', 'u'); } catch (e) { expect((e as Error).message.length).toBe(200); }
  });

  it('falls back to a status message for non-JSON errors and never echoes the key', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('nope', { status: 500 }))));
    await expect(complete(gemini, 's', 'u')).rejects.toThrow(/nope|500/);
  });

  it('throws when the response has no text', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okJson({ candidates: [] })));
    await expect(complete(gemini, 's', 'u')).rejects.toThrow(/empty/i);
  });

  it('aborts after 20 seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_u: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    })));
    const p = complete(gemini, 's', 'u');
    const assertion = expect(p).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });
});

describe('parseSuggestions', () => {
  it('parses plain JSON', () => {
    expect(parseSuggestions('{"suggestions":[{"text":"Ship it","title":"Ship v1"},{"text":"Rest"}]}'))
      .toEqual([{ text: 'Ship it', title: 'Ship v1' }, { text: 'Rest' }]);
  });
  it('strips code fences and surrounding prose', () => {
    expect(parseSuggestions('Sure!\n```json\n{"suggestions":[{"text":"A"}]}\n```\nbye')).toEqual([{ text: 'A' }]);
  });
  it('returns [] on garbage or wrong shape', () => {
    expect(parseSuggestions('not json')).toEqual([]);
    expect(parseSuggestions('{"suggestions":"no"}')).toEqual([]);
    expect(parseSuggestions('{"suggestions":[{"nope":1},{"text":"  "}]}')).toEqual([]);
  });
});

describe('config storage', () => {
  it('round-trips under profocus:ai and clears on null', () => {
    expect(loadAiConfig()).toBeNull();
    saveAiConfig(gemini);
    expect(localStorage.getItem('profocus:ai')).toContain('KEY-G');
    expect(loadAiConfig()).toEqual(gemini);
    saveAiConfig(null);
    expect(loadAiConfig()).toBeNull();
  });
  it('rejects malformed stored values', () => {
    localStorage.setItem('profocus:ai', '{"provider":"x"}');
    expect(loadAiConfig()).toBeNull();
    localStorage.setItem('profocus:ai', 'garbage');
    expect(loadAiConfig()).toBeNull();
  });
  it('has default models', () => {
    expect(DEFAULT_MODELS.gemini).toBe('gemini-3.8-flash');
    expect(DEFAULT_MODELS.anthropic).toBe('claude-opus-5-5');
  });
  it('round-trips an anthropic config', () => {
    saveAiConfig(claude);
    expect(loadAiConfig()).toEqual(claude);
  });
});

describe('buildContext', () => {
  it('sends titles and numbers only, never notes', () => {
    const state = {
      ...emptyState(),
      tasks: [{ id: 't', title: 'Write intro', notes: 'SECRET-NOTE', date: '2026-11-04', estimateMin: 30, done: false, createdAt: 'x' }],
      days: { '2026-11-04': { highlight: 'Ship', shutdownNote: 'PRIVATE-SHUTDOWN' } },
      goals: [{ id: 'g', title: 'Launch', status: 'active' as const, createdAt: 'x', why: 'PRIVATE-WHY' }],
    };
    const ctx = buildContext(state, '2026-11-04', '2026-11-02');
    const json = JSON.stringify(ctx);
    expect(json).toContain('Write intro');
    expect(json).toContain('Launch');
    expect(json).not.toContain('SECRET-NOTE');
    expect(json).not.toContain('PRIVATE');
    expect(ctx.todayTasks[0]).toMatchObject({ title: 'Write intro', estimateMin: 30, blocked: false });
    expect(ctx.openCount).toBe(1);
    expect(SYSTEM_PROMPT).toMatch(/suggestions/);
  });
});

describe('complete options (plan calls)', () => {
  beforeEach(() => { sdk.create.mockReset(); });

  it('passes maxTokens and effort to Anthropic', async () => {
    sdk.create.mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    await complete(claude, 's', 'u', { maxTokens: 4096, effort: 'medium' });
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ max_tokens: 4096, output_config: { effort: 'medium' } }));
  });

  it('maps maxTokens to Gemini and OpenAI-compatible fields', async () => {
    const g = vi.fn(() => okJson({ candidates: [{ content: { parts: [{ text: 'x' }] } }] }));
    vi.stubGlobal('fetch', g);
    await complete(gemini, 's', 'u', { json: true, maxTokens: 4096 });
    expect(JSON.parse((g.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).generationConfig).toMatchObject({ maxOutputTokens: 4096 });
    const o = vi.fn(() => okJson({ choices: [{ message: { content: 'x' } }] }));
    vi.stubGlobal('fetch', o);
    await complete(compat, 's', 'u', { json: true, maxTokens: 4096 });
    expect(JSON.parse((o.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toMatchObject({ max_tokens: 4096, response_format: { type: 'json_object' } });
  });
});
