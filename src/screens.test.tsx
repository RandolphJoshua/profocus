import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { addDays, startOfWeek, todayKey } from './lib/date';
import { emptyState } from './lib/storage';
import type { AppState } from './lib/types';
import { StoreProvider } from './state/store';
import { TimerProvider } from './state/timer';

function mount(initial: AppState, hash = '') {
  window.location.hash = hash;
  return render(
    <StoreProvider initial={initial}>
      <TimerProvider>
        <App />
      </TimerProvider>
    </StoreProvider>,
  );
}

beforeAll(() => {
  // jsdom has no <dialog> modal support; open the element so its contents are reachable.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 10, 0, 0)); // Wed 4 Nov 2026, 10:00 local
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

const task = (id: string, title: string, over: Partial<AppState['tasks'][number]> = {}) => ({
  id, title, done: false, createdAt: '2026-11-01T08:00:00.000Z', ...over,
});

describe('Plan my day', () => {
  it('triages, sets the highlight, schedules a block and marks the day planned', () => {
    const today = todayKey();
    const initial: AppState = {
      ...emptyState(),
      tasks: [
        task('a', 'Write intro', { date: today, estimateMin: 45 }),
        task('b', 'Old report', { date: addDays(today, -2) }),
      ],
    };
    mount(initial, 'today');
    expect(screen.queryByText(/planned \d+ days? in a row/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Plan my day' }));
    // Step 1: pull the overdue task into today.
    fireEvent.click(screen.getByLabelText(/Old report/));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // Step 2: choose the highlight.
    fireEvent.click(screen.getByLabelText('Write intro'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    // Step 3: schedule it from 10:00.
    fireEvent.click(screen.getByRole('button', { name: 'Schedule Write intro' }));
    expect(within(screen.getByRole('dialog', { name: 'Plan my day' })).getByText(/10:00.*10:45/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(screen.getByDisplayValue('Write intro')).toBeTruthy(); // highlight textarea
    expect(screen.getByRole('button', { name: 'Re-plan' })).toBeTruthy();
    expect(screen.getByText(/planned 1 day in a row/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Old report' })).toBeTruthy(); // now a task for today
  });
});

describe('Plan my week', () => {
  it('sets three priorities, adds one as a task and shows them on Today', () => {
    const today = todayKey();
    const week = startOfWeek(today, 1);
    const initial: AppState = {
      ...emptyState(),
      goals: [{ id: 'g1', title: 'Ship the book', status: 'active', createdAt: '2026-11-01T08:00:00.000Z' }],
    };
    mount(initial, 'week');
    fireEvent.click(screen.getByRole('button', { name: 'Plan my week' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // last week
    fireEvent.change(screen.getByLabelText('Priority 1'), { target: { value: 'Draft chapter 3' } });
    fireEvent.change(screen.getByLabelText('Goal for priority 1'), { target: { value: 'g1' } });
    fireEvent.change(screen.getByLabelText('Priority 2'), { target: { value: 'Three workouts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Draft chapter 3 as task' }));
    expect(screen.getByText(/Added as a task on/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    // The Week view now carries the panel, with checkboxes.
    const panel = screen.getByRole('region', { name: 'This week’s three' });
    expect(within(panel).getByText('Draft chapter 3')).toBeTruthy();
    expect(within(panel).getByText('Ship the book')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Done: Three workouts' }));
    expect(within(panel).getByRole('checkbox', { name: 'Done: Three workouts' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Re-plan' })).toBeTruthy();
    expect(week).toBe(startOfWeek(today, 1));
  });
});

describe('Focus mode', () => {
  it('shows the task and clock, and Esc returns to the previous view', async () => {
    const initial: AppState = { ...emptyState(), tasks: [task('a', 'Write intro', { date: todayKey() })] };
    mount(initial, 'week');
    expect(screen.getByRole('heading', { level: 1, name: 'Week' })).toBeTruthy();

    // Choose the task inside focus mode (nothing is selected yet).
    fireEvent.click(screen.getAllByRole('button', { name: 'Focus mode' })[0]!);
    const overlay = await screen.findByRole('main', { name: 'Focus mode' });
    expect(within(overlay).getByText('No task — pick one')).toBeTruthy();
    fireEvent.change(within(overlay).getByLabelText('Pick a task'), { target: { value: 'a' } });
    expect(within(overlay).getByText('Write intro')).toBeTruthy();
    expect(within(overlay).getByRole('timer').textContent).toBe('25:00');

    fireEvent.keyDown(window, { key: 'Escape' });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('main', { name: 'Focus mode' })).toBeNull();
    expect(window.location.hash).toBe('#week');
    expect(screen.getByRole('heading', { level: 1, name: 'Week' })).toBeTruthy();
  });

  it('opens straight from #focus', () => {
    mount(emptyState(), 'focus');
    const overlay = screen.getByRole('main', { name: 'Focus mode' });
    expect(within(overlay).getByRole('timer').textContent).toBe('25:00');
  });
});

describe('Goals', () => {
  it('adds a goal and lists it with its progress line', () => {
    mount(emptyState(), 'goals');
    expect(screen.getByRole('heading', { level: 1, name: 'Goals' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Goal'), { target: { value: 'Run a half marathon' } });
    fireEvent.change(screen.getByLabelText('Why it matters'), { target: { value: 'Energy for the long days' } });
    fireEvent.change(screen.getByLabelText('Target date'), { target: { value: '2027-03-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add goal' }));

    expect(screen.getByRole('heading', { name: 'Run a half marathon' })).toBeTruthy();
    expect(screen.getByText('Due 2027-03-01')).toBeTruthy();
    expect(screen.getByText('0m focused in 30 days · 0 tasks done · 0 open · prioritised 0 weeks')).toBeTruthy();
    expect(screen.getByText('1 active · 0 done')).toBeTruthy();
  });
});
