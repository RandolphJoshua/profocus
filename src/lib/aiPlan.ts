import { addDays, fromKey, isValidKey, shortWeekday } from './date';
import { blocksForDay, routineInstances } from './routines';
import type { BlockItem, ParsedPlan, PlanClock, PlanItem, TaskItem, TaskPatch, UpdateItem } from './aiPlanTypes';
import type { AppState, BlockKind, DateKey, Priority } from './types';

export { toActions, describeApplied } from './aiPlanApply';
export type { PlanActions } from './aiPlanApply';
export type { PlanItem, ParsedPlan } from './aiPlanTypes';

const MAX_CONTEXT_TASKS = 80;
const MAX_ITEMS = 25;
const HORIZON_DAYS = 60;
const CONTEXT_DAYS = 7;
const MIN_ESTIMATE = 5;
const MAX_ESTIMATE = 480;
const MAX_TITLE = 120;
const SNAP = 15;
const MINUTES_PER_DAY = 24 * 60;
const PRIORITIES: readonly Priority[] = ['high', 'med', 'low'];
const KINDS: readonly BlockKind[] = ['focus', 'meeting', 'personal', 'break'];

export const PLAN_SYSTEM_PROMPT = [
  'You are a scheduling assistant for a personal planner.',
  'Return only JSON matching the schema below, with no commentary.',
  'Never move or delete existing blocks: they are fixed, including calendar events.',
  'Do not overlap existing blocks or each other.',
  'Keep blocks inside the working day, and never before "now" on today.',
  'Use 15-minute boundaries for all times.',
  'Reuse existing tasks by id when the request refers to them. Create new tasks only when needed.',
  'Estimates are in minutes. Write titles as plain verbs with no emoji. The summary is one short sentence.',
  'If the request is not about tasks or scheduling, return empty arrays with a summary saying so.',
  'Schema: {"summary":"string","newTasks":[{"ref":"t1","title":"string","estimateMin":30,"priority":"high|med|low","project":"name","date":"YYYY-MM-DD"}],',
  '"blocks":[{"date":"YYYY-MM-DD","start":"HH:MM","end":"HH:MM","title":"string","kind":"focus|meeting|personal|break","taskId":"existing id","taskRef":"t1"}],',
  '"taskUpdates":[{"taskId":"existing id","date":"YYYY-MM-DD","priority":"high|med|low","estimateMin":30}]}',
  'Every field except title, date, start and end is optional. taskRef points at a ref in newTasks.',
].join('\n');

export const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** The system and user messages for one planning request. The user message is compact JSON plus the prompt. */
export function buildPlanRequest(state: AppState, input: PlanClock & { prompt: string }): { system: string; user: string } {
  const { today, nowMin, prompt } = input;
  const projectName = new Map(state.projects.map((p) => [p.id, p.name]));
  const tasks = state.tasks.filter((t) => !t.done).slice(0, MAX_CONTEXT_TASKS).map((t) => ({
    id: t.id, title: t.title,
    ...(t.estimateMin ? { estimateMin: t.estimateMin } : {}),
    ...(t.priority ? { priority: t.priority } : {}),
    ...(t.projectId && projectName.has(t.projectId) ? { project: projectName.get(t.projectId) } : {}),
    ...(t.date ? { date: t.date } : {}),
  }));
  const blocks = Array.from({ length: CONTEXT_DAYS }, (_, i) => addDays(today, i))
    .flatMap((d) => blocksForDay(state, d))
    .map((b) => ({ date: b.date, start: hhmm(b.start), end: hhmm(b.end), title: b.title, fixed: true }));
  const context = {
    today: { date: today, weekday: fromKey(today).toLocaleDateString('en-US', { weekday: 'long' }) },
    now: hhmm(nowMin),
    workingDay: { start: `${String(state.settings.dayStartHour).padStart(2, '0')}:00`, end: `${String(state.settings.dayEndHour).padStart(2, '0')}:00` },
    projects: state.projects.filter((p) => !p.archived).map((p) => ({ name: p.name })),
    tasks,
    blocks,
  };
  return { system: PLAN_SYSTEM_PROMPT, user: `Context:\n${JSON.stringify(context)}\n\nRequest:\n${prompt.trim()}` };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const asList = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);

