import { uid } from './storage';
import type { ID, Task } from './types';

/** monday.com import. The personal token lives only in localStorage under MONDAY_KEY, never in AppState. */
export interface MondayConfig {
  token: string;
  boardId: string;
  mineOnly: boolean;
  projectId?: ID;
}

export const MONDAY_KEY = 'profocus:monday';
export const DEFAULT_BOARD_ID = '5105228983';
export const MONDAY_SEEN_LIMIT = 2000;

const MONDAY_API = 'https://api.monday.com/v2';
const API_VERSION = '2025-04';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const DETAILS_MAX = 500;
const WORKSPACE_HOST = 'https://getyards-squad.monday.com';

const COL = {
  owner: 'multiple_person_mm7p7hex',
  priority: 'color_mm7p97z0',
  status: 'color_mm7pqff3',
  due: 'date_mm7p78vn',
  details: 'long_text_mm8aqd87',
} as const;

const MSG_AUTH = 'monday rejected the token. Make a new one.';
const MSG_RATE = 'monday is rate-limiting; try again in a minute.';
const MSG_NETWORK = "Couldn't reach monday.";

export class MondayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MondayError';
  }
}

export const isBoardId = (v: string): boolean => /^\d{1,20}$/.test(v);

export function loadMondayConfig(): MondayConfig | null {
  try {
    const raw = localStorage.getItem(MONDAY_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    if (typeof o.token !== 'string' || !o.token.trim()) return null;
    return {
      token: o.token.trim(),
      boardId: typeof o.boardId === 'string' && isBoardId(o.boardId) ? o.boardId : DEFAULT_BOARD_ID,
      mineOnly: typeof o.mineOnly === 'boolean' ? o.mineOnly : true,
      projectId: typeof o.projectId === 'string' && o.projectId ? o.projectId : undefined,
    };
  } catch {
    return null;
  }
}

export function saveMondayConfig(c: MondayConfig | null): void {
  try {
    if (c) localStorage.setItem(MONDAY_KEY, JSON.stringify(c));
    else localStorage.removeItem(MONDAY_KEY);
  } catch {
    /* storage unavailable: the config just won't persist */
  }
}

interface GqlError { message?: unknown; extensions?: { code?: unknown } }

function errorFromGraphql(errors: GqlError[]): MondayError {
  const text = errors.map((e) => `${String(e.message ?? '')} ${String(e.extensions?.code ?? '')}`).join(' ');
  if (/authenticat|unauthori[sz]ed|not authori[sz]ed/i.test(text)) return new MondayError(MSG_AUTH);
  if (/complexity|rate.?limit|too many|budget/i.test(text)) return new MondayError(MSG_RATE);
  const first = errors[0]?.message;
  return new MondayError(`monday error: ${typeof first === 'string' ? first.slice(0, 120) : 'unknown'}`);
}

export async function mondayQuery(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetchImpl(MONDAY_API, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json', 'API-Version': API_VERSION },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new MondayError(MSG_NETWORK);
  }
  if (res.status === 401 || res.status === 403) throw new MondayError(MSG_AUTH);
  if (res.status === 429) throw new MondayError(MSG_RATE);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MondayError(res.ok ? MSG_NETWORK : `monday error: HTTP ${res.status}`);
  }
  const o = (typeof body === 'object' && body !== null ? body : {}) as { data?: unknown; errors?: unknown; error_message?: unknown };
  if (Array.isArray(o.errors) && o.errors.length) throw errorFromGraphql(o.errors as GqlError[]);
  if (typeof o.error_message === 'string') throw errorFromGraphql([{ message: o.error_message }]);
  if (!res.ok) throw new MondayError(`monday error: HTTP ${res.status}`);
  return (typeof o.data === 'object' && o.data !== null ? o.data : {}) as Record<string, unknown>;
}

export interface MondayItem {
  id: string;
  name: string;
  createdAt: string;
  group: string;
  ownerIds: string[];
  priority: string;
  status: string;
  due: string;
  details: string;
}

const ITEM_FIELDS = `id name created_at group { title }
  column_values(ids: ["${COL.owner}", "${COL.priority}", "${COL.status}", "${COL.due}", "${COL.details}"]) { id text value }`;
const FIRST_PAGE = `query ($board: [ID!], $limit: Int) {
  me { id }
  boards(ids: $board) { items_page(limit: $limit) { cursor items { ${ITEM_FIELDS} } } }
}`;
const NEXT_PAGE = `query ($cursor: String!, $limit: Int) {
  next_items_page(limit: $limit, cursor: $cursor) { cursor items { ${ITEM_FIELDS} } }
}`;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function ownerIdsOf(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  try {
    const parsed: unknown = JSON.parse(value);
    const list = (parsed as { personsAndTeams?: unknown } | null)?.personsAndTeams;
    if (!Array.isArray(list)) return [];
    return list
      .filter((p): p is { id: unknown; kind?: unknown } => typeof p === 'object' && p !== null)
      .filter((p) => p.kind === undefined || p.kind === 'person')
      .map((p) => String(p.id));
  } catch {
    return [];
  }
}

