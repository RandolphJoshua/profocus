import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlanWeek } from '../components/PlanWeek';
import { SettingsView } from '../views/SettingsView';
import { TodayView } from '../views/TodayView';
import { AI_KEY } from '../lib/ai';
import { startOfWeek, todayKey } from '../lib/date';
import { emptyState } from '../lib/storage';
import { CoachProvider } from './coach';
import { StoreProvider } from './store';
import { TimerProvider } from './timer';
import { AuthProvider } from './auth';
import { SyncProvider } from './sync';
import { CalendarProvider } from './calendar';

function mount(ui: React.ReactNode) {
  return render(
    <StoreProvider initial={emptyState()}>
      <AuthProvider>
        <SyncProvider>
          <CalendarProvider>
            <CoachProvider>
              <TimerProvider>{ui}</TimerProvider>
            </CoachProvider>
          </CalendarProvider>
        </SyncProvider>
      </AuthProvider>
    </StoreProvider>,
  );
}

const gemini = (text: string) => vi.fn(() => Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 })));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('coach without a key', () => {
  it('renders no coach UI on Today and shows the form in Settings', () => {
    const view = mount(<TodayView quickAddRef={{ current: null }} />);
    expect(screen.queryByText('Coach, read my day')).toBeNull();
    view.unmount();
    mount(<SettingsView />);
    expect(screen.getByRole('heading', { name: 'AI coach' })).toBeTruthy();
    expect((screen.getByLabelText('API key') as HTMLInputElement).type).toBe('password');
    expect(screen.getByText('Stays in this browser. Never synced.')).toBeTruthy();
  });

  it('saves the key to localStorage only, not to app state', () => {
    mount(<SettingsView />);
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'SECRET-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(JSON.parse(localStorage.getItem(AI_KEY) ?? '{}').apiKey).toBe('SECRET-123');
    expect(localStorage.getItem('profocus:v1') ?? '').not.toContain('SECRET-123');
    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(localStorage.getItem(AI_KEY)).toBeNull();
  });
});

describe('coach with a key', () => {
  beforeEach(() => localStorage.setItem(AI_KEY, JSON.stringify({ provider: 'gemini', apiKey: 'K', model: 'gemini-2.5-flash' })));

  it('stores and renders the daily note after a click', async () => {
    const fetchMock = gemini('Protect the morning block, then write the intro first.');
    vi.stubGlobal('fetch', fetchMock);
    mount(<TodayView quickAddRef={{ current: null }} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Coach, read my day' })); });
    await waitFor(() => expect(screen.getByText('Protect the morning block, then write the intro first.')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows the error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 400 }))));
    mount(<TodayView quickAddRef={{ current: null }} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Coach, read my day' })); });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('API key not valid'));
  });

  it('drafts suggestions in Plan my week and fills the first empty priority', async () => {
    vi.stubGlobal('fetch', gemini('{"suggestions":[{"text":"Finish the draft.","title":"Finish the draft"},{"text":"Rest."},{"text":"Plan."}]}'));
    mount(<PlanWeek week={startOfWeek(todayKey(), 1)} onClose={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Draft suggestions' })); });
    await waitFor(() => expect(screen.getByText('Finish the draft.')).toBeTruthy());
    expect(screen.getAllByRole('button', { name: 'Use as priority' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Use as priority' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect((screen.getByLabelText('Priority 1') as HTMLInputElement).value).toBe('Finish the draft');
  });
});
