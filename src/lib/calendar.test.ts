import { blockToEvent, calendarListUrl, eventIdFor, eventsToBlocks, ownEvents, planWrites, type GoogleEvent, type OwnEvent } from './calendar';
import type { TimeBlock } from './types';
import { fromKey } from './date';

const id = (e: string) => `g-${e}`;
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();

describe('eventsToBlocks', () => {
  it('turns a timed event into a read-only meeting block on its local day', () => {
    const ev: GoogleEvent = { id: 'a1', summary: 'Standup', start: { dateTime: at(2026, 11, 4, 9, 30) }, end: { dateTime: at(2026, 11, 4, 10, 15) } };
    expect(eventsToBlocks([ev], id)).toEqual([
      { id: 'g-a1', date: '2026-11-04', start: 570, end: 615, title: 'Standup', kind: 'meeting', source: 'google', externalId: 'a1' },
    ]);
  });

  it('titles untitled events "Busy"', () => {
    const ev: GoogleEvent = { id: 'a2', start: { dateTime: at(2026, 11, 4, 9) }, end: { dateTime: at(2026, 11, 4, 10) } };
    expect(eventsToBlocks([ev], id)[0]?.title).toBe('Busy');
  });

  it('skips all-day and cancelled events', () => {
    const allDay: GoogleEvent = { id: 'b1', start: { date: '2026-11-04' }, end: { date: '2026-11-05' } };
    const cancelled: GoogleEvent = { id: 'b2', status: 'cancelled', start: { dateTime: at(2026, 11, 4, 9) }, end: { dateTime: at(2026, 11, 4, 10) } };
    expect(eventsToBlocks([allDay, cancelled], id)).toEqual([]);
  });

  it('clips a multi-day timed event to its first day', () => {
    const ev: GoogleEvent = { id: 'c1', summary: 'Flight', start: { dateTime: at(2026, 11, 4, 22) }, end: { dateTime: at(2026, 11, 5, 6) } };
    const [b] = eventsToBlocks([ev], id);
    expect(b).toMatchObject({ date: '2026-11-04', start: 1320, end: 1440 });
  });

  it('gives stable ids so re-imports replace cleanly', () => {
    const ev: GoogleEvent = { id: 'd1', start: { dateTime: at(2026, 11, 4, 9) }, end: { dateTime: at(2026, 11, 4, 10) } };
    expect(eventsToBlocks([ev], id)[0]?.id).toBe(eventsToBlocks([ev], id)[0]?.id);
  });
});

describe('calendarListUrl', () => {
  it('asks for local midnight of `from` up to local midnight after `to`', () => {
    const url = new URL(calendarListUrl('2026-11-02', '2026-11-08'));
    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(url.searchParams.get('timeMin')).toBe(fromKey('2026-11-02').toISOString());
    expect(url.searchParams.get('timeMax')).toBe(fromKey('2026-11-09').toISOString());
    expect(url.searchParams.get('singleEvents')).toBe('true');
    expect(url.searchParams.get('orderBy')).toBe('startTime');
    expect(url.searchParams.get('maxResults')).toBe('250');
  });
});

const blk = (o: Partial<TimeBlock> & { id: string }): TimeBlock => ({ date: '2026-11-04', start: 540, end: 600, title: 'Write', kind: 'focus', ...o });
const evFor = (b: TimeBlock, extra: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id: eventIdFor(b.id),
  summary: b.title,
  start: { dateTime: at(2026, 11, 4, 9) },
  end: { dateTime: at(2026, 11, 4, 10) },
  extendedProperties: { private: { profocusBlockId: b.id } },
  ...extra,
});
const ownOf = (b: TimeBlock): OwnEvent => ({ blockId: b.id, date: b.date, start: b.start, end: b.end, title: b.title });
const range = { from: '2026-11-02', to: '2026-11-08' };

