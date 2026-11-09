import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CommandPalette } from './components/CommandPalette';
import { FocusTimer } from './components/FocusTimer';
import { PlanDay } from './components/PlanDay';
import { PlanWeek } from './components/PlanWeek';
import { ToastProvider, useToast } from './components/Toaster';
import { startOfWeek } from './lib/date';
import { useMondaySync } from './state/mondaySync';
import { useSlackFocusSync } from './state/slackFocus';
import { useStore, useToday } from './state/store';
import { useSync } from './state/sync';
import { useTimer } from './state/timer';
import { FocusMode } from './views/FocusMode';
import { GoalsView } from './views/GoalsView';
import { HabitsView } from './views/HabitsView';
import { ReviewView } from './views/ReviewView';
import { SeasonsView } from './views/SeasonsView';
import { SettingsView } from './views/SettingsView';
import { TasksView } from './views/TasksView';
import { TodayView } from './views/TodayView';
import { WeekView } from './views/WeekView';

const VIEWS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'goals', label: 'Goals' },
  { id: 'seasons', label: 'Seasons' },
  { id: 'habits', label: 'Habits' },
  { id: 'review', label: 'Review' },
  { id: 'settings', label: 'Settings' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

/** 16px outline icons, 1.5px stroke, drawn on a 16 grid. */
const ICONS: Record<string, string> = {
  today: 'M8 2.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0 3v2.5l1.8 1.2',
  week: 'M2.5 4.5h11v8.5h-11zM2.5 7.5h11M5.5 2.5v3M10.5 2.5v3',
  tasks: 'M3 4.5h10M3 8h10M3 11.5h6',
  goals: 'M4 14V2.5M4 3h8l-1.8 3L12 9H4',
  seasons: 'M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z',
  habits: 'M3 8.5l3 3 7-7',
  review: 'M3 13V8M8 13V3.5M13 13V6',
  settings: 'M3 5h10M3 11h10M10 3v4M6 9v4',
};
function NavIcon({ id }: { id: string }) {
  return (
    <svg className="nav-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[id]} />
    </svg>
  );
}

const isViewId = (v: string): v is ViewId => VIEWS.some((x) => x.id === v);
const isFocusHash = () => window.location.hash.slice(1) === 'focus';
const viewFromHash = (): ViewId => {
  const h = window.location.hash.slice(1);
  return isViewId(h) ? h : 'today';
};

const SUPPORTS_VIEW_TRANSITIONS = typeof document !== 'undefined' && 'startViewTransition' in document;
const prefersReducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Run a state change inside a View Transition when the browser has them (and motion is allowed). */
function withViewTransition(change: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || prefersReducedMotion()) {
    change();
    return;
  }
  doc.startViewTransition(() => flushSync(change));
}

