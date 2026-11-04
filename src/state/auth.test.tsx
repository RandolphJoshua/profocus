import { render, screen } from '@testing-library/react';
import { App } from '../App';
import { emptyState } from '../lib/storage';
import { AuthProvider } from './auth';
import { StoreProvider } from './store';
import { SyncProvider } from './sync';
import { TimerProvider } from './timer';

vi.mock('../lib/supabase', () => ({ supabase: null }));

describe('cloud sync disabled', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '#settings';
  });

  it('says sync is not configured and shows no sync line', () => {
    const { container } = render(
      <StoreProvider initial={emptyState()}>
        <AuthProvider>
          <SyncProvider>
            <TimerProvider>
              <App />
            </TimerProvider>
          </SyncProvider>
        </AuthProvider>
      </StoreProvider>,
    );
    expect(screen.getByText('Cloud sync is not configured on this build.')).toBeTruthy();
    expect(container.querySelector('.sync-line')).toBeNull();
  });
});
