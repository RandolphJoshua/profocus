import { useEffect, useMemo, useRef, useState } from 'react';
import { parseQuickAdd } from '../lib/parse';
import { quickAddActions } from '../state/reducer';
import { useStore, useToday } from '../state/store';
import { useTimer } from '../state/timer';
import { useToast } from './Toaster';

interface Command {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  views: readonly { id: string; label: string }[];
  onGo: (view: string) => void;
  onRitual: (kind: 'day' | 'week') => void;
  onClose: () => void;
}

const MAX_TASK_RESULTS = 6;

/** ⌘K / Ctrl+K: jump to a screen, run a ritual, add a task with the quick-add grammar, or focus on a task. */
export function CommandPalette({ views, onGo, onRitual, onClose }: CommandPaletteProps) {
  const { state, dispatch } = useStore();
  const timer = useTimer();
  const today = useToday();
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal?.();
    return () => dialog?.close?.();
  }, []);

  const items = useMemo<Command[]>(() => {
    const text = query.trim();
    const needle = text.toLowerCase();
    const startFocus = (taskId?: string) => {
      if (timer.mode !== 'focus') timer.setMode('focus');
      timer.start(taskId);
    };
    const commands: Command[] = [
      ...views.map((v) => ({ id: `go-${v.id}`, label: `Go to ${v.label}`, run: () => onGo(v.id) })),
      { id: 'plan-day', label: 'Plan my day', run: () => onRitual('day') },
      { id: 'plan-week', label: 'Plan my week', run: () => onRitual('week') },
      { id: 'start-focus', label: 'Start focus', run: () => startFocus() },
    ].filter((c) => c.label.toLowerCase().includes(needle));
    if (!text) return commands;

    const tasks: Command[] = state.tasks
      .filter((t) => !t.done && t.title.toLowerCase().includes(needle))
      .slice(0, MAX_TASK_RESULTS)
      .map((t) => ({ id: `task-${t.id}`, label: t.title, hint: 'Start focus', run: () => startFocus(t.id) }));
    const add: Command = {
      id: 'add-task',
      label: `Add task: ${text}`,
      run: () => {
        const parsed = parseQuickAdd(text, today);
        if (!parsed.title) return;
        dispatch({ type: 'BATCH', actions: quickAddActions(parsed, state, { defaultDate: today, now: new Date().toISOString() }) });
        toast(`Added “${parsed.title}”`);
      },
    };
    return [...commands, ...tasks, add];
  }, [query, views, onGo, onRitual, state, timer, today, dispatch, toast]);

  const current = Math.min(active, Math.max(items.length - 1, 0));
  const activeId = items[current] ? `palette-opt-${items[current].id}` : undefined;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [current, items.length]);

  const choose = (cmd: Command | undefined) => {
    if (!cmd) return;
    onClose();
    cmd.run();
  };

  return (
    <dialog
      ref={dialogRef}
      className="palette"
      aria-label="Command palette"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <input
        className="palette-input"
        role="combobox"
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        aria-label="Search commands and tasks"
        placeholder="Type a command, a task, or a new task…"
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!items.length) return;
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setActive((current + step + items.length) % items.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(items[current]);
          }
        }}
      />
      <ul id="palette-list" ref={listRef} className="palette-list" role="listbox" aria-label="Results">
        {items.map((c, i) => (
          <li
            key={c.id}
            id={`palette-opt-${c.id}`}
            role="option"
            aria-selected={i === current}
            className={`palette-opt ${i === current ? 'is-active' : ''}`}
            onMouseMove={() => i !== current && setActive(i)}
            onClick={() => choose(c)}
          >
            <span className="palette-label">{c.label}</span>
            {c.hint && <span className="palette-hint">{c.hint}</span>}
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="palette-empty">No matches.</p>}
    </dialog>
  );
}
