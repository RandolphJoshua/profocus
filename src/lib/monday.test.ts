import {
  DEFAULT_BOARD_ID, fetchBoardItems, itemsToNewTasks, loadMondayConfig, mergeSeen, MONDAY_KEY, mondayQuery, saveMondayConfig,
  type MondayConfig, type MondayItem,
} from './monday';

const item = (o: Partial<MondayItem> = {}): MondayItem => ({
  id: '1', name: 'Fix the thing', createdAt: '2026-11-01T10:00:00Z', group: 'New from Slack (to triage)',
  ownerIds: ['95522544'], priority: 'High', status: 'Not started', due: '', details: '', ...o,
});
const base = { meId: '95522544', mineOnly: true, seen: new Set<string>(), existingTitles: new Set<string>(), projectId: 'p-work', now: '2026-11-09T08:00:00Z', boardId: '5105228983' };
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('itemsToNewTasks', () => {
  it('maps an item to an inbox task with notes, project and source', () => {
    const { tasks } = itemsToNewTasks([item({ due: '2026-11-20', details: 'Some details' })], base);
    expect(tasks).toHaveLength(1);
    const [t] = tasks;
    expect(t).toMatchObject({ title: 'Fix the thing', priority: 'high', projectId: 'p-work', source: 'monday', externalId: '1', done: false, createdAt: base.now });
    expect(t?.date).toBeUndefined();
    expect(t?.notes).toBe([
      'From monday: New from Slack (to triage)',
      'Due 2026-11-20',
      'https://getyards-squad.monday.com/boards/5105228983/pulses/1',
      'Some details',
    ].join('\n'));
  });

  it('omits the due line when there is no due date and cuts details to 500 chars', () => {
    const [t] = itemsToNewTasks([item({ details: 'x'.repeat(900) })], base).tasks;
    expect(t?.notes).not.toContain('Due');
    expect(t?.notes?.split('\n').pop()).toHaveLength(500);
  });

  it('maps Critical/High to high, Normal to med, anything else to no priority', () => {
    const out = itemsToNewTasks([
      item({ id: 'a', name: 'A', priority: 'Critical' }), item({ id: 'b', name: 'B', priority: 'Normal' }), item({ id: 'c', name: 'C', priority: '' }),
    ], base).tasks;
    expect(out.map((t) => t.priority)).toEqual(['high', 'med', undefined]);
  });

  it('skips Done items but still reports them as seen', () => {
    const r = itemsToNewTasks([item({ status: 'Done' })], base);
    expect(r.tasks).toEqual([]);
    expect(r.seenIds).toEqual(['1']);
  });

  it('with mineOnly skips other owners and unowned items; without it keeps them', () => {
    const items = [item({ id: '1', name: 'Mine' }), item({ id: '2', name: 'Theirs', ownerIds: ['7'] }), item({ id: '3', name: 'Nobody', ownerIds: [] })];
    const mine = itemsToNewTasks(items, base);
    expect(mine.tasks.map((t) => t.title)).toEqual(['Mine']);
    expect(mine.seenIds).toEqual(['1', '2', '3']);
    expect(itemsToNewTasks(items, { ...base, mineOnly: false }).tasks).toHaveLength(3);
  });

  it('skips ids already seen and does not list them again', () => {
    const r = itemsToNewTasks([item({ id: '1' }), item({ id: '2', name: 'Other' })], { ...base, seen: new Set(['1']) });
    expect(r.tasks.map((t) => t.externalId)).toEqual(['2']);
    expect(r.seenIds).toEqual(['2']);
  });

  it('skips a title that matches an open task, ignoring case and spaces, and repeats within the batch', () => {
    const r = itemsToNewTasks(
      [item({ id: '1', name: '  fix THE thing ' }), item({ id: '2', name: 'New one' }), item({ id: '3', name: 'new one' })],
      { ...base, existingTitles: new Set(['fix the thing']) },
    );
    expect(r.tasks.map((t) => t.title)).toEqual(['New one']);
    expect(r.seenIds).toEqual(['1', '2', '3']);
  });
});

