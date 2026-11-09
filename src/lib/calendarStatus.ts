import type { CalendarStatus } from '../state/calendar';

export type CalendarAction = 'sync' | 'enable' | 'reconnect' | 'retry';
export interface CalendarLineInfo {
  text: string;
  error?: boolean;
  action?: CalendarAction;
}

const clock = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

/** The one-line "why is (or isn't) my calendar syncing" shown in the Week header and Settings. null = nothing to say. */
export function describeCalendar(i: {
  status: CalendarStatus;
  linked: boolean;
  write: boolean;
  pending: number;
  error?: string;
  lastImportAt?: string;
  lastPushAt?: string;
}): CalendarLineInfo | null {
  if (!i.linked && i.status === 'off') return null;
  switch (i.status) {
    case 'off':
      return { text: 'Google Calendar · reconnect needed', action: 'reconnect' };
    case 'loading':
      return { text: 'Google Calendar · syncing…' };
    case 'expired':
      return { text: 'Google Calendar · reconnect needed', action: 'reconnect' };
    case 'error':
      return { text: i.error || 'Google Calendar · sync failed', error: true, action: 'retry' };
    case 'connected': {
      if (!i.write) return { text: 'Google Calendar · import only', action: 'enable' };
      if (i.pending > 0) return { text: `Google Calendar · ${i.pending} waiting`, action: 'sync' };
      const at = clock(i.lastPushAt ?? i.lastImportAt);
      return { text: `Google Calendar · synced${at ? ` ${at}` : ''}`, action: 'sync' };
    }
  }
}
