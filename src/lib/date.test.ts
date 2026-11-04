import { addDays, formatDuration, isValidKey, startOfWeek, weekDays } from './date';

describe('date helpers', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('finds the start of the week', () => {
    expect(startOfWeek('2026-11-04', 1)).toBe('2026-11-02');
    expect(startOfWeek('2026-11-04', 0)).toBe('2026-11-01');
    expect(startOfWeek('2026-11-02', 1)).toBe('2026-11-02');
    expect(weekDays('2026-11-02')).toHaveLength(7);
  });

  it('validates keys', () => {
    expect(isValidKey('2026-02-30')).toBe(false);
    expect(isValidKey('2026-02-28')).toBe(true);
    expect(isValidKey('tomorrow')).toBe(false);
  });

  it('formats durations', () => {
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(95)).toBe('1h 35m');
  });
});
