import { addDays, fromKey } from './date';
import type { DateKey, TimeBlock } from './types';

export interface GoogleEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status?: string;
  extendedProperties?: { private?: Record<string, string> };
}

const DAY_MIN = 24 * 60;
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const keyOf = (d: Date): DateKey => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const OWN_PROP = 'profocusBlockId';
const ownBlockId = (ev: GoogleEvent): string | undefined => ev.extendedProperties?.private?.[OWN_PROP];

/** Google events -> read-only meeting blocks. All-day and cancelled events are skipped; multi-day timed events are clipped to their first (local) day. */
export function eventsToBlocks(events: GoogleEvent[], makeId: (eventId: string) => string): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  for (const ev of events) {
    if (ownBlockId(ev) !== undefined) continue; // our own events never come back as imported blocks
    if (ev.status === 'cancelled' || !ev.start.dateTime || !ev.end.dateTime) continue;
    const start = new Date(ev.start.dateTime);
    const end = new Date(ev.end.dateTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const date = keyOf(start);
    const startMin = minutesOf(start);
    const endMin = keyOf(end) === date ? minutesOf(end) : DAY_MIN;
    if (endMin <= startMin) continue;
    blocks.push({
      id: makeId(ev.id),
      date,
      start: startMin,
      end: endMin,
      title: ev.summary?.trim() || 'Busy',
      kind: 'meeting',
      source: 'google',
      externalId: ev.id,
    });
  }
  return blocks;
}

/** Primary-calendar events from local midnight of `from` to local midnight after `to`. */
export function calendarListUrl(from: DateKey, to: DateKey): string {
  const params = new URLSearchParams({
    singleEvents: 'true',
    orderBy: 'startTime',
    timeMin: fromKey(from).toISOString(),
    timeMax: fromKey(addDays(to, 1)).toISOString(),
    maxResults: '250',
  });
  return `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;
}

const BASE32HEX = '0123456789abcdefghijklmnopqrstuv';

/**
 * Deterministic Google event id for a block: 'pf' + lower-case base32hex of the UTF-8 id (Google allows 0-9a-v, 5+ chars).
 * Short ids are padded with 'v', which a canonical encoding of 3+ bytes never ends with, so ids stay distinct.
 * This is the ONLY way ProFocus names an event it patches or deletes.
 */
export function eventIdFor(blockId: string): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of new TextEncoder().encode(blockId)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32HEX[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32HEX[(value << (5 - bits)) & 31];
  let id = `pf${out}`;
  while (id.length < 5) id += 'v';
  return id;
}

export interface OwnEvent { blockId: string; date: DateKey; start: number; end: number; title: string }

/** Events ProFocus created: carry our block id AND an event id that eventIdFor(blockId) would produce. Anything else is never ours. */
export function ownEvents(events: GoogleEvent[]): OwnEvent[] {
  const out: OwnEvent[] = [];
  for (const ev of events) {
    const blockId = ownBlockId(ev);
    if (!blockId || ev.id !== eventIdFor(blockId)) continue;
    if (ev.status === 'cancelled' || !ev.start.dateTime || !ev.end.dateTime) continue;
    const start = new Date(ev.start.dateTime);
    const end = new Date(ev.end.dateTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const date = keyOf(start);
    out.push({ blockId, date, start: minutesOf(start), end: keyOf(end) === date ? minutesOf(end) : DAY_MIN, title: ev.summary ?? '' });
  }
  return out;
}

const localIso = (date: DateKey, minutes: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60).toISOString();
};

export function blockToEvent(b: TimeBlock, timeZone: string) {
  return {
    id: eventIdFor(b.id),
    summary: b.title,
    description: 'From ProFocus',
    start: { dateTime: localIso(b.date, b.start), timeZone },
    end: { dateTime: localIso(b.date, b.end), timeZone },
    extendedProperties: { private: { [OWN_PROP]: b.id } },
  };
}

/** What to insert, patch and delete (by block id) so our events mirror the ProFocus blocks in `range`. */
export function planWrites(
  blocks: TimeBlock[],
  own: OwnEvent[],
  range: { from: DateKey; to: DateKey },
): { insert: TimeBlock[]; patch: TimeBlock[]; remove: string[] } {
  const inRange = (d: DateKey) => d >= range.from && d <= range.to;
  const mine = blocks.filter((b) => b.source !== 'google');
  const ownById = new Map(own.map((o) => [o.blockId, o]));
  const localIds = new Set(mine.map((b) => b.id));
  const insert: TimeBlock[] = [];
  const patch: TimeBlock[] = [];
  for (const b of mine) {
    if (!inRange(b.date)) continue;
    const o = ownById.get(b.id);
    if (!o) insert.push(b);
    else if (o.date !== b.date || o.start !== b.start || o.end !== b.end || o.title !== b.title) patch.push(b);
  }
  // An event in the window whose block moved outside it: move the event with the block instead of leaving it behind.
  const byId = new Map(mine.map((b) => [b.id, b]));
  for (const o of own) {
    const b = byId.get(o.blockId);
    if (b && inRange(o.date) && !inRange(b.date)) patch.push(b);
  }
  const remove = own.filter((o) => inRange(o.date) && !localIds.has(o.blockId)).map((o) => o.blockId);
  return { insert, patch, remove };
}
