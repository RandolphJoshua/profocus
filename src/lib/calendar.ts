import { addDays, fromKey } from './date';
import type { DateKey, TimeBlock } from './types';

export interface GoogleEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status?: string;
}

const DAY_MIN = 24 * 60;
const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
const keyOf = (d: Date): DateKey => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Google events -> read-only meeting blocks. All-day and cancelled events are skipped; multi-day timed events are clipped to their first (local) day. */
export function eventsToBlocks(events: GoogleEvent[], makeId: (eventId: string) => string): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  for (const ev of events) {
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
