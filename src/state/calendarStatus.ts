import { describeCalendar, type CalendarAction, type CalendarLineInfo } from '../lib/calendarStatus';
import { useCalendar } from './calendar';
import { useStore } from './store';

export interface CalendarLine extends CalendarLineInfo {
  actionLabel?: string;
  run: () => void;
}

const LABELS: Record<CalendarAction, string> = { sync: 'Sync now', enable: 'Turn on sync', reconnect: 'Reconnect', retry: 'Retry' };

/** Status text plus the one action that fits it; null when the calendar is not linked. */
export function useCalendarLine(): CalendarLine | null {
  const cal = useCalendar();
  const { state, dispatch } = useStore();
  const info = describeCalendar({
    status: cal.status,
    linked: state.settings.calendarConnected === true,
    write: state.settings.calendarWrite === true,
    pending: cal.pending,
    error: cal.error,
    lastImportAt: cal.lastImportAt,
    lastPushAt: cal.lastPushAt,
  });
  if (!info) return null;
  const run = () => {
    if (info.action === 'enable') dispatch({ type: 'SET_SETTINGS', patch: { calendarWrite: true } });
    else if (info.action === 'reconnect') cal.connect();
    else if (info.action) void cal.syncNow();
  };
  return { ...info, actionLabel: info.action ? LABELS[info.action] : undefined, run };
}