describe('eventIdFor', () => {
  it('is stable and uses only Google-allowed characters with length >= 5', () => {
    expect(eventIdFor('abc')).toBe(eventIdFor('abc'));
    for (const id of ['', 'a', 'b-123', 'uuid-1234-ünï', 'x'.repeat(100)]) {
      expect(eventIdFor(id)).toMatch(/^pf[0-9a-v]+$/);
      expect(eventIdFor(id).length).toBeGreaterThanOrEqual(5);
    }
  });
  it('differs for different blocks', () => {
    const ids = ['a', 'b', 'ab', 'ba', 'abc', ''].map(eventIdFor);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('matches base32hex of the utf8 bytes', () => {
    expect(eventIdFor('foobar')).toBe('pfcpnmuoj1e8');
  });
});

describe('ownEvents', () => {
  it('parses events carrying our block id in local time', () => {
    const b = blk({ id: 'b1' });
    expect(ownEvents([evFor(b)])).toEqual([{ blockId: 'b1', date: '2026-11-04', start: 540, end: 600, title: 'Write' }]);
  });
  it('ignores other events and events whose id is not ours', () => {
    const b = blk({ id: 'b1' });
    const foreign: GoogleEvent = { id: 'zzz', summary: 'Dentist', start: { dateTime: at(2026, 11, 4, 9) }, end: { dateTime: at(2026, 11, 4, 10) } };
    const spoofed = evFor(b, { id: 'someoneelses' });
    expect(ownEvents([foreign, spoofed])).toEqual([]);
  });
  it('ignores cancelled and all-day events', () => {
    const b = blk({ id: 'b1' });
    expect(ownEvents([evFor(b, { status: 'cancelled' }), evFor(b, { start: { date: '2026-11-04' }, end: { date: '2026-11-05' } })])).toEqual([]);
  });
});

describe('blockToEvent', () => {
  it('builds an event with our id, private property and ISO local times', () => {
    const b = blk({ id: 'b1', start: 570, end: 615, title: 'Deep work' });
    expect(blockToEvent(b, 'Europe/Paris')).toEqual({
      id: eventIdFor('b1'),
      summary: 'Deep work',
      description: 'From ProFocus',
      start: { dateTime: at(2026, 11, 4, 9, 30), timeZone: 'Europe/Paris' },
      end: { dateTime: at(2026, 11, 4, 10, 15), timeZone: 'Europe/Paris' },
      extendedProperties: { private: { profocusBlockId: 'b1' } },
    });
  });
});

describe('planWrites', () => {
  it('inserts blocks that have no event', () => {
    const b = blk({ id: 'b1' });
    expect(planWrites([b], [], range)).toEqual({ insert: [b], patch: [], remove: [] });
  });
  it('does nothing when nothing changed', () => {
    const b = blk({ id: 'b1' });
    expect(planWrites([b], [ownOf(b)], range)).toEqual({ insert: [], patch: [], remove: [] });
  });
  it.each([
    ['date', { date: '2026-11-05' }],
    ['start', { start: 550 }],
    ['end', { end: 660 }],
    ['title', { title: 'Renamed' }],
  ])('patches when %s differs', (_n, change) => {
    const b = blk({ id: 'b1' });
    const moved = { ...b, ...change };
    expect(planWrites([moved], [ownOf(b)], range)).toEqual({ insert: [], patch: [moved], remove: [] });
  });
  it('removes own events whose block is gone', () => {
    const b = blk({ id: 'b1' });
    expect(planWrites([], [ownOf(b)], range)).toEqual({ insert: [], patch: [], remove: ['b1'] });
  });
  it('ignores google-sourced blocks', () => {
    const g = blk({ id: 'g-1', source: 'google', externalId: '1' });
    expect(planWrites([g], [], range)).toEqual({ insert: [], patch: [], remove: [] });
  });
  it('ignores blocks and own events outside the range', () => {
    const out = blk({ id: 'o1', date: '2026-12-25' });
    expect(planWrites([out], [], range)).toEqual({ insert: [], patch: [], remove: [] });
    expect(planWrites([], [ownOf(out)], range)).toEqual({ insert: [], patch: [], remove: [] });
  });
  it('moves (patches), never removes, the event of a block that moved out of range', () => {
    const b = blk({ id: 'b1' });
    const moved = { ...b, date: '2026-12-25' };
    expect(planWrites([moved], [ownOf(b)], range)).toEqual({ insert: [], patch: [moved], remove: [] });
  });
});

describe('eventsToBlocks and our own events', () => {
  it('skips events ProFocus created', () => {
    const b = blk({ id: 'b1' });
    expect(eventsToBlocks([evFor(b)], id)).toEqual([]);
  });
});

