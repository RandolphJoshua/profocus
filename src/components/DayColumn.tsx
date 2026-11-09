import { Fragment, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { formatMinutes, minutesNow } from '../lib/date';
import type { DateKey, ID, TimeBlock } from '../lib/types';
import { useNow, useStore } from '../state/store';

export const SNAP = 15;
/** How long a freshly dropped block flashes its tint (matches .is-flash in motion.css). */
const FLASH_MS = 400;

interface DayColumnProps {
  date: DateKey;
  hourHeight: number;
  isToday: boolean;
  /** Called with a new slot; the parent opens an editor for it. */
  onCreate: (date: DateKey, start: number, end: number) => void;
  onSelect: (block: TimeBlock) => void;
}

type Drag =
  | { mode: 'create'; anchor: number; current: number }
  | { mode: 'move' | 'resize'; id: ID; grabOffset: number; moved: boolean };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const snap = (m: number) => Math.round(m / SNAP) * SNAP;

/** Interactive timeline for a single day: drag to create, drag blocks to move (across days), drag the bottom edge to resize, drop tasks to schedule. */
export function DayColumn({ date, hourHeight, isToday, onCreate, onSelect }: DayColumnProps) {
  const { state, dispatch } = useStore();
  const { dayStartHour, dayEndHour } = state.settings;
  const dayStart = dayStartHour * 60;
  const dayEnd = dayEndHour * 60;
  const colRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ start: number; end: number } | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [lifted, setLifted] = useState<ID | null>(null);
  const [flashId, setFlashId] = useState<ID | null>(null);
  const now = useNow(60_000);

  const blocks = state.blocks.filter((b) => b.date === date).sort((a, b) => a.start - b.start);
  const pxPerMin = hourHeight / 60;

  const minAt = (clientY: number, el: HTMLElement | null = colRef.current) => {
    const rect = el?.getBoundingClientRect();
    if (!rect) return dayStart;
    return dayStart + (clientY - rect.top) / pxPerMin;
  };

  const startDrag = (e: ReactPointerEvent, drag: Drag) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    let d = drag;
    const startY = e.clientY;

    const onMove = (ev: PointerEvent) => {
      if (d.mode === 'create') {
        d = { ...d, current: clamp(snap(minAt(ev.clientY)), dayStart, dayEnd) };
        const s = Math.min(d.anchor, d.current);
        const en = Math.max(d.anchor, d.current);
        setGhost({ start: s, end: Math.max(en, s + SNAP) });
        return;
      }
      if (Math.abs(ev.clientY - startY) > 3) d = { ...d, moved: true };
      if (!d.moved) return;
      if (d.mode === 'move') setLifted(d.id);
      const block = blocksRef.current.find((b) => b.id === (d as { id: ID }).id);
      if (!block) return;
      if (d.mode === 'resize') {
        const end = clamp(snap(minAt(ev.clientY)), block.start + SNAP, dayEnd);
        if (end !== block.end) dispatch({ type: 'UPDATE_BLOCK', id: block.id, patch: { end } });
      } else {
        // Find the day column under the pointer so blocks can move between days.
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>('[data-day]');
        const targetDate = target?.dataset.day ?? block.date;
        const len = block.end - block.start;
        const start = clamp(snap(minAt(ev.clientY, target ?? colRef.current) - d.grabOffset), dayStart, dayEnd - len);
        if (start !== block.start || targetDate !== block.date) {
          dispatch({ type: 'UPDATE_BLOCK', id: block.id, patch: { start, end: start + len, date: targetDate } });
        }
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      setLifted(null);
      if (d.mode === 'create') {
        setGhost(null);
        const s = Math.min(d.anchor, d.current);
        const en = Math.max(d.anchor, d.current);
        onCreate(date, s, en - s >= SNAP ? en : Math.min(s + 30, dayEnd));
      } else if (!d.moved) {
        const block = blocksRef.current.find((b) => b.id === (d as { id: ID }).id);
        if (block) onSelect(block);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  // Latest blocks for the window listeners (which outlive a single render).
  const blocksRef = useRef(state.blocks);
  blocksRef.current = state.blocks;

  const nowMin = minutesNow(now);
  const height = (dayEnd - dayStart) * pxPerMin;

  return (
    <div
      ref={colRef}
      className={`day-col ${isToday ? 'is-today' : ''}`}
      data-day={date}
      style={{ height } as CSSProperties}
      onPointerDown={(e) => {
        const at = clamp(snap(minAt(e.clientY) - SNAP / 2), dayStart, dayEnd - SNAP);
        startDrag(e, { mode: 'create', anchor: at, current: at + SNAP });
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('text/profocus-task')) return;
        e.preventDefault();
        setDropAt(clamp(snap(minAt(e.clientY)), dayStart, dayEnd - SNAP));
      }}
      onDragLeave={() => setDropAt(null)}
      onDrop={(e) => {
        const taskId = e.dataTransfer.getData('text/profocus-task');
        setDropAt(null);
        const task = state.tasks.find((t) => t.id === taskId);
        if (!task) return;
        e.preventDefault();
        const start = clamp(snap(minAt(e.clientY)), dayStart, dayEnd - SNAP);
        const end = Math.min(start + (task.estimateMin ?? 30), dayEnd);
        const blockId = `b-${Date.now().toString(36)}`;
        setFlashId(blockId);
        window.setTimeout(() => setFlashId((cur) => (cur === blockId ? null : cur)), FLASH_MS + 50);
        dispatch({
          type: 'BATCH',
          actions: [
            { type: 'ADD_BLOCK', block: { id: blockId, date, start, end, title: task.title, kind: 'focus', taskId: task.id, projectId: task.projectId } },
            ...(task.date !== date ? [{ type: 'UPDATE_TASK' as const, id: task.id, patch: { date } }] : []),
          ],
        });
      }}
    >
      {Array.from({ length: dayEndHour - dayStartHour + 1 }, (_, i) => <i key={i} className="hour-line" style={{ top: i * hourHeight }} aria-hidden />)}
      {blocks.map((b) => {
        const task = b.taskId ? state.tasks.find((t) => t.id === b.taskId) : undefined;
        const project = state.projects.find((p) => p.id === (b.projectId ?? task?.projectId));
                const top = (Math.max(b.start, dayStart) - dayStart) * pxPerMin;
        const h = Math.max((Math.min(b.end, dayEnd) - Math.max(b.start, dayStart)) * pxPerMin, 14);
        const short = b.end - b.start <= 30;
        const external = b.source === 'google';
        return (
          <Fragment key={b.id}>
          {lifted === b.id && <div className="block ghost move-slot" style={{ top, height: h }} aria-hidden />}
          <div
            className={`block kind-${b.kind} ${task?.done ? 'is-done' : ''} ${short ? 'is-short' : ''} ${external ? 'is-external' : ''} ${lifted === b.id ? 'is-lifted' : ''} ${flashId === b.id ? 'is-flash' : ''}`}
            style={{ top, height: h, '--c': project?.color } as CSSProperties}
            onPointerDown={external ? (e) => e.stopPropagation() : (e) => startDrag(e, { mode: 'move', id: b.id, grabOffset: minAt(e.clientY) - b.start, moved: false })}
            onClick={external ? () => onSelect(b) : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(b);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`${b.title}, ${formatMinutes(b.start)} to ${formatMinutes(b.end)}`}
          >
            <span className="block-title">{external && <span className="block-source" aria-hidden>G</span>}{project && <i className="dot" />}{b.title || 'Untitled'}</span>
            <span className="block-time num">{formatMinutes(b.start)} – {formatMinutes(b.end)}</span>
            {!external && (
              <span
                className="block-resize"
                onPointerDown={(e) => startDrag(e, { mode: 'resize', id: b.id, grabOffset: 0, moved: false })}
                aria-hidden
              />
            )}
          </div>
          </Fragment>
        );
      })}

      {ghost && (
        <div className="block ghost" style={{ top: (ghost.start - dayStart) * pxPerMin, height: (ghost.end - ghost.start) * pxPerMin }}>
          <span className="block-time num">{formatMinutes(ghost.start)} – {formatMinutes(ghost.end)}</span>
        </div>
      )}
      {dropAt !== null && <div className="drop-line" style={{ top: (dropAt - dayStart) * pxPerMin }}><span>{formatMinutes(dropAt)}</span></div>}
      {isToday && nowMin >= dayStart && nowMin <= dayEnd && (
        <div className="now-line" style={{ top: (nowMin - dayStart) * pxPerMin }} aria-hidden>
          <span className="now-time num">{formatMinutes(nowMin)}</span>
        </div>
      )}
    </div>
  );
}

export function TimeGutter({ hourHeight }: { hourHeight: number }) {
  const { state } = useStore();
  const { dayStartHour, dayEndHour } = state.settings;
  const hours = Array.from({ length: dayEndHour - dayStartHour }, (_, i) => dayStartHour + i);
  return (
    <div className="gutter" style={{ height: (dayEndHour - dayStartHour) * hourHeight }} aria-hidden>
      {hours.map((h) => (
        <span key={h} style={{ top: (h - dayStartHour) * hourHeight }}>{formatMinutes(h * 60).replace(':00', '')}</span>
      ))}
    </div>
  );
}
