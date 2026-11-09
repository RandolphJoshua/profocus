import type { BlockKind, DateKey, ID, Priority, Task } from './types';

/** One reviewable proposal from the model. `id` is a local key for the checklist, never a task or block id. */
interface PlanItemBase {
  id: string;
  label: string;
  detail: string;
}

export interface TaskItem extends PlanItemBase {
  kind: 'task';
  /** The model's name for this task, so blocks can point at it. */
  ref?: string;
  title: string;
  estimateMin?: number;
  priority?: Priority;
  projectId?: ID;
  date?: DateKey;
}

export interface BlockItem extends PlanItemBase {
  kind: 'block';
  date: DateKey;
  start: number;
  end: number;
  title: string;
  blockKind: BlockKind;
  /** An existing open task. */
  taskId?: ID;
  /** A `ref` of a TaskItem in the same plan. */
  taskRef?: string;
  projectId?: ID;
}

export type TaskPatch = Partial<Pick<Task, 'date' | 'priority' | 'estimateMin'>>;

export interface UpdateItem extends PlanItemBase {
  kind: 'update';
  taskId: ID;
  patch: TaskPatch;
  /** The same keys with the values they have now, for undo. */
  prev: TaskPatch;
}

export type PlanItem = TaskItem | BlockItem | UpdateItem;

export interface ParsedPlan {
  summary: string;
  items: PlanItem[];
  /** Human-readable reasons for everything that was left out. */
  dropped: string[];
}

export interface PlanClock {
  today: DateKey;
  /** Minutes since local midnight. */
  nowMin: number;
}
