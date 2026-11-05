import { useState } from 'react';
import { formatDay, formatMinutes } from '../lib/date';
import { uid } from '../lib/storage';
import type { BlockKind, DateKey, TimeBlock } from '../lib/types';
import { useStore } from '../state/store';
import { useTimer } from '../state/timer';
import { Modal } from './Modal';

export type BlockDraft = Omit<TimeBlock, 'id'> & { id?: string };

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fromTime = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function newDraft(date: DateKey, start: number, end: number): BlockDraft {
  return { date, start, end, title: '', kind: 'focus' };
}

/** Create / edit a calendar block. */
export function BlockEditor({ draft, onClose }: { draft: BlockDraft; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const timer = useTimer();
  const [b, setB] = useState<BlockDraft>(draft);
  const isNew = !draft.id;
  const candidates = state.tasks.filter((t) => !t.done && (t.date === b.date || !t.date || t.id === b.taskId));

  const save = () => {
    const linked = state.tasks.find((t) => t.id === b.taskId);
    const block: TimeBlock = {
      ...b,
      id: b.id ?? uid('b-'),
      title: b.title.trim() || linked?.title || 'Focus block',
      end: Math.max(b.end, b.start + 5),
      projectId: b.projectId ?? linked?.projectId,
    };
    dispatch(isNew ? { type: 'ADD_BLOCK', block } : { type: 'UPDATE_BLOCK', id: block.id, patch: block });
    onClose();
  };

  if (draft.source === 'google') {
    return (
      <Modal title={draft.title || 'Busy'} onClose={onClose}>
        <div className="stack">
          <p className="muted">{formatDay(draft.date)}</p>
          <p className="num">{formatMinutes(draft.start)} – {formatMinutes(draft.end)}</p>
          <p className="muted">From Google Calendar</p>
          <div className="row gap">
            <button type="button" className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={isNew ? 'New time block' : 'Edit time block'} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="muted">{formatDay(b.date)}</p>
        <label>What are you doing?
          <input autoFocus value={b.title} placeholder="Deep work: chapter 3" onChange={(e) => setB({ ...b, title: e.target.value })} />
        </label>
        <div className="grid-3">
          <label>Start<input type="time" step={300} value={toTime(b.start)} onChange={(e) => setB({ ...b, start: fromTime(e.target.value) })} /></label>
          <label>End<input type="time" step={300} value={toTime(b.end)} onChange={(e) => setB({ ...b, end: fromTime(e.target.value) })} /></label>
          <label>Type
            <select value={b.kind} onChange={(e) => setB({ ...b, kind: e.target.value as BlockKind })}>
              <option value="focus">Focus</option>
              <option value="meeting">Meeting</option>
              <option value="personal">Personal</option>
              <option value="break">Break</option>
            </select>
          </label>
        </div>
        <label>Linked task
          <select
            value={b.taskId ?? ''}
            onChange={(e) => {
              const t = state.tasks.find((x) => x.id === e.target.value);
              setB({ ...b, taskId: t?.id, title: b.title || t?.title || '', projectId: t?.projectId ?? b.projectId });
            }}
          >
            <option value="">None</option>
            {candidates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </label>
        <label>Project
          <select value={b.projectId ?? ''} onChange={(e) => setB({ ...b, projectId: e.target.value || undefined })}>
            <option value="">None</option>
            {state.projects.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="row gap">
          <button type="submit" className="btn primary">{isNew ? 'Add block' : 'Save'}</button>
          {!isNew && b.kind === 'focus' && (
            <button type="button" className="btn" onClick={() => {
              save();
              if (timer.mode !== 'focus') timer.setMode('focus');
              timer.start(b.taskId);
            }}>Start focus</button>
          )}
          <span className="spacer" />
          {!isNew && (
            <button type="button" className="btn danger" onClick={() => {
              dispatch({ type: 'DELETE_BLOCK', id: b.id! });
              onClose();
            }}>Delete</button>
          )}
        </div>
      </form>
    </Modal>
  );
}
