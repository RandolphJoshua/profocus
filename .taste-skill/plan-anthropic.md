# ProFocus v0.6.1 — Anthropic (Claude) as an AI-coach provider

Read `CLAUDE.md`, `.claude/skills/profocus/SKILL.md`, `.taste-skill/plan-v06.md` Part A, then `src/lib/ai.ts`, `src/lib/ai.test.ts`, `src/state/coach.tsx`, `src/views/SettingsView.tsx` (the `CoachSection`), `README.md` (AI coach paragraph). Same rules as before: smallest complete change, tokens-only CSS (none expected), tests, no git commands, no attribution lines. The user's key stays in localStorage `profocus:ai` only.

## What
Add `'anthropic'` to `Provider`. Default model `claude-opus-5-5` (the Model field stays free text; `claude-haiku-5-5` is the cheap alternative users may type).

## How — official SDK, loaded on demand
`npm install @anthropic-ai/sdk`. Do **not** add a raw `fetch` adapter for Anthropic; use the SDK. Load it lazily so users of other providers never download it:

```ts
case 'anthropic': {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: cfg.apiKey, dangerouslyAllowBrowser: true, timeout: 20_000, maxRetries: 1 });
  const res = await client.beta.messages.create({
    model: cfg.model,
    max_tokens: 1024,                      // notes and a 3-item JSON list are deliberately short
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'low' },      // Opus 5.5 defaults to medium; low is right for a two-sentence note
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',                  // if a safety classifier declines, the API re-runs on a fallback model in the same call
  });
  if (res.stop_reason === 'refusal') throw new Error(res.stop_details?.explanation ?? 'The model declined this request.');
  return res.content.filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('').trim();
}
```
Notes: do not send `thinking` (Opus 5.5 is adaptive by default; `disabled` is a 400) and do not send `temperature`. When `opts.json` is true, keep the existing approach (the system prompt already asks for JSON and `parseSuggestions` is tolerant) — no `output_config.format` needed. Map SDK errors to short messages before rethrowing: `Anthropic.AuthenticationError` → "Invalid API key", `Anthropic.RateLimitError` → "Rate limited — try again in a minute", other `Anthropic.APIError` → `error.message` (first 200 chars). Keep the existing 20 s behaviour (the SDK `timeout` covers it).

## UI
Provider select gets "Anthropic (Claude)" as the **first** option; the free-options hint becomes: "Anthropic Console (Claude) · Google AI Studio (Gemini) · Groq · OpenRouter. The coach sees your goal, priority and task titles plus this week's numbers — never your notes." Keep everything else.

## Tests (`src/lib/ai.test.ts`)
Mock the SDK module with `vi.mock('@anthropic-ai/sdk', …)` exporting a default class whose `beta.messages.create` is a `vi.fn()`; assert the constructor got `dangerouslyAllowBrowser: true` and the key, the create params (model, system, messages, `output_config.effort`, `betas`, `fallbacks`), text joining, the refusal path, and the auth-error mapping (export a class named `AuthenticationError` from the mock and throw it). `DEFAULT_MODELS.anthropic === 'claude-opus-5-5'`. Update the existing Settings render test only if the option order changes an assertion.

## Docs
README AI-coach paragraph: lead with Anthropic (Console API key, `claude-opus-5-5` default, `claude-haiku-5-5` for the cheapest), then Gemini/Groq/OpenRouter. SKILL.md row for `src/lib/ai.ts`: add "anthropic (official SDK, lazy-loaded)".

## Verify
`npm run typecheck && npm test && npm run build`; confirm in the build output that the SDK lands in its own chunk (a separate `assets/*.js`), not the main bundle. Report what changed, test count, chunk sizes, and that you could not make a live call.
