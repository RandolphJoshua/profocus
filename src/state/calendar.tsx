import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { eventsToBlocks, calendarListUrl, type GoogleEvent } from '../lib/calendar';
import { addDays, startOfWeek, todayKey } from '../lib/date';
import type { DateKey } from '../lib/types';
import { useAuth } from './auth';
import { useStore } from './store';

export type CalendarStatus = 'off' | 'connected' | 'expired' | 'error' | 'loading';
export interface CalendarInfo {
  status: CalendarStatus;
  lastImportAt?: string;
  error?: string;
  connect: () => void;
  refresh: (range?: { from: DateKey; to: DateKey }) => Promise<void>;
  disconnect: () => void;
}

const STALE_MS = 15 * 60_000;
const WIDE_DAYS = 365;
const API_HINT = 'Enable the Google Calendar API and the calendar.readonly scope in Google Cloud (see docs/google-oauth-setup.md §1.4).';

const inert: CalendarInfo = { status: 'off', connect: () => undefined, refresh: async () => undefined, disconnect: () => undefined };
const CalendarContext = createContext<CalendarInfo>(inert);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, providerToken, signInWithGoogle } = useAuth();
  const { state, dispatch } = useStore();
  const linked = state.settings.calendarConnected === true;
  const [info, setInfo] = useState<{ status: CalendarStatus; lastImportAt?: string; error?: string }>({ status: 'off' });
  const tokenRef = useRef(providerToken);
  tokenRef.current = providerToken;
  const weekStartsOn = state.settings.weekStartsOn;
  const infoRef = useRef(info);
  infoRef.current = info;

  const refresh = useCallback(async (range?: { from: DateKey; to: DateKey }) => {
    const token = tokenRef.current;
    if (!token) return;
    const week = startOfWeek(todayKey(), weekStartsOn);
    const { from, to } = range ?? { from: addDays(week, -7), to: addDays(week, 13) };
    setInfo((p) => ({ ...p, status: 'loading', error: undefined }));
    try {
      const res = await fetch(calendarListUrl(from, to), { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 401 || res.status === 403) {
        const body = res.status === 403 ? await res.text().catch(() => '') : '';
        if (/accessNotConfigured|insufficient/i.test(body)) setInfo((p) => ({ ...p, status: 'error', error: API_HINT }));
        else setInfo((p) => ({ ...p, status: 'expired' }));
        return;
      }
      if (!res.ok) throw new Error(`Google Calendar returned ${res.status}.`);
      const data = (await res.json()) as { items?: GoogleEvent[] };
      const blocks = eventsToBlocks(data.items ?? [], (id) => `g-${id}`);
      const at = new Date().toISOString();
      dispatch({
        type: 'BATCH',
        actions: [
          { type: 'SET_EXTERNAL_BLOCKS', source: 'google', range: { from, to }, blocks },
          ...(linked ? [] : [{ type: 'SET_SETTINGS' as const, patch: { calendarConnected: true } }]),
        ],
      });
      setInfo({ status: 'connected', lastImportAt: at });
    } catch (e) {
      setInfo((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : 'Could not reach Google Calendar.' }));
    }
  }, [dispatch, linked, weekStartsOn]);

  // A fresh Google token (after a Calendar sign-in) triggers an import.
  useEffect(() => {
    if (providerToken) void refresh();
    // refresh identity changes with settings; only a new token should re-import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerToken]);

  // Back to the tab after a while: import again.
  useEffect(() => {
    const onVisible = () => {
      const cur = infoRef.current;
      if (document.visibilityState !== 'visible' || cur.status !== 'connected' || !cur.lastImportAt) return;
      if (Date.now() - new Date(cur.lastImportAt).getTime() > STALE_MS) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const connect = useCallback(() => {
    void signInWithGoogle({ calendar: true }).then((err) => {
      if (err) setInfo((p) => ({ ...p, status: 'error', error: err }));
    });
  }, [signInWithGoogle]);

  const disconnect = useCallback(() => {
    const today = todayKey();
    dispatch({
      type: 'BATCH',
      actions: [
        { type: 'SET_EXTERNAL_BLOCKS', source: 'google', range: { from: addDays(today, -WIDE_DAYS), to: addDays(today, WIDE_DAYS) }, blocks: [] },
        { type: 'SET_SETTINGS', patch: { calendarConnected: false } },
      ],
    });
    setInfo({ status: 'off' });
  }, [dispatch]);

  // Linked on another device but no token here: the user must reconnect.
  const status: CalendarStatus =
    authStatus !== 'signed-in' ? 'off' : info.status === 'off' && linked && !providerToken ? 'expired' : info.status;
  const value = useMemo(
    () => ({ status, lastImportAt: info.lastImportAt, error: info.error, connect, refresh, disconnect }),
    [status, info.lastImportAt, info.error, connect, refresh, disconnect],
  );
  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar(): CalendarInfo {
  return useContext(CalendarContext);
}
