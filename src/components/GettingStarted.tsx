import { startOfWeek } from '../lib/date';
import { currentSeason } from '../lib/stats';
import { useAuth } from '../state/auth';
import { useStore, useToday } from '../state/store';

interface Step {
  id: string;
  label: string;
  action: string;
  done: boolean;
  go: () => void;
}

function useAuthStatus() {
  try {
    return useAuth().status;
  } catch {
    return 'disabled' as const; // rendered without an AuthProvider
  }
}

const goTo = (hash: string) => () => { window.location.hash = hash; };
const isDemo = () => window.location.search.includes('demo=1');

/** Compact first-run checklist; ticks itself from real state and hides when finished or dismissed. */
export function GettingStarted({ onPlanDay }: { onPlanDay: () => void }) {
  const { state, dispatch } = useStore();
  const today = useToday();
  const authStatus = useAuthStatus();
  if (state.settings.onboardingHidden || isDemo()) return null;

  const accounts = authStatus !== 'disabled';
  const week = startOfWeek(today, state.settings.weekStartsOn);
  const steps: Step[] = [
    ...(accounts
      ? [
          { id: 'signin', label: 'Sign in to keep your plan on every device', action: 'Sign in', done: authStatus === 'signed-in', go: goTo('settings') },
          { id: 'calendar', label: 'Connect Google Calendar', action: 'Connect', done: !!state.settings.calendarConnected, go: goTo('settings') },
        ]
      : []),
    { id: 'season', label: 'Start a season', action: 'Choose goals', done: !!currentSeason(state.seasons, today), go: goTo('seasons') },
    { id: 'week', label: 'Plan your week', action: 'Plan week', done: !!state.reviews[week]?.plannedAt, go: goTo('week') },
    { id: 'day', label: 'Plan your day', action: 'Plan day', done: !!state.days[today]?.plannedAt, go: onPlanDay },
  ];
  const finished = steps.filter((s) => s.done).length;
  if (finished === steps.length) return null;

  return (
    <section className="panel started" aria-label="Getting started">
      <div className="started-head">
        <h2 className="panel-title">Getting started</h2>
        <span className="muted num">{finished} of {steps.length}</span>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={() => dispatch({ type: 'SET_SETTINGS', patch: { onboardingHidden: true } })}>Hide</button>
      </div>
      <ul className="started-list">
        {steps.map((s) => (
          <li key={s.id} className={s.done ? 'is-done' : ''}>
            <span className={`started-check ${s.done ? 'is-on' : ''}`} aria-hidden />
            <span className="started-label">{s.label}{s.done && <span className="sr-only"> (done)</span>}</span>
            {!s.done && <button type="button" className="link-btn" onClick={s.go}>{s.action}</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
