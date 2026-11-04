import { useEffect, useRef, useState } from 'react';
import { FocusTimer } from './components/FocusTimer';
import { useStore } from './state/store';
import { useTimer } from './state/timer';
import { HabitsView } from './views/HabitsView';
import { ReviewView } from './views/ReviewView';
import { SettingsView } from './views/SettingsView';
import { TasksView } from './views/TasksView';
import { TodayView } from './views/TodayView';
import { WeekView } from './views/WeekView';

const VIEWS = [
  { id: 'today', label: 'Today', icon: '◉' },
  { id: 'week', label: 'Week', icon: '▦' },
  { id: 'tasks', label: 'Tasks', icon: '☰' },
  { id: 'habits', label: 'Habits', icon: '✓' },
  { id: 'review', label: 'Review', icon: '◔' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
] as const;
type ViewId = (typeof VIEWS)[number]['id'];

const isViewId = (v: string): v is ViewId => VIEWS.some((x) => x.id === v);
const viewFromHash = (): ViewId => {
  const h = window.location.hash.slice(1);
  return isViewId(h) ? h : 'today';
};

export function App() {
  const { state } = useStore();
  const timer = useTimer();
  const [view, setView] = useState<ViewId>(viewFromHash);
  const quickAddRef = useRef<HTMLInputElement>(null);

  // View lives in the URL hash so reloads and back/forward work.
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (v: ViewId) => {
    window.location.hash = v;
    setView(v);
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
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) && e.key !== 'Escape') return;
      if (document.querySelector('dialog[open]')) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (view !== 'today' && view !== 'tasks') go('today');
        window.setTimeout(() => (quickAddRef.current ?? document.querySelector<HTMLInputElement>('.quick-add input'))?.focus(), 0);
      } else if (/^[1-6]$/.test(e.key)) {
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

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar">
        <div className="brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <span>ProFocus</span>
        </div>
        <nav aria-label="Main">
          <ul>
            {VIEWS.map((v, i) => (
              <li key={v.id}>
                <button type="button" className={`nav-btn ${view === v.id ? 'is-on' : ''}`} aria-current={view === v.id ? 'page' : undefined} onClick={() => go(v.id)}>
                  <span className="nav-icon" aria-hidden>{v.icon}</span>
                  <span className="nav-label">{v.label}</span>
                  <kbd className="nav-kbd">{i + 1}</kbd>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        {view !== 'today' && <div className="sidebar-timer"><FocusTimer compact /></div>}
      </aside>

      <main id="main" className={`main view-${view}`}>
        {view === 'today' && <TodayView quickAddRef={quickAddRef} />}
        {view === 'week' && <WeekView />}
        {view === 'tasks' && <TasksView />}
        {view === 'habits' && <HabitsView />}
        {view === 'review' && <ReviewView />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
