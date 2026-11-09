import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { App } from '../App';
import { emptyState } from '../lib/storage';
import type { AppState, Routine } from '../lib/types';
import { StoreProvider } from '../state/store';
import { TimerProvider } from '../state/timer';

const WED = '2026-11-04';
const THU = '2026-11-05';
const routine: Routine = {
  id: 'r1', title: 'Morning walk', days: [3], start: 7 * 60, end: 8 * 60, kind: 'personal', notes: 'No phone', createdAt: '2026-11-01T00:00:00.000Z',
};

function mount(initial: AppState, hash: string) {
  window.location.hash = hash;
  return render(
    <StoreProvider initial={initial}>
      <TimerProvider>
        <App />
      </TimerProvider>
    </StoreProvider>,
  );
}
const column = (container: HTMLElement, day: string) => container.querySelector<HTMLElement>(`.day-col[data-day="${day}"]`) as HTMLElement;

beforeAll(() => {
  // jsdom has no <dialog> modal support; open the element so its contents are reachable.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 10, 4, 10, 0, 0)); // Wed 4 Nov 2026, 10:00 local
});
afterEach(() => {
  vi.useRealTimers();
  window.location.hash = '';
});

describe('routines on the Week grid', () => {
  it('shows on its weekday, not on another, and Skip hides it for that date', () => {
    const { container } = mount({ ...emptyState(), routines: [routine] }, 'week');
    expect(within(column(container, WED)).getByRole('button', { name: /Morning walk/ })).toBeTruthy();
    expect(within(column(container, THU)).queryByText(/Morning walk/)).toBeNull();
    expect(container.querySelectorAll('.block.is-routine')).toHaveLength(1);

    fireEvent.click(within(column(container, WED)).getByRole('button', { name: /Morning walk/ }));
    expect(screen.getByText('No phone')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Skip Wednesday' }));
    expect(within(column(container, WED)).queryByText(/Morning walk/)).toBeNull();
  });

  it('makes a one-off copy that can then be edited, and skips the routine that day', () => {
    const { container } = mount({ ...emptyState(), routines: [routine] }, 'week');
    fireEvent.click(within(column(container, WED)).getByRole('button', { name: /Morning walk/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Make a one-off copy' }));
    const col = column(container, WED);
    expect(col.querySelectorAll('.block')).toHaveLength(1);
    expect(col.querySelector('.is-routine')).toBeNull();
    expect(within(col).getByRole('button', { name: /Morning walk/ })).toBeTruthy();
  });

  it('lays overlapping blocks side by side', () => {
    const state = { ...emptyState(), routines: [routine], blocks: [{ id: 'b1', date: WED, start: 7 * 60 + 30, end: 9 * 60, title: 'Standup', kind: 'meeting' as const }] };
    const { container } = mount(state, 'week');
    const blocks = Array.from(column(container, WED).querySelectorAll<HTMLElement>('.block'));
    expect(blocks).toHaveLength(2);
    const [first, second] = blocks;
    expect(first?.style.width).toBeTruthy();
    expect(first?.style.width).toBe(second?.style.width);
    expect(blocks[0]?.style.left).not.toBe(blocks[1]?.style.left);
  });
});

describe('Routines section', () => {
  it('shows the empty state, adds a routine through the form, and shows it on Today', () => {
    const { container } = mount(emptyState(), 'habits');
    expect(screen.getByText(/No routines yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add routine' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Planning' } });
    fireEvent.submit(screen.getByLabelText('Name').closest('form') as HTMLFormElement);
    expect(screen.getByRole('alert').textContent).toMatch(/at least one day/);
    fireEvent.click(screen.getByRole('button', { name: 'Wednesday' }));
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '09:30' } });
    fireEvent.submit(screen.getByLabelText('Name').closest('form') as HTMLFormElement);
    expect(screen.getByRole('alert').textContent).toMatch(/after the start/);
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '08:00' } });
    fireEvent.submit(screen.getByLabelText('Name').closest('form') as HTMLFormElement);
    expect(container.querySelector('.routine-title')?.textContent).toBe('Planning');
    expect(container.querySelector('.routine-time')?.textContent).toBe('08:00–09:00');
  });

  it('pauses, resumes and deletes with an undo toast', () => {
    const { container } = mount({ ...emptyState(), routines: [routine] }, 'habits');
    fireEvent.click(screen.getByRole('button', { name: 'Pause Morning walk' }));
    expect(container.querySelector('.routine-row.is-paused')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume Morning walk' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Morning walk' }));
    expect(container.querySelector('.routine-row')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(container.querySelector('.routine-title')?.textContent).toBe('Morning walk');
  });
});

describe('SOS reset', () => {
  const sos = () => within(document.querySelector('dialog[aria-label="20-minute reset"]') as HTMLElement);
  const tick = (s: number) => act(() => { vi.advanceTimersByTime(s * 1000); });

  it('opens from the command palette and advances steps with the countdown', () => {
    mount(emptyState(), 'today');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(screen.getByLabelText('Search commands and tasks'), { target: { value: 'sos' } });
    fireEvent.keyDown(screen.getByLabelText('Search commands and tasks'), { key: 'Enter' });
    expect(screen.getByLabelText('Time left in this step').textContent).toBe('02:00');
    const steps = () => screen.getAllByRole('listitem').filter((li) => li.closest('.sos-steps'));
    expect(steps()[0]?.getAttribute('aria-current')).toBe('step');

    fireEvent.click(sos().getByRole('button', { name: 'Start' }));
    tick(30);
    expect(screen.getByLabelText('Time left in this step').textContent).toBe('01:30');
    fireEvent.click(sos().getByRole('button', { name: 'Pause' }));
    tick(60);
    expect(screen.getByLabelText('Time left in this step').textContent).toBe('01:30');
    fireEvent.click(sos().getByRole('button', { name: 'Resume' }));
    tick(90);
    expect(steps()[1]?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByLabelText('Time left in this step').textContent).toBe('10:00');

    fireEvent.click(sos().getByRole('button', { name: 'Skip step' }));
    fireEvent.click(sos().getByRole('button', { name: 'Skip step' }));
    fireEvent.click(sos().getByRole('button', { name: 'Skip step' }));
    expect(screen.getByText('Now pick one task and start it.')).toBeTruthy();
    fireEvent.click(sos().getByRole('button', { name: 'Pick a task' }));
    expect(window.location.hash).toBe('#today');
  });
});
