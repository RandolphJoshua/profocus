import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useToast } from '../components/Toaster';
import { endFocusStatus, loadSlackConfig, startFocusStatus } from '../lib/slack';
import { useStore } from './store';
import { useTimer } from './timer';

/** Set only while ProFocus owns the Slack status, so a status the user set by hand is never cleared. */
export const SLACK_ACTIVE_KEY = 'profocus:slack-active';
const MS_PER_MINUTE = 60_000;
/** Wait this long after the task title changes mid-session before updating Slack. */
const TITLE_SETTLE_MS = 1000;

let lastError = '';
const listeners = new Set<() => void>();
function setLastError(message: string) {
  if (message === lastError) return;
  lastError = message;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const getSnapshot = () => lastError;

/** The last Slack sync error ('' when the last call worked). */
export const useSlackError = (): string => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

function flag(value: '1' | null) {
  try {
    if (value) localStorage.setItem(SLACK_ACTIVE_KEY, value);
    else localStorage.removeItem(SLACK_ACTIVE_KEY);
  } catch {
    /* storage unavailable */
  }
}
function flagSet(): boolean {
  try {
    return localStorage.getItem(SLACK_ACTIVE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useSlackFocusSync(): void {
  const timer = useTimer();
  const { state } = useStore();
  const toast = useToast();
  const active = timer.mode === 'focus' && timer.running;
  const endsAt = active ? timer.endsAt : undefined;
  const taskTitle = state.tasks.find((t) => t.id === timer.taskId)?.title;
  const titleRef = useRef(taskTitle);
  titleRef.current = taskTitle;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const queue = useRef<Promise<void>>(Promise.resolve());
  const startedFor = useRef<string | undefined>(undefined);

  useEffect(() => {
    const run = (job: () => Promise<void>) => {
      queue.current = queue.current.then(job).then(
        () => setLastError(''),
        (e: unknown) => {
          const message = e instanceof Error ? e.message : "Couldn't reach Slack.";
          setLastError(message);
          toastRef.current(`Slack status: ${message}`);
        },
      );
    };
    if (active && endsAt !== undefined) {
      // Re-send when the session restarts or its task changes, so the status follows the current task.
      const key = `${endsAt}|${taskTitle ?? ''}`;
      if (startedFor.current === key) return;
      // A new session goes out at once; a title change mid-session waits so typing does not send a call per key.
      const sameSession = startedFor.current?.startsWith(`${endsAt}|`) ?? false;
      const send = () => {
        startedFor.current = key;
        const minutes = Math.max(1, Math.ceil((endsAt - Date.now()) / MS_PER_MINUTE));
        run(async () => {
          const cfg = loadSlackConfig();
          if (!cfg) return;
          await startFocusStatus(cfg, minutes, titleRef.current);
          flag('1');
        });
      };
      if (!sameSession) {
        send();
        return;
      }
      const id = window.setTimeout(send, TITLE_SETTLE_MS);
      return () => window.clearTimeout(id);
    }
    startedFor.current = undefined;
    run(async () => {
      if (!flagSet()) return;
      const cfg = loadSlackConfig();
      flag(null);
      if (cfg) await endFocusStatus(cfg);
    });
  }, [active, endsAt, taskTitle]);
}
