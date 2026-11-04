import { createContext, useContext, useEffect, useMemo, useReducer, useState, type Dispatch, type ReactNode } from 'react';
import { todayKey } from '../lib/date';
import { loadState, saveState } from '../lib/storage';
import type { AppState, DateKey } from '../lib/types';
import { reducer, type Action } from './reducer';

interface StoreValue {
  state: AppState;
  dispatch: Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial, (init) => init ?? loadState());

  useEffect(() => {
    const id = window.setTimeout(() => saveState(state), 150);
    return () => window.clearTimeout(id);
  }, [state]);

  // Keep several open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'profocus:v1' && e.newValue) dispatch({ type: 'REPLACE_STATE', state: loadState() });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

/** Today's date key, refreshed when the clock passes midnight. */
export function useToday(): DateKey {
  const [today, setToday] = useState(() => todayKey());
  useEffect(() => {
    const id = window.setInterval(() => setToday(todayKey()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return today;
}

/** Current time, re-rendering every `ms`. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
