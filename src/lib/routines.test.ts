import { blocksForDay, dayPartOf, instanceId, routineInstances, skipKey, weekdayOf } from './routines';
import { emptyState } from './storage';
import type { AppState, Routine } from './types';

const SUN = '2026-11-08';
const MON = '2026-11-09';
const TUE = '2026-11-10';
const SAT = '2026-11-14';

const routine = (over: Partial<Routine> = {}): Routine => ({
  id: 'r1', title: 'Deep work', days: [1, 2, 3, 4, 5], start: 480, end: 630, kind: 'focus', createdAt: '2026-11-01T00:00:00.000Z', ...over,
});
const withRoutines = (routines: Routine[], extra: Partial<AppState> = {}): AppState => ({ ...emptyState(), routines, ...extra });

describe('routineInstances', () => {
  it('uses 0 = Sunday for the weekday', () => {
    expect(weekdayOf(SUN)).toBe(0);
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(SAT)).toBe(6);
  });

  it('runs on a Sunday only when day 0 is chosen', () => {
    expect(routineInstances(withRoutines([routine({ days: [0] })]), SUN)).toHaveLength(1);
    expect(routineInstances(withRoutines([routine({ days: [1, 2, 3, 4, 5, 6] })]), SUN)).toHaveLength(0);
  });

  it('matches weekdays and not other days', () => {
    const s = withRoutines([routine()]);
    expect(routineInstances(s, MON)).toHaveLength(1);
    expect(routineInstances(s, SAT)).toHaveLength(0);
    expect(routineInstances(s, SUN)).toHaveLength(0);
  });

  it('respects from and until, inclusive', () => {
    const s = withRoutines([routine({ days: [0, 1, 2, 3, 4, 5, 6], from: MON, until: TUE })]);
    expect(routineInstances(s, SUN)).toHaveLength(0);
    expect(routineInstances(s, MON)).toHaveLength(1);
    expect(routineInstances(s, TUE)).toHaveLength(1);
    expect(routineInstances(s, '2026-11-11')).toHaveLength(0);
  });

  it('skips paused routines', () => {
    expect(routineInstances(withRoutines([routine({ paused: true })]), MON)).toEqual([]);
  });

  it('skips only the skipped date', () => {
    const s = withRoutines([routine()], { routineSkips: [skipKey('r1', MON)] });
    expect(routineInstances(s, MON)).toEqual([]);
    expect(routineInstances(s, TUE)).toHaveLength(1);
  });

  it('builds a virtual block with id rt:<routineId>:<date>', () => {
    const [b] = routineInstances(withRoutines([routine({ notes: 'Phone away', projectId: 'p-work' })]), MON);
    expect(b).toEqual({
      id: 'rt:r1:2026-11-09', routineId: 'r1', date: MON, start: 480, end: 630, title: 'Deep work', kind: 'focus', notes: 'Phone away', projectId: 'p-work',
    });
    expect(instanceId('r1', MON)).toBe(b?.id);
  });
});

describe('blocksForDay', () => {
  it('merges real blocks of that date with instances, sorted by start, without storing instances', () => {
    const s = withRoutines([routine({ start: 600, end: 660 })], {
      blocks: [
        { id: 'b-late', date: MON, start: 900, end: 960, title: 'Late', kind: 'focus' },
        { id: 'b-early', date: MON, start: 420, end: 450, title: 'Early', kind: 'personal' },
        { id: 'b-other', date: TUE, start: 100, end: 160, title: 'Other day', kind: 'focus' },
      ],
    });
    expect(blocksForDay(s, MON).map((b) => b.id)).toEqual(['b-early', 'rt:r1:2026-11-09', 'b-late']);
    expect(s.blocks).toHaveLength(3);
  });
});

describe('dayPartOf', () => {
  it('splits at 12:00 and 17:00', () => {
    expect([dayPartOf(0), dayPartOf(719), dayPartOf(720), dayPartOf(1019), dayPartOf(1020)]).toEqual(['Morning', 'Morning', 'Afternoon', 'Afternoon', 'Evening']);
  });
});
