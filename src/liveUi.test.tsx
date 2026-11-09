import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from './App';
import { Roll } from './components/Roll';
import { todayKey } from './lib/date';
import { emptyState } from './lib/storage';
import type { AppState } from './lib/types';
import { StoreProvider } from './state/store';
import { TimerProvider } from './state/timer';

function mount(initial: AppState) {
  window.location.hash = '';
  return render(
    <StoreProvider initial={initial}>
      <TimerProvider>
        <App />
      </TimerProvider>
    </StoreProvider>,
  );
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
beforeEach(() => localStorage.clear());
afterEach(() => { window.location.hash = ''; });

const openPalette = () => fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

describe('command palette', () => {
  it('opens with Ctrl+K, adds a task from typed text and closes on Escape', () => {
    mount(emptyState());
    openPalette();
    const input = screen.getByRole('combobox', { name: 'Search commands and tasks' });
    fireEvent.change(input, { target: { value: 'Buy stamps 20m' } });
    const option = screen.getByRole('option', { name: /Add task: Buy stamps 20m/ });
    expect(input.getAttribute('aria-activedescendant')).toBe(option.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy stamps' })).toBeTruthy();
  });

  it('moves the active option with the arrow keys and navigates on Enter', () => {
    mount(emptyState());
    openPalette();
    const input = screen.getByRole('combobox', { name: 'Search commands and tasks' });
    fireEvent.change(input, { target: { value: 'go to' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(within(screen.getByRole('listbox', { name: 'Results' })).getAllByRole('option')[1]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('heading', { level: 1, name: 'Week' })).toBeTruthy();
  });

  it('closes on Escape', () => {
    mount(emptyState());
    openPalette();
    fireEvent(screen.getByRole('dialog', { name: 'Command palette' }), new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });
});

describe('toasts', () => {
  const withTask = (): AppState => ({
    ...emptyState(),
    tasks: [{ id: 't1', title: 'Write report', done: false, date: todayKey(), createdAt: '2026-11-01T08:00:00.000Z' }],
  });

  it('completing a task shows Done with Undo, and Undo brings it back', () => {
    mount(withTask());
    fireEvent.click(screen.getByRole('checkbox', { name: /Complete “Write report”/ }));
    const host = screen.getByRole('status', { name: '' });
    expect(within(host).getByText('Done')).toBeTruthy();
    fireEvent.click(within(host).getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('checkbox', { name: /Complete “Write report”/ }).getAttribute('aria-checked')).toBe('false');
    expect(within(host).queryByText('Done')).toBeNull();
  });

  it('deleting a task can be undone', () => {
    mount(withTask());
    fireEvent.click(screen.getByRole('button', { name: 'Write report' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('button', { name: 'Write report' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: 'Write report' })).toBeTruthy();
  });

  it('dismisses after five seconds', () => {
    vi.useFakeTimers();
    try {
      mount(withTask());
      fireEvent.click(screen.getByRole('checkbox', { name: /Complete/ }));
      expect(screen.getByText('Done')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(5100); });
      expect(screen.queryByText('Done')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stacks at most three', () => {
    const tasks = ['a', 'b', 'c', 'd'].map((id) => ({ id, title: `Task ${id}`, done: false, date: todayKey(), createdAt: '2026-11-01T08:00:00.000Z' }));
    mount({ ...emptyState(), tasks });
    for (const id of ['a', 'b', 'c', 'd']) fireEvent.click(screen.getByRole('checkbox', { name: `Complete “Task ${id}”` }));
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(3);
  });
});

describe('Roll', () => {
  it('keeps the real value as text and renders one strip per digit', () => {
    const { container, rerender } = render(<Roll value="1h 30m" />);
    expect(screen.getByText('1h 30m')).toBeTruthy();
    expect(container.querySelectorAll('.roll-strip')).toHaveLength(3);
    rerender(<Roll value="1h 45m" />);
    expect((container.querySelectorAll('.roll-strip')[2] as HTMLElement).style.getPropertyValue('--d')).toBe('5');
  });
});

describe('Getting started', () => {
  it('lists the steps, ticks planned ones and hides on request', () => {
    mount(emptyState());
    const panel = screen.getByRole('region', { name: 'Getting started' });
    expect(within(panel).getByText('0 of 3')).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Hide' }));
    expect(screen.queryByRole('region', { name: 'Getting started' })).toBeNull();
  });

  it('marks planning the day as done', () => {
    const state = emptyState();
    mount({ ...state, days: { [todayKey()]: { plannedAt: new Date().toISOString() } } });
    expect(within(screen.getByRole('region', { name: 'Getting started' })).getByText('1 of 3')).toBeTruthy();
  });
});
