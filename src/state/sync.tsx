import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal } from '../components/Modal';
import { normalizeState, loadSavedAt } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { chooseSource, isTouched, loadSyncLink, saveSyncLink, stateHash } from '../lib/sync';
import type { AppState } from '../lib/types';
import { useAuth } from './auth';
import { useStore } from './store';

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'error';
export interface SyncInfo {
  status: SyncStatus;
  lastSyncAt?: string;
  error?: string;
}

const PUSH_DELAY_MS = 1500;
const TABLE = 'planner_state';

interface Row {
  state: unknown;
  updated_at: string;
}

const SyncContext = createContext<SyncInfo>({ status: 'off' });

const message = (e: unknown): string => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Sync failed.');

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { state, dispatch } = useStore();
  const userId = user?.id ?? null;
  const [info, setInfo] = useState<SyncInfo>({ status: 'off' });
  const [pending, setPending] = useState<Row | null>(null);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  // The state object last pushed to, or pulled from, the cloud: changes that are not ours to push.
  const syncedState = useRef<AppState | null>(null);
  const stamp = useRef<string>('');
  const userRef = useRef(userId);
  userRef.current = userId;
  // Remember what this device and the cloud last agreed on, so the next load does not ask again.
  const link = useCallback((at: string, snapshot: AppState) => {
    if (userRef.current) saveSyncLink({ userId: userRef.current, at, hash: stateHash(normalizeState(snapshot)) });
  }, []);

  const fail = useCallback((e: unknown) => setInfo((p) => ({ ...p, status: 'error', error: message(e) })), []);
  const done = useCallback((at: string) => setInfo({ status: 'synced', lastSyncAt: at }), []);

  const pull = useCallback((row: Row) => {
    const next = normalizeState(row.state);
    syncedState.current = next;
    stamp.current = row.updated_at;
    link(row.updated_at, next);
    dispatch({ type: 'REPLACE_STATE', state: next });
    done(row.updated_at);
  }, [dispatch, done, link]);

  const push = useCallback(async (id: string, snapshot: AppState) => {
    if (!supabase) return;
    setInfo((p) => ({ ...p, status: 'syncing', error: undefined }));
    const updatedAt = new Date().toISOString();
    try {
      const { error } = await supabase.from(TABLE).upsert({ user_id: id, state: snapshot, updated_at: updatedAt });
      if (error) throw error;
      syncedState.current = snapshot;
      stamp.current = updatedAt;
      link(updatedAt, snapshot);
      done(updatedAt);
    } catch (e) {
      fail(e);
    }
  }, [done, fail, link]);

  // Sign-in: decide which copy wins, once.
  useEffect(() => {
    setReady(false);
    setPending(null);
    syncedState.current = null;
    stamp.current = '';
    if (!supabase || !userId) {
      setInfo({ status: 'off' });
      return;
    }
    const client = supabase;
    let live = true;
    setInfo({ status: 'syncing' });
    (async () => {
      try {
        const { data, error } = await client.from(TABLE).select('state, updated_at').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (!live) return;
        const row = data as Row | null;
        const choice = chooseSource({
          localTouched: isTouched(stateRef.current),
          localSavedAt: loadSavedAt(),
          remote: row ? { updatedAt: row.updated_at, touched: isTouched(normalizeState(row.state)) } : undefined,
          userId,
          link: loadSyncLink(),
          localHash: stateHash(normalizeState(stateRef.current)),
        });
        if (choice === 'ask' && row) {
          setInfo({ status: 'syncing' });
          setPending(row);
          return;
        }
        if (choice === 'remote' && row) pull(row);
        else await push(userId, stateRef.current);
        if (live) setReady(true);
      } catch (e) {
        if (live) fail(e);
      }
    })();
    return () => {
      live = false;
    };
  }, [userId, pull, push, fail]);

  // Debounced push of every local change.
  useEffect(() => {
    if (!ready || !userId || state === syncedState.current) return;
    const id = window.setTimeout(() => void push(userId, state), PUSH_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [state, ready, userId, push]);

  // Pick up another device's writes when the tab comes back.
  useEffect(() => {
    if (!ready || !userId || !supabase) return;
    const client = supabase;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const head = await client.from(TABLE).select('updated_at').eq('user_id', userId).maybeSingle();
        if (head.error) throw head.error;
        const remoteAt = (head.data as { updated_at: string } | null)?.updated_at;
        if (!remoteAt || remoteAt <= stamp.current) return;
        const full = await client.from(TABLE).select('state, updated_at').eq('user_id', userId).maybeSingle();
        if (full.error) throw full.error;
        if (full.data) pull(full.data as Row);
      } catch (e) {
        fail(e);
      } finally {
        busy = false;
      }
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [ready, userId, pull, fail]);

  const choose = async (source: 'remote' | 'local') => {
    const row = pending;
    setPending(null);
    if (!row || !userId) return;
    if (source === 'remote') pull(row);
    else await push(userId, stateRef.current);
    setReady(true);
  };

  const value = useMemo(() => info, [info]);
  return (
    <SyncContext.Provider value={value}>
      {children}
      {pending && (
        <Modal
          title="Which data should this device use?"
          onClose={() => {
            setPending(null);
            fail(new Error('Not syncing on this device until you choose. Reload to pick.'));
          }}
        >
          <div className="stack">
            <p className="muted">This device and your account both have data. The copy you do not pick is replaced.</p>
            <button type="button" className="btn" onClick={() => void choose('remote')}>
              Use cloud data (from {new Date(pending.updated_at).toLocaleDateString()})
            </button>
            <button type="button" className="btn" onClick={() => void choose('local')}>
              Keep this device&apos;s data and upload it
            </button>
          </div>
        </Modal>
      )}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncInfo {
  return useContext(SyncContext);
}