export function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function AppShell() {
  const { state, dispatch } = useStore();
  const today = useToday();
  const toast = useToast();
  const timer = useTimer();
  const sync = useSync();
  useSlackFocusSync();
  useMondaySync();
  const [view, setView] = useState<ViewId>(viewFromHash);
  // #focus is an overlay on top of whichever view was open before it.
  const [focus, setFocus] = useState(isFocusHash);
  const [navigated, setNavigated] = useState(false);
  const [palette, setPalette] = useState(false);
  const [ritual, setRitual] = useState<'day' | 'week' | null>(null);
  const viewRef = useRef(view);
  const quickAddRef = useRef<HTMLInputElement>(null);
  const inbox = state.tasks.filter((t) => !t.done && !t.date).length;

  // Switching screens fades the new one in (View Transitions where available, a CSS keyframe otherwise).
  function show(v: ViewId) {
    viewRef.current = v;
    withViewTransition(() => {
      setView(v);
      setFocus(false);
      setNavigated(true);
    });
  }

  // View lives in the URL hash so reloads and back/forward work.
  useEffect(() => {
    const onHash = () => {
      if (isFocusHash()) setFocus(true);
      else {
        const next = viewFromHash();
        if (next === viewRef.current) setFocus(false);
        else show(next);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (v: ViewId) => {
    window.location.hash = v;
    show(v);
  };

  // Theme
  useEffect(() => {
    const root = document.documentElement;
    if (state.settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!focus) setPalette((open) => !open);
        return;
      }
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) && e.key !== 'Escape') return;
      if (document.querySelector('dialog[open]')) return;
      if (focus && e.key !== ' ') return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (view !== 'today' && view !== 'tasks') go('today');
        window.setTimeout(() => (quickAddRef.current ?? document.querySelector<HTMLInputElement>('.quick-add input'))?.focus(), 0);
      } else if (/^[1-8]$/.test(e.key)) {
        const v = VIEWS[Number(e.key) - 1];
        if (v) go(v.id);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (timer.running) timer.pause();
        else timer.start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // A block removed in the editor (or anywhere) can be brought back from the toast.
  const prevBlocks = useRef(state.blocks);
  useEffect(() => {
    const before = prevBlocks.current;
    prevBlocks.current = state.blocks;
    if (state.blocks.length !== before.length - 1) return;
    const ids = new Set(state.blocks.map((b) => b.id));
    const removed = before.filter((b) => !ids.has(b.id));
    const [block] = removed;
    if (removed.length !== 1 || !block || block.source === 'google') return;
    toast('Block removed', { action: { label: 'Undo', run: () => dispatch({ type: 'ADD_BLOCK', block }) } });
  }, [state.blocks, toast, dispatch]);

  const openRitual = (kind: 'day' | 'week') => {
    if (kind === 'day' && view !== 'today') go('today');
    if (kind === 'week' && view !== 'week') go('week');
    setRitual(kind);
  };

  return (
    <div className={`app ${focus ? 'is-focus' : ''}`}>
      {focus && <FocusMode onExit={() => go(view)} />}
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar" hidden={focus}>
        <div className="brand">
          <img src="/icon.svg" alt="" width={24} height={24} />
          <span>ProFocus</span>
        </div>
        <button type="button" className="palette-btn" onClick={() => setPalette(true)} aria-haspopup="dialog">
          <span>Search</span>
          <kbd className="nav-kbd">{IS_MAC ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
        <nav aria-label="Main">
          <ul>
            {VIEWS.map((v, i) => (
              <li key={v.id}>
                <button type="button" className={`nav-btn ${view === v.id ? 'is-on' : ''}`} aria-current={view === v.id ? 'page' : undefined} onClick={() => go(v.id)}>
                  <NavIcon id={v.id} />
                  <span className="nav-label">{v.label}</span>
                  {v.id === 'tasks' && inbox > 0 && <span className="nav-count num">{inbox}</span>}
                  <kbd className="nav-kbd">{i + 1}</kbd>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {view !== 'today' && <div className="sidebar-timer"><FocusTimer compact /></div>}
        {sync.status !== 'off' && (
          <p className="sync-line" role="status">
            {sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? 'Sync error' : 'Synced'}
          </p>
        )}
      </aside>

      <main id="main" className={`main view-${view}`} hidden={focus}>
        <div key={view} className={`view ${navigated ? 'is-nav' : ''} ${SUPPORTS_VIEW_TRANSITIONS ? 'is-vt' : ''}`}>
          {view === 'today' && <TodayView quickAddRef={quickAddRef} />}
          {view === 'week' && <WeekView />}
          {view === 'tasks' && <TasksView />}
          {view === 'goals' && <GoalsView />}
          {view === 'seasons' && <SeasonsView />}
          {view === 'habits' && <HabitsView />}
          {view === 'review' && <ReviewView />}
          {view === 'settings' && <SettingsView />}
        </div>
      </main>
      {palette && !focus && (
        <CommandPalette views={VIEWS} onGo={(v) => isViewId(v) && go(v)} onRitual={openRitual} onClose={() => setPalette(false)} />
      )}
      {ritual === 'day' && view === 'today' && <PlanDay onClose={() => setRitual(null)} />}
      {ritual === 'week' && view === 'week' && <PlanWeek week={startOfWeek(today, state.settings.weekStartsOn)} onClose={() => setRitual(null)} />}
    </div>
  );
}
