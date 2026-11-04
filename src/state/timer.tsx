import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatClock, todayKey } from '../lib/date';
import { uid } from '../lib/storage';
import type { ID } from '../lib/types';
import { useStore } from './store';

export type TimerMode = 'focus' | 'short' | 'long';

interface TimerState {
  mode: TimerMode;
  running: boolean;
  /** Epoch ms when the running timer ends. */
  endsAt?: number;
  /** Remaining ms while paused / idle. */
  remainingMs: number;
  /** Planned length of the current interval, in minutes. */
  plannedMin: number;
  taskId?: ID;
  /** Focus intervals completed in the current cycle. */
  cycleCount: number;
  startedAt?: string;
}

interface TimerValue extends TimerState {
  remainingSec: number;
  start: (taskId?: ID) => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  stopAndLog: () => void;
  setMode: (mode: TimerMode) => void;
  setTask: (taskId?: ID) => void;
  /** Id of the most recently logged focus session (for rating it). */
  lastSessionId?: ID;
}

const TIMER_KEY = 'profocus:timer';
const TimerContext = createContext<TimerValue | null>(null);

function beep() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    [0, 0.25, 0.5].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 2 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.25);
    });
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Audio unavailable; ignore.
  }
}

function notify(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/icon.svg' });
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}

export function TimerProvider({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const { settings } = state;
  const lengthOf = useCallback(
    (mode: TimerMode) => (mode === 'focus' ? settings.focusMin : mode === 'short' ? settings.shortBreakMin : settings.longBreakMin),
    [settings.focusMin, settings.shortBreakMin, settings.longBreakMin],
  );

  const [timer, setTimer] = useState<TimerState>(() => {
    try {
      const saved = localStorage.getItem(TIMER_KEY);
      if (saved) return JSON.parse(saved) as TimerState;
    } catch {
      // fall through
    }
    return { mode: 'focus', running: false, remainingMs: settings.focusMin * 60_000, plannedMin: settings.focusMin, cycleCount: 0 };
  });
  const [, force] = useState(0);
  const [lastSessionId, setLastSessionId] = useState<ID | undefined>();
  const timerRef = useRef(timer);
  timerRef.current = timer;

  useEffect(() => {
    try {
      localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    } catch {
      // ignore
    }
  }, [timer]);

  // When idle, keep the display in step with settings changes.
  useEffect(() => {
    setTimer((t) => {
      if (t.running || t.remainingMs !== t.plannedMin * 60_000) return t;
      const len = lengthOf(t.mode);
      return { ...t, plannedMin: len, remainingMs: len * 60_000 };
    });
  }, [lengthOf]);

  const logFocus = useCallback(
    (minutes: number, t: TimerState) => {
      if (minutes < 1) return;
      const task = state.tasks.find((x) => x.id === t.taskId);
      const id = uid('s-');
      setLastSessionId(id);
      dispatch({
        type: 'LOG_SESSION',
        session: {
          id,
          startedAt: t.startedAt ?? new Date().toISOString(),
          date: todayKey(),
          minutes,
          taskId: t.taskId,
          projectId: task?.projectId,
          intention: state.days[todayKey()]?.intention || undefined,
        },
      });
    },
    [dispatch, state.tasks, state.days],
  );

  /** End the current interval. `completed` = it ran to zero (log it, chime); false = skipped. */
  const finish = useCallback((completed: boolean) => {
    const t = timerRef.current;
    if (completed && settings.sound) beep();
    if (t.mode === 'focus') {
      if (completed) logFocus(t.plannedMin, t);
      const cycleCount = t.cycleCount + 1;
      const next: TimerMode = cycleCount % settings.longBreakEvery === 0 ? 'long' : 'short';
      if (completed) notify('Focus session complete', `Nice work. Time for a ${next === 'long' ? 'long' : 'short'} break.`);
      setTimer({ ...t, mode: next, running: false, endsAt: undefined, cycleCount, plannedMin: lengthOf(next), remainingMs: lengthOf(next) * 60_000, startedAt: undefined });
    } else {
      if (completed) notify('Break over', 'Ready for the next focus session?');
      setTimer({ ...t, mode: 'focus', running: false, endsAt: undefined, plannedMin: lengthOf('focus'), remainingMs: lengthOf('focus') * 60_000, startedAt: undefined });
    }
  }, [lengthOf, logFocus, settings.longBreakEvery, settings.sound]);

  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => {
      const t = timerRef.current;
      if (t.running && t.endsAt && Date.now() >= t.endsAt) finish(true);
      else force((n) => n + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [timer.running, finish]);

  const remainingMs = timer.running && timer.endsAt ? Math.max(0, timer.endsAt - Date.now()) : timer.remainingMs;
  const remainingSec = Math.ceil(remainingMs / 1000);

  useEffect(() => {
    const base = 'ProFocus';
    document.title = timer.running ? `${formatClock(remainingSec)} · ${timer.mode === 'focus' ? 'Focus' : 'Break'} — ${base}` : base;
  }, [remainingSec, timer.running, timer.mode]);

  const value = useMemo<TimerValue>(() => ({
    ...timer,
    remainingSec,
    lastSessionId,
    start: (taskId) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        void Notification.requestPermission();
      }
      setTimer((t) => ({
        ...t,
        taskId: taskId ?? t.taskId,
        running: true,
        endsAt: Date.now() + t.remainingMs,
        startedAt: t.startedAt ?? new Date().toISOString(),
      }));
    },
    pause: () => setTimer((t) => ({ ...t, running: false, endsAt: undefined, remainingMs: t.endsAt ? Math.max(0, t.endsAt - Date.now()) : t.remainingMs })),
    reset: () => setTimer((t) => ({ ...t, running: false, endsAt: undefined, remainingMs: lengthOf(t.mode) * 60_000, plannedMin: lengthOf(t.mode), startedAt: undefined })),
    skip: () => finish(false),
    stopAndLog: () => {
      const t = timerRef.current;
      const left = t.running && t.endsAt ? t.endsAt - Date.now() : t.remainingMs;
      if (t.mode === 'focus') logFocus(Math.floor((t.plannedMin * 60_000 - left) / 60_000), t);
      setTimer({ ...t, running: false, endsAt: undefined, remainingMs: lengthOf(t.mode) * 60_000, plannedMin: lengthOf(t.mode), startedAt: undefined });
    },
    setMode: (mode) => setTimer((t) => ({ ...t, mode, running: false, endsAt: undefined, plannedMin: lengthOf(mode), remainingMs: lengthOf(mode) * 60_000, startedAt: undefined })),
    setTask: (taskId) => setTimer((t) => ({ ...t, taskId })),
  }), [timer, remainingSec, lastSessionId, finish, lengthOf, logFocus]);

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer(): TimerValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used inside <TimerProvider>');
  return ctx;
}
