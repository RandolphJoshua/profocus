import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useToast } from '../components/Toaster';
import { fetchBoardItems, itemsToNewTasks, loadMondayConfig, mergeSeen, titleKey } from '../lib/monday';
import type { AppState, Task } from '../lib/types';
import type { Action } from './reducer';
import { useStore } from './store';

const SYNC_EVERY_MS = 10 * 60_000;

export interface MondayStatus {
  error: string;
  lastSyncAt?: number;
  lastNew: number;
  /** Open items found by the baseline run, offered as "Import N open items already there". */
  importable: Task[];
}

let status: MondayStatus = { error: '', lastNew: 0, importable: [] };
const listeners = new Set<() => void>();
function setStatus(patch: Partial<MondayStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const getSnapshot = () => status;

export const useMondayStatus = (): MondayStatus => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** Test hook: put the module store back to its start. */
export function resetMondayStatus(): void {
  setStatus({ error: '', lastSyncAt: undefined, lastNew: 0, importable: [] });
}

let inFlight = false;

const openTitles = (state: AppState): Set<string> => new Set(state.tasks.filter((t) => !t.done).map((t) => titleKey(t.title)));

interface Deps {
  getState: () => AppState;
  dispatch: (a: Action) => void;
  toast: ReturnType<typeof useToast>;
  fetchImpl?: typeof fetch;
}

const viewTasks = () => { window.location.hash = 'tasks'; };

async function runSync({ getState, dispatch, toast, fetchImpl }: Deps): Promise<void> {
  const cfg = loadMondayConfig();
  if (!cfg || inFlight) return;
  inFlight = true;
  try {
    const { meId, items } = await fetchBoardItems(cfg, fetchImpl);
    const state = getState();
    const base = { meId, mineOnly: cfg.mineOnly, projectId: cfg.projectId, now: new Date().toISOString(), boardId: cfg.boardId };
    const known = state.settings.mondaySeen;
    if (!known) {
      // First sync after connecting: record everything as seen and import nothing.
      const { tasks, seenIds } = itemsToNewTasks(items, { ...base, seen: new Set(), existingTitles: openTitles(state) });
      dispatch({ type: 'SET_SETTINGS', patch: { mondaySeen: mergeSeen([], seenIds) } });
      setStatus({ error: '', lastSyncAt: Date.now(), lastNew: 0, importable: tasks });
      toast('Connected. New items from now on will appear in Tasks.');
      return;
    }
    const { tasks, seenIds } = itemsToNewTasks(items, { ...base, seen: new Set(known), existingTitles: openTitles(state) });
    if (seenIds.length) {
      dispatch({
        type: 'BATCH',
        actions: [
          ...tasks.map((task): Action => ({ type: 'ADD_TASK', task })),
          { type: 'SET_SETTINGS', patch: { mondaySeen: mergeSeen(known, seenIds) } },
        ],
      });
    }
    setStatus({ error: '', lastSyncAt: Date.now(), lastNew: tasks.length });
    const [first] = tasks;
    if (first) {
      const text = tasks.length === 1 ? `New from monday: ${first.title}` : `${tasks.length} new tasks from monday`;
      toast(text, { action: { label: 'View', run: viewTasks } });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't reach monday.";
    const changed = message !== status.error;
    setStatus({ error: message });
    if (changed) toast(`monday: ${message}`);
  } finally {
    inFlight = false;
  }
}

/** Actions for the Settings section: sync on demand, and import what the baseline run skipped. */
export function useMondayActions() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const stateRef = useRef(state);
  stateRef.current = state;
  const syncNow = useCallback(() => runSync({ getState: () => stateRef.current, dispatch, toast }), [dispatch, toast]);
  const importExisting = useCallback(() => {
    const titles = openTitles(stateRef.current);
    const fresh = status.importable.filter((t) => !titles.has(titleKey(t.title)));
    if (fresh.length) dispatch({ type: 'BATCH', actions: fresh.map((task): Action => ({ type: 'ADD_TASK', task })) });
    setStatus({ importable: [], lastNew: fresh.length });
    toast(fresh.length ? `Imported ${fresh.length} ${fresh.length === 1 ? 'task' : 'tasks'} from monday` : 'Nothing new to import', fresh.length ? { action: { label: 'View', run: viewTasks } } : undefined);
  }, [dispatch, toast]);
  return { syncNow, importExisting };
}

/** Poll the board while configured: on load, every 10 minutes while visible, and when the tab returns. */
export function useMondaySync(): void {
  const { syncNow } = useMondayActions();
  const syncRef = useRef(syncNow);
  syncRef.current = syncNow;
  useEffect(() => {
    const visible = () => document.visibilityState === 'visible';
    const run = () => { if (visible()) void syncRef.current(); };
    run();
    const id = window.setInterval(run, SYNC_EVERY_MS);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', run);
    };
  }, []);
}
