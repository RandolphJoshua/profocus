import { act, fireEvent, render, screen } from '@testing-library/react';
import { emptyState } from '../lib/storage';
import { StoreProvider } from '../state/store';
import { TimerProvider } from '../state/timer';
import { FocusTimer } from './FocusTimer';
import { lengthChoices } from './LengthPicker';

const mount = (compact = false) =>
  render(<StoreProvider initial={emptyState()}><TimerProvider><FocusTimer compact={compact} /></TimerProvider></StoreProvider>);
const clock = () => screen.getByRole('timer').textContent;

beforeEach(() => localStorage.clear());

describe('focus length picker', () => {
  it('changing the select changes the clock', () => {
    mount();
    expect(clock()).toBe('25:00');
    fireEvent.change(screen.getByLabelText('Focus length'), { target: { value: '45' } });
    expect(clock()).toBe('45:00');
    expect((screen.getByLabelText('Focus length') as HTMLSelectElement).value).toBe('45');
  });

  it('works in the compact sidebar timer too', () => {
    mount(true);
    fireEvent.change(screen.getByLabelText('Focus length'), { target: { value: '15' } });
    expect(clock()).toBe('15:00');
  });

  it('is hidden while running and back after pause', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.queryByLabelText('Focus length')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByLabelText('Focus length')).toBeTruthy();
  });

  it('resets a paused, partly used timer so the new length shows', () => {
    vi.useFakeTimers();
    try {
      mount();
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      act(() => { vi.advanceTimersByTime(5000); });
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      expect(clock()).toBe('24:55');
      fireEvent.change(screen.getByLabelText('Focus length'), { target: { value: '50' } });
      expect(clock()).toBe('50:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers breaks their own lengths in the full timer and hides in the compact one', () => {
    const { unmount } = mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Short break' }));
    fireEvent.change(screen.getByLabelText('Short break length'), { target: { value: '10' } });
    expect(clock()).toBe('10:00');
    unmount();
    mount(true);
    expect(screen.queryByLabelText('Short break length')).toBeNull();
  });

  it('adds a non-preset current length so the select shows the truth', () => {
    expect(lengthChoices('focus', 37)).toEqual([15, 20, 25, 30, 37, 45, 50, 60, 90]);
    expect(lengthChoices('focus', 25)).toEqual([15, 20, 25, 30, 45, 50, 60, 90]);
  });
});
