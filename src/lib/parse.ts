import { addDays, isValidKey, nextWeekday, weekdayIndex } from './date';
import type { DateKey, Priority } from './types';

export interface ParsedTask {
  title: string;
  date?: DateKey;
  /** Explicitly "someday" — no date even if a default is supplied. */
  someday?: boolean;
  estimateMin?: number;
  priority?: Priority;
  /** Project name as typed after `#` (without the hash). */
  project?: string;
  /** Start time in minutes from midnight, from `@9am` / `@14:30`. */
  startMin?: number;
}

const PRIORITIES: Record<string, Priority> = {
  '!high': 'high', '!h': 'high', '!1': 'high', '!!!': 'high',
  '!med': 'med', '!m': 'med', '!2': 'med', '!!': 'med',
  '!low': 'low', '!l': 'low', '!3': 'low', '!': 'low',
};

function parseEstimate(tok: string): number | undefined {
  // 45m, 1h, 1.5h, 1h30m, 90min
  const m = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+)m(?:in)?)?$/i.exec(tok);
  if (!m || (!m[1] && !m[2])) return undefined;
  const mins = Math.round(parseFloat(m[1] ?? '0') * 60) + parseInt(m[2] ?? '0', 10);
  return mins > 0 && mins <= 24 * 60 ? mins : undefined;
}

function parseTime(tok: string): number | undefined {
  // @9, @9am, @9:30pm, @14:30, @1430
  const m = /^@(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/i.exec(tok);
  if (!m) return undefined;
  let h = parseInt(m[1] ?? '0', 10);
  const min = parseInt(m[2] ?? '0', 10);
  const ap = m[3]?.toLowerCase();
  if (min > 59) return undefined;
  if (ap) {
    if (h < 1 || h > 12) return undefined;
    if (ap.startsWith('p') && h !== 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
  } else if (h > 23) return undefined;
  return h * 60 + min;
}

function parseDate(tok: string, today: DateKey): DateKey | 'someday' | undefined {
  const t = tok.toLowerCase();
  if (t === 'today' || t === 'tod') return today;
  if (t === 'tomorrow' || t === 'tmr' || t === 'tom') return addDays(today, 1);
  if (t === 'someday' || t === 'later') return 'someday';
  if (t === 'nextweek') return nextWeekday(today, 1);
  if (isValidKey(t)) return t;
  const wd = weekdayIndex(t);
  if (wd >= 0 && /^[a-z]+$/.test(t)) return nextWeekday(today, wd);
  return undefined;
}

/**
 * Parse a quick-capture line such as
 * `Draft essay intro 45m tomorrow @9am #writing !high`.
 *
 * Tokens are only consumed when they are unambiguous so ordinary words in the
 * title survive ("Call mum" keeps "mum"; only a lone weekday word becomes a date).
 */
export function parseQuickAdd(input: string, today: DateKey): ParsedTask {
  const out: ParsedTask = { title: '' };
  const titleParts: string[] = [];

  for (const raw of input.trim().split(/\s+/)) {
    if (!raw) continue;
    const lower = raw.toLowerCase();

    if (raw.startsWith('#') && raw.length > 1 && out.project === undefined) {
      out.project = raw.slice(1).replace(/[-_]/g, ' ');
      continue;
    }
    if (lower in PRIORITIES && out.priority === undefined) {
      out.priority = PRIORITIES[lower];
      continue;
    }
    if (raw.startsWith('@') && out.startMin === undefined) {
      const t = parseTime(raw);
      if (t !== undefined) {
        out.startMin = t;
        continue;
      }
    }
    if (out.estimateMin === undefined) {
      const e = parseEstimate(raw);
      if (e !== undefined) {
        out.estimateMin = e;
        continue;
      }
    }
    if (out.date === undefined && !out.someday) {
      const d = parseDate(raw, today);
      if (d === 'someday') {
        out.someday = true;
        continue;
      }
      if (d) {
        out.date = d;
        continue;
      }
    }
    titleParts.push(raw);
  }

  out.title = titleParts.join(' ');
  // A time with no date means today.
  if (out.startMin !== undefined && !out.date && !out.someday) out.date = today;
  return out;
}
