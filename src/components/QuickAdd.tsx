import { forwardRef, useState } from 'react';
import { formatDuration, formatMinutes, relativeLabel } from '../lib/date';
import { parseQuickAdd } from '../lib/parse';
import type { DateKey } from '../lib/types';
import { quickAddActions } from '../state/reducer';
import { useStore, useToday } from '../state/store';

interface QuickAddProps {
  /** Date given to tasks typed without one. Omit to drop them in the inbox. */
  defaultDate?: DateKey;
  placeholder?: string;
}

export const QuickAdd = forwardRef<HTMLInputElement, QuickAddProps>(function QuickAdd(
  { defaultDate, placeholder = 'Add a task…  try “Draft essay 45m tomorrow @9am #writing !high”' },
  ref,
) {
  const { state, dispatch } = useStore();
  const today = useToday();
  const [text, setText] = useState('');
  const parsed = text.trim() ? parseQuickAdd(text, today) : null;
  const date = parsed?.someday ? undefined : parsed?.date ?? defaultDate;

  const submit = () => {
    if (!parsed?.title) return;
    const actions = quickAddActions(parsed, state, { defaultDate, now: new Date().toISOString() });
    dispatch({ type: 'BATCH', actions });
    setText('');
  };

  return (
    <form
      className="quick-add"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <span className="quick-add-plus" aria-hidden>+</span>
      <input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label="Quick add task"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setText('');
            e.currentTarget.blur();
          }
        }}
      />
      {parsed && (
        <div className="quick-add-preview" aria-live="polite">
          <span className="chip">{date ? relativeLabel(date, today) : 'Inbox'}</span>
          {parsed.startMin !== undefined && <span className="chip">{formatMinutes(parsed.startMin)}</span>}
          {parsed.estimateMin && <span className="chip">{formatDuration(parsed.estimateMin)}</span>}
          {parsed.project && <span className="chip">#{parsed.project}</span>}
          {parsed.priority && <span className={`chip prio-${parsed.priority}`}>{parsed.priority}</span>}
        </div>
      )}
    </form>
  );
});
