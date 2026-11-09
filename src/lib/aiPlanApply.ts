import type { Action } from '../state/reducer';
import type { PlanItem } from './aiPlanTypes';
import { uid } from './storage';
import type { ID, TimeBlock } from './types';

export interface PlanActions {
  actions: Action[];
  /** Reverses `actions`: delete what was added, put changed fields back. */
  undo: Action[];
  counts: { tasks: number; blocks: number; updates: number };
}

/** Turn the ticked items into reducer actions, plus the actions that undo them. */
export function toActions(items: PlanItem[], selectedIds: ReadonlySet<string> | readonly string[], now: string): PlanActions {
  const selected = new Set(selectedIds);
  const chosen = items.filter((i) => selected.has(i.id));
  const actions: Action[] = [];
  const undoAdds: Action[] = [];
  const undoUpdates: Action[] = [];
  const counts = { tasks: 0, blocks: 0, updates: 0 };
  const idByRef = new Map<string, ID>();

  for (const item of chosen) {
    if (item.kind !== 'task') continue;
    const id = uid('t-');
    if (item.ref) idByRef.set(item.ref, id);
    actions.push({
      type: 'ADD_TASK',
      task: { id, title: item.title, projectId: item.projectId, priority: item.priority, estimateMin: item.estimateMin, date: item.date, done: false, createdAt: now },
    });
    undoAdds.push({ type: 'DELETE_TASK', id });
    counts.tasks += 1;
  }

  for (const item of chosen) {
    if (item.kind === 'block') {
      // A block whose new task was not ticked stays, just without the link.
      const taskId = item.taskId ?? (item.taskRef ? idByRef.get(item.taskRef) : undefined);
      const block: TimeBlock = {
        id: uid('b-'), date: item.date, start: item.start, end: item.end, title: item.title, kind: item.blockKind, taskId, projectId: item.projectId,
      };
      actions.push({ type: 'ADD_BLOCK', block });
      undoAdds.push({ type: 'DELETE_BLOCK', id: block.id });
      counts.blocks += 1;
    } else if (item.kind === 'update') {
      actions.push({ type: 'UPDATE_TASK', id: item.taskId, patch: item.patch });
      undoUpdates.push({ type: 'UPDATE_TASK', id: item.taskId, patch: item.prev });
      counts.updates += 1;
    }
  }

  return { actions, undo: [...undoAdds.reverse(), ...undoUpdates.reverse()], counts };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Added 3 tasks and 4 blocks", "Changed 2 tasks". */
export function describeApplied({ tasks, blocks, updates }: PlanActions['counts']): string {
  const added = [tasks && plural(tasks, 'task'), blocks && plural(blocks, 'block')].filter(Boolean) as string[];
  const parts = [added.length ? `Added ${added.join(' and ')}` : '', updates ? `${added.length ? 'changed' : 'Changed'} ${plural(updates, 'task')}` : ''].filter(Boolean);
  return parts.join(', ') || 'Nothing to apply';
}