describe('mergeSeen', () => {
  it('appends new ids once and keeps the last 2000', () => {
    expect(mergeSeen(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    const many = Array.from({ length: 2000 }, (_, i) => String(i));
    const out = mergeSeen(many, ['x', 'y']);
    expect(out).toHaveLength(2000);
    expect(out.slice(-2)).toEqual(['x', 'y']);
    expect(out[0]).toBe('2');
  });
});

describe('config', () => {
  beforeEach(() => localStorage.clear());
  const cfg: MondayConfig = { token: 'tok-secret', boardId: '123', mineOnly: false, projectId: 'p-work' };

  it('round-trips and removes', () => {
    saveMondayConfig(cfg);
    expect(loadMondayConfig()).toEqual(cfg);
    saveMondayConfig(null);
    expect(loadMondayConfig()).toBeNull();
  });

  it('rejects junk and repairs bad fields with defaults', () => {
    localStorage.setItem(MONDAY_KEY, 'not json');
    expect(loadMondayConfig()).toBeNull();
    localStorage.setItem(MONDAY_KEY, JSON.stringify(['x']));
    expect(loadMondayConfig()).toBeNull();
    localStorage.setItem(MONDAY_KEY, JSON.stringify({ token: '  ' }));
    expect(loadMondayConfig()).toBeNull();
    localStorage.setItem(MONDAY_KEY, JSON.stringify({ token: 't', boardId: 'abc/../', mineOnly: 'yes', projectId: 5 }));
    expect(loadMondayConfig()).toEqual({ token: 't', boardId: DEFAULT_BOARD_ID, mineOnly: true, projectId: undefined });
  });
});

describe('mondayQuery', () => {
  it('posts JSON with the token and API version', async () => {
    const f = vi.fn(() => json({ data: { ok: 1 } }));
    const out = await mondayQuery('tok', 'query { me { id } }', { a: 1 }, f as unknown as typeof fetch);
    expect(out).toEqual({ ok: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.monday.com/v2');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'tok', 'Content-Type': 'application/json', 'API-Version': '2025-04' });
    expect(JSON.parse(String(init.body))).toEqual({ query: 'query { me { id } }', variables: { a: 1 } });
  });

  const fail = (f: () => Promise<Response>) => mondayQuery('tok-secret', 'q', {}, f as unknown as typeof fetch).catch((e: Error) => e.message);

  it('maps a 401 and an authentication error to the token message', async () => {
    expect(await fail(() => json({}, 401))).toBe('monday rejected the token. Make a new one.');
    expect(await fail(() => json({ errors: [{ message: 'User unauthenticated' }] }))).toBe('monday rejected the token. Make a new one.');
  });

  it('maps complexity and rate limits', async () => {
    expect(await fail(() => json({}, 429))).toBe('monday is rate-limiting; try again in a minute.');
    expect(await fail(() => json({ errors: [{ message: 'Complexity budget exhausted' }] }))).toBe('monday is rate-limiting; try again in a minute.');
  });

  it('maps a network failure and never echoes the token', async () => {
    const msg = await fail(() => Promise.reject(new TypeError('Failed to fetch tok-secret')));
    expect(msg).toBe("Couldn't reach monday.");
    expect(msg).not.toContain('tok-secret');
  });
});

describe('fetchBoardItems', () => {
  const col = (id: string, text: string, value: unknown = null) => ({ id, text, value: value === null ? null : JSON.stringify(value) });
  const raw = (id: string) => ({
    id, name: `Item ${id}`, created_at: '2026-11-01', group: { title: 'Automation' },
    column_values: [
      col('multiple_person_mm7p7hex', 'Randolph', { personsAndTeams: [{ id: 95522544, kind: 'person' }, { id: 5, kind: 'team' }] }),
      col('color_mm7p97z0', 'Critical'), col('color_mm7pqff3', 'Working on it'), col('date_mm7p78vn', '2026-12-01'), col('long_text_mm8aqd87', 'Hello'),
    ],
  });

  it('reads me, parses items and follows the cursor', async () => {
    const f = vi.fn()
      .mockImplementationOnce(() => json({ data: { me: { id: '95522544' }, boards: [{ items_page: { cursor: 'c1', items: [raw('1')] } }] } }))
      .mockImplementationOnce(() => json({ data: { next_items_page: { cursor: null, items: [raw('2')] } } }));
    const r = await fetchBoardItems({ token: 't', boardId: '5105228983', mineOnly: true }, f as unknown as typeof fetch);
    expect(r.meId).toBe('95522544');
    expect(r.items.map((i) => i.id)).toEqual(['1', '2']);
    expect(r.items[0]).toMatchObject({ name: 'Item 1', group: 'Automation', ownerIds: ['95522544'], priority: 'Critical', status: 'Working on it', due: '2026-12-01', details: 'Hello' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('stops after 5 pages', async () => {
    const f = vi.fn(() => json({ data: { me: { id: '1' }, boards: [{ items_page: { cursor: 'more', items: [raw('1')] } }], next_items_page: { cursor: 'more', items: [raw('2')] } } }));
    await fetchBoardItems({ token: 't', boardId: '1', mineOnly: true }, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(5);
  });

  it('says so when the board is missing', async () => {
    const f = vi.fn(() => json({ data: { me: { id: '1' }, boards: [] } }));
    await expect(fetchBoardItems({ token: 't', boardId: '1', mineOnly: true }, f as unknown as typeof fetch)).rejects.toThrow(/Board ID/);
  });
});
