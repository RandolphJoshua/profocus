import { fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
import { emptyState } from './lib/storage';
import { StoreProvider } from './state/store';
import { TimerProvider } from './state/timer';

describe('App', () => {
  beforeEach(() => localStorage.clear());

  it('quick-adds a task to today and renders its time block', () => {
    render(
      <StoreProvider initial={emptyState()}>
        <TimerProvider>
          <App />
        </TimerProvider>
      </StoreProvider>,
    );
    const input = screen.getByLabelText('Quick add task');
    fireEvent.change(input, { target: { value: 'Write intro 45m @9am #writing !high' } });
    fireEvent.submit(input.closest('form')!);

    expect(screen.getByRole('button', { name: 'Write intro' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Write intro, 9:00/ })).toBeTruthy();
    expect(screen.getByText('Writing')).toBeTruthy();
  });
});
