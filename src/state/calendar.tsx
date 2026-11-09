import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { blockToEvent, calendarListUrl, eventIdFor, eventsToBlocks, ownEvents, planWrites, type GoogleEvent, type OwnEvent } from '../lib/calendar';
import { addDays, startOfWeek, todayKey } from '../lib/date';
import type { DateKey, TimeBlock } from '../lib/types';
import { useAuth } from './auth';
import { useStore } from './store';
import { useSync } from './sync';

export type CalendarStatus = 'off' | 'connected' | 'expired' | 'error' | 'loading';
export interface CalendarInfo {
  status: CalendarStatus;
  lastImportAt?: string;
  /** When ProFocus last mirrored time blocks to Google Calendar. */
  lastPushAt?: string;
  error?: string;
  connect: () => void;
  refresh: (range?: { from: DateKey; to: DateKey }, opts?: { force?: boolean; renew?: boolean }) => Promise<void>;
  disconnect: () => void;
  /** Renew the Google token, import, then mirror blocks. */
  syncNow: () => Promise<void>;
  /** Local blocks in the window not yet mirrored to Google (only while mirroring is on). */
  pending: number;
}

const STALE_MS = 15 * 60_000;
const WIDE_DAYS = 365;
const API_HINT = 'Enable the Google Calendar API and the calendar.events scope in Google Cloud (see docs/google-oauth-setup.md §1.4).';

const PUSH_DEBOUNCE_MS = 3000;
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const RECONNECT_HINT = 'Reconnect Google Calendar to allow ProFocus to add events.';
/** The only way a request URL for an existing event is built: the id always comes from eventIdFor. */
const eventUrl = (blockId: string) => `${EVENTS_URL}/${eventIdFor(blockId)}`;
type Outcome = 'ok' | 'expired' | 'reconnect' | { error: string };

/** Set just before the Calendar sign-in redirect so the page that comes back knows the user asked to connect. */
const CONNECT_FLAG = 'profocus:gconnect';
const connectFlag = {
  set() {
    try {
      sessionStorage.setItem(CONNECT_FLAG, '1');
    } catch {
      // Without it the import still runs once the calendar is linked.
    }
  },
  get() {
    try {
      return sessionStorage.getItem(CONNECT_FLAG) === '1';
    } catch {
      return false;
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(CONNECT_FLAG);
    } catch {
      // Nothing to clear.
    }
  },
};

const inert: CalendarInfo = {
  status: 'off',
  connect: () => undefined,
  refresh: async () => undefined,
  disconnect: () => undefined,
  syncNow: async () => undefined,
  pending: 0,
};
const CalendarContext = createContext<CalendarInfo>(inert);

