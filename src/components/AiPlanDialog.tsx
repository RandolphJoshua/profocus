import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { complete } from '../lib/ai';
import { buildPlanRequest, describeApplied, parsePlan, toActions, type ParsedPlan, type PlanItem } from '../lib/aiPlan';
import { minutesNow } from '../lib/date';
import { useAiPlan } from '../state/aiPlan';
import { useCoach } from '../state/coach';
import { useStore, useToday } from '../state/store';
import { useToast } from './Toaster';

const PLACEHOLDER = 'e.g. Plan my afternoon: 2h on the WABA fix, lunch at 12:30, gym at 6';
const EXAMPLES = ['Plan the rest of my day', 'Schedule my inbox for tomorrow', 'Break a task into steps'] as const;
const MAX_PROMPT = 2000;
/** A full plan at medium effort can take well over the 20 s default. */
const PLAN_TIMEOUT_MS = 60_000;
const PLAN_MAX_TOKENS = 4096;
const GROUPS = [
  { kind: 'task', title: 'New tasks' },
  { kind: 'block', title: 'Time blocks' },
  { kind: 'update', title: 'Changes' },
] as const;

interface Props {
  initialPrompt?: string;
  autoRun?: boolean;
  onClose: () => void;
}

/** Describe what you want; review the model's proposal as a checklist; nothing changes until Apply. */
export function AiPlanDialog({ initialPrompt = '', autoRun = false, onClose }: Props) {
  const { config } = useCoach();
  const { state, dispatch } = useStore();
  const today = useToday();
  const toast = useToast();
  const { muteBlockToast } = useAiPlan();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<ParsedPlan | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const alive = useRef(true);
  const started = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const generate = async (text = prompt) => {
    const ask = text.trim();
    if (!config || !ask || busy) return;
    setBusy(true);
    setError(undefined);
    setResult(null);
    const clock = { today, nowMin: minutesNow() };
    try {
      const { system, user } = buildPlanRequest(stateRef.current, { ...clock, prompt: ask });
      const raw = await complete(config, system, user, { json: true, maxTokens: PLAN_MAX_TOKENS, effort: 'medium', timeoutMs: PLAN_TIMEOUT_MS });
      if (!alive.current) return;
      const parsed = parsePlan(raw, stateRef.current, clock);
      setResult(parsed);
      setPicked(new Set(parsed.items.map((i) => i.id)));
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'The model could not answer.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  useEffect(() => {
    if (autoRun && !started.current && initialPrompt.trim()) {
      started.current = true;
      void generate(initialPrompt);
    }
    // Runs once, when the dialog opens.
  }, []);

  const toggle = (id: string) => setPicked((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const apply = () => {
    if (!result) return;
    const { actions, undo, counts } = toActions(result.items, picked, new Date().toISOString());
    if (actions.length === 0) return;
    dispatch({ type: 'BATCH', actions });
    onClose();
    toast(describeApplied(counts), {
      action: {
        label: 'Undo',
        run: () => {
          muteBlockToast(undo.flatMap((a) => (a.type === 'DELETE_BLOCK' ? [a.id] : [])));
          dispatch({ type: 'BATCH', actions: undo });
        },
      },
    });
  };

  const summaryText = busy ? 'Thinking…' : result ? result.summary || (result.items.length ? '' : 'Nothing to propose.') : '';
  const itemsOf = (kind: PlanItem['kind']) => result?.items.filter((i) => i.kind === kind) ?? [];

  return (
    <Modal title="Plan with AI" onClose={onClose}>
      {!config ? (
        <div className="stack">
          <p>Set up the AI coach first.</p>
          <p className="muted">Add your own API key in Settings, then come back here.</p>
          <div className="row gap ritual-foot">
            <span className="spacer" />
            <a className="btn primary" href="#settings" onClick={onClose}>Open Settings</a>
          </div>
        </div>
      ) : (
        <form
          className="stack ai-plan"
          onSubmit={(e) => { e.preventDefault(); void generate(); }}
        >
          <label>
            What should I plan?
            <textarea
              autoFocus
              rows={3}
              maxLength={MAX_PROMPT}
              value={prompt}
              placeholder={PLACEHOLDER}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void generate();
                }
              }}
            />
          </label>
          <div className="row gap" role="group" aria-label="Examples">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="chip ai-example" onClick={() => setPrompt(ex)}>{ex}</button>
            ))}
          </div>
          <div className="row gap">
            <button type="submit" className={result ? 'btn' : 'btn primary'} disabled={busy || !prompt.trim()}>
              {busy ? 'Thinking…' : result ? 'Try again' : 'Generate'}
            </button>
          </div>

          <div role="status" className="ai-status">
            {summaryText && <p className={busy ? 'muted' : 'ai-summary'}>{summaryText}</p>}
          </div>
          {error && <p role="alert" className="coach-error">{error}</p>}

          {result && GROUPS.map(({ kind, title }) => {
            const list = itemsOf(kind);
            if (list.length === 0) return null;
            return (
              <section key={kind} aria-label={title} className="ai-group">
                <h3>{title}</h3>
                <ul className="pick-list">
                  {list.map((item) => (
                    <li key={item.id}>
                      <label className="check-label">
                        <input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} />
                        <span>{item.label}</span>
                        {item.detail && <small className="muted num">{item.detail}</small>}
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {result && result.dropped.length > 0 && (
            <section aria-label="Skipped" className="ai-group ai-skipped">
              <h3>Skipped</h3>
              <ul>{result.dropped.map((d) => <li key={d}>{d}</li>)}</ul>
            </section>
          )}

          {result && result.items.length > 0 && (
            <div className="row gap ritual-foot">
              <span className="spacer" />
              <button type="button" className="btn primary" disabled={picked.size === 0} onClick={apply}>Apply {picked.size}</button>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
