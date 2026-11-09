import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildContext, complete, loadAiConfig, parseSuggestions, saveAiConfig, SYSTEM_PROMPT, type AiConfig } from '../lib/ai';
import { addDays, startOfWeek, todayKey } from '../lib/date';
import type { DateKey } from '../lib/types';
import { useStore } from './store';

export interface CoachApi {
  enabled: boolean;
  config: AiConfig | null;
  setConfig: (c: AiConfig | null) => void;
  busy: boolean;
  error?: string;
  dailyNote: () => Promise<void>;
  weeklySuggestions: (weekStart: DateKey) => Promise<void>;
  test: () => Promise<string>;
}

const NOTE_ASK =
  'Write one note of at most two sentences about today only: what is protected on the calendar, what has no time slot yet, and the one thing to do first.';
const SUGGESTIONS_ASK =
  'Give exactly 3 suggestions for the coming week, grounded in last week\'s numbers, the season and the goals. Return JSON only.';

const noop = async () => {};
const CoachContext = createContext<CoachApi>({
  enabled: false, config: null, setConfig: () => {}, busy: false, dailyNote: noop, weeklySuggestions: noop, test: async () => '',
});

const message = (e: unknown): string => (e instanceof Error ? e.message : 'The coach could not answer.');

export function CoachProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const [config, setConfigState] = useState<AiConfig | null>(() => loadAiConfig());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const stateRef = useRef(state);
  stateRef.current = state;

  const setConfig = useCallback((c: AiConfig | null) => {
    saveAiConfig(c);
    setConfigState(c);
    setError(undefined);
  }, []);

  const run = useCallback(async <T,>(job: (cfg: AiConfig) => Promise<T>): Promise<T | undefined> => {
    if (!config) return undefined;
    setBusy(true);
    setError(undefined);
    try {
      return await job(config);
    } catch (e) {
      setError(message(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [config]);

  const dailyNote = useCallback(async () => {
    const today = todayKey();
    const week = startOfWeek(today, stateRef.current.settings.weekStartsOn);
    const text = await run((cfg) => complete(cfg, SYSTEM_PROMPT, `${NOTE_ASK}\n\nData:\n${JSON.stringify(buildContext(stateRef.current, today, week))}`));
    if (text) dispatch({ type: 'SET_DAY', date: today, patch: { coachNote: { text, at: new Date().toISOString() } } });
  }, [run, dispatch]);

  const weeklySuggestions = useCallback(async (weekStart: DateKey) => {
    const today = todayKey();
    const ctx = buildContext(stateRef.current, today, weekStart);
    const raw = await run((cfg) => complete(cfg, SYSTEM_PROMPT, `${SUGGESTIONS_ASK}\n\nWeek starting ${weekStart} (ends ${addDays(weekStart, 6)}).\nData:\n${JSON.stringify(ctx)}`, { json: true }));
    if (raw === undefined) return;
    const list = parseSuggestions(raw).slice(0, 3);
    if (list.length === 0) {
      setError('The coach answered, but not in a form I could read. Try again.');
      return;
    }
    dispatch({ type: 'SET_REVIEW', week: weekStart, patch: { coachSuggestions: list } });
  }, [run, dispatch]);

  const test = useCallback(async () => {
    const out = await run((cfg) => complete(cfg, 'You are a connectivity check.', 'Reply with the single word OK.'));
    return out ?? '';
  }, [run]);

  const value = useMemo<CoachApi>(
    () => ({ enabled: config !== null, config, setConfig, busy, error, dailyNote, weeklySuggestions, test }),
    [config, setConfig, busy, error, dailyNote, weeklySuggestions, test],
  );
  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}

export const useCoach = (): CoachApi => useContext(CoachContext);
