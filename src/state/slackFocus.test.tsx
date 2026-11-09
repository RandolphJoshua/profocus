import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/Toaster';
import { SLACK_KEY, saveSlackConfig } from '../lib/slack';
import { emptyState } from '../lib/storage';
import { SLACK_ACTIVE_KEY, useSlackFocusSync } from './slackFocus';
import { StoreProvider } from './store';
import { TimerProvider, useTimer } from './timer';

function Harness() {
  useSlackFocusSync();
  const t = useTimer();
  return (
    <>
      <button onClick={() => t.start()}>start</button>
      <button onClick={() => t.pause()}>pause</button>
    </>
  );
}
const mount = () => render(<StoreProvider initial={emptyState()}><ToastProvider><TimerProvider><Harness /></TimerProvider></ToastProvider></StoreProvider>);
const cfg = { token: 'xoxp-abc', text: 'Focusing', emoji: ':headphones:', withTask: false, dnd: true };
const called = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => String(c[0]).replace('https://slack.com/api/', ''));

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true }))));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useSlackFocusSync', () => {
  it('does nothing without a config', async () => {
    mount();
    fireEvent.click(screen.getByText('start'));
    fireEvent.click(screen.getByText('pause'));
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sets the status once on start and clears it on pause', async () => {
    saveSlackConfig(cfg);
    mount();
    fireEvent.click(screen.getByText('start'));
    await waitFor(() => expect(called(fetchMock)).toEqual(['users.profile.set', 'dnd.setSnooze']));
    expect(localStorage.getItem(SLACK_ACTIVE_KEY)).toBe('1');
    fireEvent.click(screen.getByText('pause'));
    await waitFor(() => expect(called(fetchMock)).toEqual(['users.profile.set', 'dnd.setSnooze', 'users.profile.set', 'dnd.endSnooze']));
    expect(localStorage.getItem(SLACK_ACTIVE_KEY)).toBeNull();
  });

  it('never clears a status it did not set', async () => {
    saveSlackConfig(cfg);
    mount();
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('toasts one error without the token and keeps going', async () => {
    saveSlackConfig(cfg);
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'invalid_auth' }))));
    mount();
    fireEvent.click(screen.getByText('start'));
    expect(await screen.findByText('Slack status: Slack rejected the token. Make a new one.')).toBeTruthy();
    expect(document.body.textContent).not.toContain('xoxp-abc');
    expect(localStorage.getItem(SLACK_KEY)).not.toBeNull();
  });
});
