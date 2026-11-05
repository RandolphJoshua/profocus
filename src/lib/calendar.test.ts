import { calendarListUrl, eventsToBlocks, type GoogleEvent } from './calendar';
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