function parseItem(raw: unknown): MondayItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' && typeof r.id !== 'number') return null;
  const cols = new Map<string, { text: string; value: unknown }>();
  if (Array.isArray(r.column_values)) {
    for (const c of r.column_values) {
      if (typeof c === 'object' && c !== null && typeof (c as { id?: unknown }).id === 'string') {
        const cv = c as { id: string; text?: unknown; value?: unknown };
        cols.set(cv.id, { text: str(cv.text), value: cv.value });
      }
    }
  }
  const text = (id: string) => cols.get(id)?.text.trim() ?? '';
  return {
    id: String(r.id),
    name: str(r.name).trim(),
    createdAt: str(r.created_at),
    group: str((r.group as { title?: unknown } | null)?.title),
    ownerIds: ownerIdsOf(cols.get(COL.owner)?.value),
    priority: text(COL.priority),
    status: text(COL.status),
    due: text(COL.due),
    details: text(COL.details),
  };
}

const itemsOf = (page: unknown): { cursor: string | null; items: MondayItem[] } => {
  const p = (typeof page === 'object' && page !== null ? page : {}) as { cursor?: unknown; items?: unknown };
  const items = Array.isArray(p.items) ? p.items.map(parseItem).filter((i): i is MondayItem => i !== null) : [];
  return { cursor: typeof p.cursor === 'string' && p.cursor ? p.cursor : null, items };
};

export async function fetchBoardItems(cfg: MondayConfig, fetchImpl: typeof fetch = fetch): Promise<{ meId: string; items: MondayItem[] }> {
  const first = await mondayQuery(cfg.token, FIRST_PAGE, { board: [cfg.boardId], limit: PAGE_SIZE }, fetchImpl);
  const meId = String((first.me as { id?: unknown } | undefined)?.id ?? '');
  const boards = first.boards;
  const board = Array.isArray(boards) ? (boards[0] as { items_page?: unknown } | undefined) : undefined;
  if (!board) throw new MondayError("monday didn't find that board. Check the Board ID.");
  let page = itemsOf(board.items_page);
  const items = [...page.items];
  for (let n = 1; n < MAX_PAGES && page.cursor; n++) {
    const next = await mondayQuery(cfg.token, NEXT_PAGE, { cursor: page.cursor, limit: PAGE_SIZE }, fetchImpl);
    page = itemsOf(next.next_items_page);
    items.push(...page.items);
  }
  return { meId, items };
}

export interface NewTaskOptions {
  meId: string;
  mineOnly: boolean;
  seen: Set<string>;
  existingTitles: Set<string>;
  projectId?: ID;
  now: string;
  boardId?: string;
}

const PRIORITY: Record<string, Task['priority']> = { critical: 'high', high: 'high', normal: 'med' };
export const titleKey = (t: string): string => t.trim().toLowerCase();

function notesFor(item: MondayItem, boardId: string): string {
  const lines = [`From monday: ${item.group}`];
  if (item.due) lines.push(`Due ${item.due}`);
  lines.push(`${WORKSPACE_HOST}/boards/${boardId}/pulses/${item.id}`);
  if (item.details) lines.push(item.details.slice(0, DETAILS_MAX));
  return lines.join('\n');
}

/** Pure: which board items become tasks. Every examined id is returned in `seenIds`, imported or not. */
export function itemsToNewTasks(items: MondayItem[], o: NewTaskOptions): { tasks: Task[]; seenIds: string[] } {
  const boardId = o.boardId ?? DEFAULT_BOARD_ID;
  const titles = new Set(o.existingTitles);
  const tasks: Task[] = [];
  const seenIds: string[] = [];
  for (const item of items) {
    if (o.seen.has(item.id)) continue;
    seenIds.push(item.id);
    if (item.status.toLowerCase() === 'done') continue;
    if (o.mineOnly && !item.ownerIds.includes(o.meId)) continue;
    const key = titleKey(item.name);
    if (!key || titles.has(key)) continue;
    titles.add(key);
    tasks.push({
      id: uid('t-'),
      title: item.name,
      notes: notesFor(item, boardId),
      projectId: o.projectId,
      priority: PRIORITY[item.priority.toLowerCase()],
      done: false,
      createdAt: o.now,
      source: 'monday',
      externalId: item.id,
    });
  }
  return { tasks, seenIds };
}

/** Append new ids to the seen list, keeping only the latest MONDAY_SEEN_LIMIT. */
export function mergeSeen(seen: readonly string[], add: readonly string[]): string[] {
  const have = new Set(seen);
  return [...seen, ...add.filter((id) => !have.has(id))].slice(-MONDAY_SEEN_LIMIT);
}
