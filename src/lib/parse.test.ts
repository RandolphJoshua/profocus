import { parseQuickAdd } from './parse';

// 2026-11-04 is a Wednesday.
const TODAY = '2026-11-04';

describe('parseQuickAdd', () => {
  it('extracts every token type', () => {
    expect(parseQuickAdd('Draft essay intro 45m tomorrow @9am #writing !high', TODAY)).toEqual({
      title: 'Draft essay intro',
      date: '2026-11-05',
      estimateMin: 45,
      startMin: 9 * 60,
      project: 'writing',
      priority: 'high',
    });
  });

  it('leaves plain titles alone', () => {
    expect(parseQuickAdd('Call mum about the trip', TODAY)).toEqual({ title: 'Call mum about the trip' });
  });

  it('parses weekdays to the next occurrence', () => {
    expect(parseQuickAdd('Gym fri', TODAY).date).toBe('2026-11-06');
    expect(parseQuickAdd('Gym wed', TODAY).date).toBe('2026-11-11');
    expect(parseQuickAdd('Plan monday', TODAY).date).toBe('2026-11-09');
  });

  it('parses estimates in several forms', () => {
    expect(parseQuickAdd('a 1h', TODAY).estimateMin).toBe(60);
    expect(parseQuickAdd('a 1h30m', TODAY).estimateMin).toBe(90);
    expect(parseQuickAdd('a 1.5h', TODAY).estimateMin).toBe(90);
    expect(parseQuickAdd('a 20min', TODAY).estimateMin).toBe(20);
  });

  it('parses 12h and 24h times, defaulting the date to today', () => {
    expect(parseQuickAdd('Standup @14:30', TODAY)).toMatchObject({ startMin: 870, date: TODAY });
    expect(parseQuickAdd('Lunch @12pm', TODAY).startMin).toBe(720);
    expect(parseQuickAdd('Night @12am', TODAY).startMin).toBe(0);
    expect(parseQuickAdd('Email @bob', TODAY)).toEqual({ title: 'Email @bob' });
  });

  it('supports explicit dates and someday', () => {
    expect(parseQuickAdd('Taxes 2026-12-01', TODAY).date).toBe('2026-12-01');
    expect(parseQuickAdd('Learn piano someday', TODAY)).toEqual({ title: 'Learn piano', someday: true });
  });

  it('turns dashes in project tags into spaces', () => {
    expect(parseQuickAdd('Outline #side-project', TODAY).project).toBe('side project');
  });
});
