import { toKey } from '../lib/date';
import { useCoach } from '../state/coach';
import { useStore, useToday } from '../state/store';

/** Today's coach note, or the button that asks for one. Renders nothing without a key. */
export function CoachNote() {
  const { enabled, busy, error, dailyNote } = useCoach();
  const { state } = useStore();
  const today = useToday();
  if (!enabled) return null;
  const note = state.days[today]?.coachNote;
  const fresh = note && toKey(new Date(note.at)) === today ? note : undefined;
  const time = fresh ? new Date(fresh.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <section className="coach-note" aria-label="Coach">
      {fresh ? (
        <>
          <p className="coach-text">{fresh.text}</p>
          <p className="coach-meta num">
            Coach · {time} ·{' '}
            <button type="button" className="link-btn" disabled={busy} onClick={() => void dailyNote()}>{busy ? 'Thinking…' : 'Refresh'}</button>
          </p>
        </>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={() => void dailyNote()}>{busy ? 'Thinking…' : 'Coach, read my day'}</button>
      )}
      {error && <p role="alert" className="coach-error">{error}</p>}
    </section>
  );
}
