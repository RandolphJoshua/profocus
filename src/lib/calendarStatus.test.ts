import { describe, expect, it } from 'vitest';
import { describeCalendar } from './calendarStatus';

const base = { status: 'connected' as const, linked: true, write: true, pending: 0 };

describe('describeCalendar', () => {
  it('says nothing when the calendar is not linked', () => {
    expect(describeCalendar({ ...base, status: 'off', linked: false })).toBeNull();
  });
  it('shows the last sync time and offers Sync now', () => {
    const d = describeCalendar({ ...base, lastPushAt: new Date(2026, 0, 1, 12, 3).toISOString() });
    expect(d?.text).toMatch(/^Google Calendar · synced .*12.*03/);
    expect(d?.action).toBe('sync');
  });
  it('shows how many blocks are waiting', () => {
    expect(describeCalendar({ ...base, pending: 2 })?.text).toBe('Google Calendar · 2 waiting');
  });
  it('is import-only when writing is off and offers to turn it on', () => {
    const d = describeCalendar({ ...base, write: false });
    expect(d).toMatchObject({ text: 'Google Calendar · import only', action: 'enable' });
  });
  it('asks to reconnect when expired', () => {
    expect(describeCalendar({ ...base, status: 'expired' })).toMatchObject({ text: 'Google Calendar · reconnect needed', action: 'reconnect' });
  });
  it('shows the error text with Retry', () => {
    expect(describeCalendar({ ...base, status: 'error', error: 'Boom.' })).toMatchObject({ text: 'Boom.', error: true, action: 'retry' });
  });
  it('shows progress while loading, without an action', () => {
    expect(describeCalendar({ ...base, status: 'loading' })).toEqual({ text: 'Google Calendar · syncing…' });
  });
});