function extractObject(text: string): Obj | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const v: unknown = JSON.parse(text.slice(start, end + 1));
    return isObj(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function cleanTitle(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length >= 1 && t.length <= MAX_TITLE ? t : undefined;
}

function parseClock(v: unknown): number | undefined {
  const m = typeof v === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(v.trim()) : null;
  if (!m) return undefined;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return Number(m[2]) < 60 && min <= MINUTES_PER_DAY ? Math.round(min / SNAP) * SNAP : undefined;
}

const dayLabel = (d: DateKey) => `${shortWeekday(d)} ${Number(d.slice(8))}`;
const quote = (t: unknown) => `‘${typeof t === 'string' ? t.slice(0, 40) : 'item'}’`;

/** The trust boundary: model text in, validated reviewable items (and the reasons for the rest) out. Pure. */
export function parsePlan(text: string, state: AppState, clock: PlanClock): ParsedPlan {
  const raw = extractObject(text);
  if (!raw) return { summary: '', items: [], dropped: ['The answer was not a plan I could read. Try again.'] };
  const { today, nowMin } = clock;
  const lastDay = addDays(today, HORIZON_DAYS);
  const dayStart = state.settings.dayStartHour * 60;
  const dayEnd = state.settings.dayEndHour * 60;
  const items: PlanItem[] = [];
  const dropped: string[] = [];
  const openTasks = new Map(state.tasks.filter((t) => !t.done).map((t) => [t.id, t]));
  const projects = state.projects.filter((p) => !p.archived);
  const okDate = (v: unknown): v is DateKey => typeof v === 'string' && isValidKey(v) && v >= today && v <= lastDay;
  const capped = <T,>(list: T[], what: string): T[] => {
    if (list.length > MAX_ITEMS) dropped.push(`Skipped ${list.length - MAX_ITEMS} ${what}: at most ${MAX_ITEMS} at a time.`);
    return list.slice(0, MAX_ITEMS);
  };

  const refs = new Map<string, TaskItem>();
  for (const [i, t] of capped(asList(raw.newTasks), 'new tasks').entries()) {
    const title = cleanTitle(t.title);
    if (!title) { dropped.push(`Skipped a new task with no usable title (${quote(t.title)}).`); continue; }
    if ((t.priority !== undefined && !PRIORITIES.includes(t.priority as Priority))
      || (t.estimateMin !== undefined && !(typeof t.estimateMin === 'number' && t.estimateMin >= MIN_ESTIMATE && t.estimateMin <= MAX_ESTIMATE))
      || (t.date !== undefined && !okDate(t.date))) {
      dropped.push(`Skipped ${quote(title)}: invalid priority, estimate or date.`);
      continue;
    }
    const name = typeof t.project === 'string' ? t.project.trim().toLowerCase() : '';
    const project = name ? projects.find((p) => p.name.toLowerCase() === name) : undefined;
    const ref = typeof t.ref === 'string' && t.ref && !refs.has(t.ref) ? t.ref : undefined;
    const estimateMin = typeof t.estimateMin === 'number' ? Math.round(t.estimateMin) : undefined;
    const item: TaskItem = {
      kind: 'task', id: `task-${i}`, ref, title, estimateMin, priority: t.priority as Priority | undefined, projectId: project?.id, date: t.date as DateKey | undefined,
      label: title,
      detail: [project?.name, estimateMin ? `${estimateMin}m` : '', t.priority, t.date ? dayLabel(t.date as DateKey) : ''].filter(Boolean).join(' · '),
    };
    if (ref) refs.set(ref, item);
    items.push(item);
  }

  const taken = [
    ...state.blocks,
    ...Array.from({ length: HORIZON_DAYS + 1 }, (_, i) => routineInstances(state, addDays(today, i))).flat(),
  ].map((b) => ({ date: b.date, start: b.start, end: b.end, title: b.title }));
  for (const [i, b] of capped(asList(raw.blocks), 'blocks').entries()) {
    const title = cleanTitle(b.title);
    const start = parseClock(b.start);
    const end = parseClock(b.end);
    if (!title || !okDate(b.date) || start === undefined || end === undefined || end <= start) {
      dropped.push(`Skipped ${quote(b.title)}: the day or time was not valid.`);
      continue;
    }
    const when = `${hhmm(start)}–${hhmm(end)}`;
    if (start < dayStart || end > dayEnd) { dropped.push(`Skipped ${quote(title)} ${when}: outside your working day.`); continue; }
    if (b.date === today && start < nowMin) { dropped.push(`Skipped ${quote(title)} ${when}: already past.`); continue; }
    if (b.kind !== undefined && !KINDS.includes(b.kind as BlockKind)) { dropped.push(`Skipped ${quote(title)} ${when}: unknown block type.`); continue; }
    const taskId = typeof b.taskId === 'string' ? b.taskId : undefined;
    const taskRef = typeof b.taskRef === 'string' ? b.taskRef : undefined;
    if (taskId && !openTasks.has(taskId)) { dropped.push(`Skipped ${quote(title)} ${when}: it points at a task that does not exist.`); continue; }
    if (!taskId && taskRef && !refs.has(taskRef)) { dropped.push(`Skipped ${quote(title)} ${when}: it points at a task that was not proposed.`); continue; }
    const clash = taken.find((o) => o.date === b.date && start < o.end && end > o.start);
    if (clash) { dropped.push(`Skipped ${quote(title)} ${when}: overlaps ${clash.title}.`); continue; }
    taken.push({ date: b.date, start, end, title });
    const item: BlockItem = {
      kind: 'block', id: `block-${i}`, date: b.date, start, end, title, blockKind: (b.kind as BlockKind | undefined) ?? 'focus',
      taskId, taskRef: taskId ? undefined : taskRef,
      projectId: taskId ? openTasks.get(taskId)?.projectId : refs.get(taskRef ?? '')?.projectId,
      label: `${dayLabel(b.date)} · ${when} · ${title}`, detail: '',
    };
    items.push(item);
  }

  for (const [i, u] of capped(asList(raw.taskUpdates), 'changes').entries()) {
    const task = typeof u.taskId === 'string' ? openTasks.get(u.taskId) : undefined;
    if (!task) { dropped.push('Skipped a change to a task that does not exist.'); continue; }
    const patch: TaskPatch = {};
    const prev: TaskPatch = {};
    let bad = false;
    if (u.date !== undefined) { if (okDate(u.date)) { if (u.date !== task.date) { patch.date = u.date; prev.date = task.date; } } else bad = true; }
    if (u.priority !== undefined) { if (PRIORITIES.includes(u.priority as Priority)) { if (u.priority !== task.priority) { patch.priority = u.priority as Priority; prev.priority = task.priority; } } else bad = true; }
    if (u.estimateMin !== undefined) {
      if (typeof u.estimateMin === 'number' && u.estimateMin >= MIN_ESTIMATE && u.estimateMin <= MAX_ESTIMATE) {
        const est = Math.round(u.estimateMin);
        if (est !== task.estimateMin) { patch.estimateMin = est; prev.estimateMin = task.estimateMin; }
      } else bad = true;
    }
    if (bad || Object.keys(patch).length === 0) { dropped.push(`Skipped the change to ${quote(task.title)}: ${bad ? 'a value was not valid' : 'nothing would change'}.`); continue; }
    const detail = [patch.date && `move to ${dayLabel(patch.date)}`, patch.priority && `priority ${patch.priority}`, patch.estimateMin && `${patch.estimateMin}m`].filter(Boolean).join(', ');
    const item: UpdateItem = { kind: 'update', id: `update-${i}`, taskId: task.id, patch, prev, label: task.title, detail };
    items.push(item);
  }

  const summary = typeof raw.summary === 'string' ? raw.summary.trim().slice(0, 300) : '';
  return { summary, items, dropped };
}