export function CalendarProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, providerToken, ensureGoogleToken, signInWithGoogle } = useAuth();
  const { state, dispatch } = useStore();
  const sync = useSync();
  const linked = state.settings.calendarConnected === true;
  const [info, setInfo] = useState<{ status: CalendarStatus; lastImportAt?: string; lastPushAt?: string; error?: string }>({ status: 'off' });
  const authStatusRef = useRef(authStatus);
  authStatusRef.current = authStatus;
  const ensureRef = useRef(ensureGoogleToken);
  ensureRef.current = ensureGoogleToken;
  const [resolved, setResolved] = useState(false);
  const weekStartsOn = state.settings.weekStartsOn;
  const infoRef = useRef(info);
  infoRef.current = info;
  const linkedRef = useRef(linked);
  linkedRef.current = linked;
  const inFlight = useRef(false);
  const calendarWrite = state.settings.calendarWrite === true;
  const calendarWriteRef = useRef(calendarWrite);
  calendarWriteRef.current = calendarWrite;
  const blocksRef = useRef<TimeBlock[]>(state.blocks);
  blocksRef.current = state.blocks;
  const ownRef = useRef<OwnEvent[] | null>(null);
  const windowRef = useRef<{ from: DateKey; to: DateKey } | null>(null);
  const pushing = useRef(false);
  const pushAgain = useRef(false);
  const reconcileRef = useRef<() => Promise<void>>(async () => undefined);

  /** One Google request with a fresh token; a 401 renews the token once and retries. null = no usable token. */
  const authed = useCallback(async (url: string, init: { method?: string; body?: string; json?: boolean } = {}, renew = false): Promise<Response | null> => {
    const send = async (token: string) =>
      fetch(url, {
        method: init.method,
        headers: { Authorization: `Bearer ${token}`, ...(init.json ? { 'Content-Type': 'application/json' } : {}) },
        body: init.body,
      });
    const first = await ensureRef.current({ force: renew });
    if (!first) return null;
    const res = await send(first);
    if (res.status !== 401) return res;
    const second = await ensureRef.current({ force: true });
    return second ? send(second) : null;
  }, []);

  const refresh = useCallback(async (range?: { from: DateKey; to: DateKey }, opts?: { force?: boolean; renew?: boolean }) => {
    if (authStatusRef.current !== 'signed-in' || inFlight.current) return;
    // Disconnected (possibly on another device): only an explicit connect/Refresh may import.
    if (!opts?.force && !linkedRef.current && state.settings.calendarConnected === false) return;
    inFlight.current = true;
    const week = startOfWeek(todayKey(), weekStartsOn);
    const { from, to } = range ?? { from: addDays(week, -7), to: addDays(week, 13) };
    setInfo((p) => ({ ...p, status: 'loading', error: undefined }));
    try {
      const res = await authed(calendarListUrl(from, to), {}, opts?.renew === true);
      if (!res) {
        setInfo((p) => ({ ...p, status: 'expired' }));
        return;
      }
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
      ownRef.current = ownEvents(data.items ?? []);
      windowRef.current = { from, to };
      setInfo((p) => ({ status: 'connected', lastImportAt: at, lastPushAt: p.lastPushAt }));
      pushAgain.current = true;
    } catch (e) {
      setInfo((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : 'Could not reach Google Calendar.' }));
    } finally {
      inFlight.current = false;
    }
    if (pushAgain.current) {
      pushAgain.current = false;
      void reconcileRef.current();
    }
  }, [authed, dispatch, linked, weekStartsOn, state.settings.calendarConnected]);

  /** Mirror ProFocus blocks into Google Calendar. Only ever touches ids from eventIdFor; never throws. */
  const reconcile = useCallback(async () => {
    const win = windowRef.current;
    if (!calendarWriteRef.current || infoRef.current.status !== 'connected' || !ownRef.current || !win) return;
    if (pushing.current) {
      pushAgain.current = true;
      return;
    }
    pushing.current = true;
    try {
      const plan = planWrites(blocksRef.current, ownRef.current, win);
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // No usable token reads as a 401, which judge() turns into "reconnect needed".
      const call = async (method: string, url: string, body?: object): Promise<Response> =>
        (await authed(url, { method, body: body ? JSON.stringify(body) : undefined, json: Boolean(body) })) ?? new Response(null, { status: 401 });
      const judge = async (res: Response): Promise<Outcome> => {
        if (res.ok) return 'ok';
        if (res.status === 401) return 'expired';
        if (res.status === 403) {
          const text = await res.text().catch(() => '');
          if (/insufficient|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(text)) return 'reconnect';
        }
        return { error: `Google Calendar returned ${res.status}.` };
      };
      const stop = (o: Exclude<Outcome, 'ok'>) => {
        if (o === 'expired') setInfo((p) => ({ ...p, status: 'expired' }));
        else if (o === 'reconnect') setInfo((p) => ({ ...p, status: 'expired', error: RECONNECT_HINT }));
        else setInfo((p) => ({ ...p, status: 'error', error: o.error }));
      };
      const remember = (o: OwnEvent) => {
        ownRef.current = [...(ownRef.current ?? []).filter((e) => e.blockId !== o.blockId), o];
      };
      const toOwn = (b: TimeBlock): OwnEvent => ({ blockId: b.id, date: b.date, start: b.start, end: b.end, title: b.title });
      const patchBody = (b: TimeBlock) => {
        const { id: _id, ...rest } = blockToEvent(b, timeZone);
        return rest;
      };
      for (const b of [...plan.insert, ...plan.patch]) {
        let res = plan.patch.includes(b) ? await call('PATCH', eventUrl(b.id), patchBody(b)) : await call('POST', EVENTS_URL, blockToEvent(b, timeZone));
        if (res.status === 409) res = await call('PATCH', eventUrl(b.id), patchBody(b));
        const out = await judge(res);
        if (out !== 'ok') return stop(out);
        remember(toOwn(b));
      }
      for (const blockId of plan.remove) {
        const res = await call('DELETE', eventUrl(blockId));
        const out = res.status === 404 || res.status === 410 ? 'ok' : await judge(res);
        if (out !== 'ok') return stop(out);
        ownRef.current = (ownRef.current ?? []).filter((e) => e.blockId !== blockId);
      }
      if (plan.insert.length + plan.patch.length + plan.remove.length > 0) setInfo((p) => ({ ...p, lastPushAt: new Date().toISOString() }));
    } catch (e) {
      setInfo((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : 'Could not reach Google Calendar.' }));
    } finally {
      pushing.current = false;
      if (pushAgain.current && infoRef.current.status === 'connected') {
        pushAgain.current = false;
        void reconcileRef.current();
      }
    }
  }, [authed]);
  reconcileRef.current = reconcile;

  // Blocks changed (or the toggle/connection changed): mirror them a few seconds later.
  useEffect(() => {
    if (!calendarWrite || info.status !== 'connected') return;
    const t = setTimeout(() => void reconcileRef.current(), PUSH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [calendarWrite, info.status, state.blocks]);
  // Turning the toggle on pushes right away.
  useEffect(() => {
    if (calendarWrite) void reconcileRef.current();
  }, [calendarWrite]);

  // A fresh Google token (after a Calendar sign-in) triggers an import, once the initial cloud pull is done
  // (or there is no sync), and again after a later pull replaces state. Only a new token forces past a disconnect.
  // Runs on app load too: the token is kept across reloads and renewed on demand. Only a calendar already linked
  // (here or on another device), or a Connect the user just made, may import.
  const importedKey = useRef('');
  useEffect(() => {
    if (!providerToken || (sync.status !== 'synced' && sync.status !== 'off')) return;
    const asked = connectFlag.get();
    if (!linked && !asked) return;
    const key = `${providerToken}|${sync.lastSyncAt ?? ''}|${linked}`;
    if (importedKey.current === key) return;
    importedKey.current = key;
    connectFlag.clear();
    void refresh(undefined, { force: asked });
    // refresh identity changes with settings; only a new token, pull or link should re-import.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerToken, sync.status, sync.lastSyncAt, linked]);

  // Whether the stored token has been tried yet: until then a linked calendar reads "loading", not "reconnect".
  useEffect(() => {
    if (authStatus !== 'signed-in') {
      setResolved(false);
      return;
    }
    if (providerToken) {
      setResolved(true);
      return;
    }
    let live = true;
    void ensureGoogleToken().finally(() => live && setResolved(true));
    return () => {
      live = false;
    };
  }, [authStatus, providerToken, ensureGoogleToken]);

  // Signed out: drop stale info. A disconnect pulled from another device resets it too.
  useEffect(() => {
    if (authStatus === 'signed-out') setInfo((i) => (i.status === 'off' ? i : { status: 'off' }));
  }, [authStatus]);
  const wasLinked = useRef(linked);
  useEffect(() => {
    if (wasLinked.current && !linked) setInfo((i) => (i.status === 'off' ? i : { status: 'off' }));
    wasLinked.current = linked;
  }, [linked]);

  // Back to the tab after a while: import again.
  useEffect(() => {
    const onVisible = () => {
      const cur = infoRef.current;
      if (document.visibilityState !== 'visible' || !linkedRef.current || cur.status !== 'connected' || !cur.lastImportAt) return;
      if (Date.now() - new Date(cur.lastImportAt).getTime() > STALE_MS) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const connect = useCallback(() => {
    connectFlag.set();
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

  const syncNow = useCallback(() => refresh(undefined, { force: true, renew: true }), [refresh]);

  // Linked but no usable token (other device, or renewal failed): the user must reconnect.
  const lapsed = linked && !providerToken && (info.status === 'off' || info.status === 'connected');
  const status: CalendarStatus = authStatus !== 'signed-in' ? 'off' : lapsed ? (resolved ? 'expired' : 'loading') : info.status;

  const pending = useMemo(() => {
    const own = ownRef.current;
    const win = windowRef.current;
    if (!calendarWrite || !own || !win) return 0;
    const plan = planWrites(state.blocks, own, win);
    return plan.insert.length + plan.patch.length + plan.remove.length;
    // ownRef/windowRef change together with lastImportAt/lastPushAt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarWrite, state.blocks, info.lastImportAt, info.lastPushAt]);

  const value = useMemo(
    () => ({ status, lastImportAt: info.lastImportAt, lastPushAt: info.lastPushAt, error: info.error, connect, refresh, disconnect, syncNow, pending }),
    [status, info.lastImportAt, info.lastPushAt, info.error, connect, refresh, disconnect, syncNow, pending],
  );
  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar(): CalendarInfo {
  return useContext(CalendarContext);
}
