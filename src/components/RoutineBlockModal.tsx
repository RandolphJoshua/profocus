import { formatDay, formatMinutes } from '../lib/date';
import { uid } from '../lib/storage';
import type { TimeBlock } from '../lib/types';
import { useStore } from '../state/store';
import { Modal } from './Modal';
import { useToast } from './Toaster';

/** The editor for a routine instance on one day: read-only details plus skip, edit-the-routine and one-off copy. */
export function RoutineBlockModal({ draft, onClose }: { draft: Omit<TimeBlock, 'id'> & { id?: string }; onClose: () => void }) {
  const { dispatch } = useStore();
  const toast = useToast();
  const routineId = draft.routineId;
  if (!routineId) return null;
  const weekday = formatDay(draft.date, { weekday: 'long' });

  const skip = () => {
    dispatch({ type: 'SKIP_ROUTINE', id: routineId, date: draft.date });
    toast(`Skipped ${draft.title} on ${weekday}`, { action: { label: 'Undo', run: () => dispatch({ type: 'UNSKIP_ROUTINE', id: routineId, date: draft.date }) } });
    onClose();
  };
  const copyOnce = () => {
    const { id: _id, routineId: _routineId, ...fields } = draft;
    dispatch({
      type: 'BATCH',
      actions: [
        { type: 'ADD_BLOCK', block: { ...fields, id: uid('b-') } },
        { type: 'SKIP_ROUTINE', id: routineId, date: draft.date },
      ],
    });
    toast(`Made a one-off copy of ${draft.title}`);
    onClose();
  };
  const editRoutine = () => {
    onClose();
    window.location.hash = 'habits';
    window.setTimeout(() => document.getElementById('routines')?.scrollIntoView?.({ block: 'start' }), 200);
  };

  return (
    <Modal title={draft.title || 'Routine'} onClose={onClose}>
      <div className="stack">
        <p className="muted">{formatDay(draft.date)} · repeats</p>
        <p className="num">{formatMinutes(draft.start)} – {formatMinutes(draft.end)}</p>
        {draft.notes ? <p className="routine-notes">{draft.notes}</p> : <p className="muted">No notes.</p>}
        <div className="row gap wrap">
          <button type="button" className="btn primary" onClick={skip}>Skip {weekday}</button>
          <button type="button" className="btn" onClick={copyOnce}>Make a one-off copy</button>
          <button type="button" className="btn" onClick={editRoutine}>Edit routine…</button>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
