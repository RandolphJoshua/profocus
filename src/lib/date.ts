import type { DateKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function todayKey(now: Date = new Date()): DateKey {
  return toKey(now);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function startOfWeek(key: DateKey, weekStartsOn: 0 | 1 = 1): DateKey {
  const d = fromKey(key);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(key, -diff);
}

export function weekDays(start: DateKey): DateKey[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isValidKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return toKey(fromKey(key)) === key;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Next occurrence of a weekday (by index) strictly after `from`, unless `allowToday`. */
export function nextWeekday(from: DateKey, weekday: number, allowToday = false): DateKey {
  const cur = fromKey(from).getDay();
  let diff = (weekday - cur + 7) % 7;
  if (diff === 0 && !allowToday) diff = 7;
  return addDays(from, diff);
}

export function weekdayIndex(word: string): number {
  const w = word.toLowerCase();
  if (w.length < 3) return -1;
  return WEEKDAYS.findIndex((d) => d.startsWith(w));
}

export function formatDay(key: DateKey, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }): string {
  return fromKey(key).toLocaleDateString(undefined, opts);
}

export function shortWeekday(key: DateKey): string {
  return fromKey(key).toLocaleDateString(undefined, { weekday: 'short' });
}

export function relativeLabel(key: DateKey, today: DateKey): string {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return formatDay(key, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Minutes since midnight -> "9:30 AM" style label. */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function minutesNow(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}
