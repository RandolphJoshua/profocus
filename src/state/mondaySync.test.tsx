import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/Toaster';
import { saveMondayConfig } from '../lib/monday';
import { emptyState } from '../lib/storage';
import { resetMondayStatus, useMondayActions, useMondaySync } from './mondaySync';
import { StoreProvider, useStore } from './store';

function Harness() {
  useMondaySync();
  const { state } = useStore();
  const { importExisting } = useMondayActions();
  return (
    <>
      <button onClick={importExisting}>import</button>
      <ul>{state.tasks.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
      <output data-testid="seen">{JSON.stringify(state.settings.mondaySeen ?? null)}</output>
    </>
  );
}
const mount = () => render(<StoreProvider initial={emptyState()}><ToastProvider><Harness /></ToastProvider></StoreProvider>);

const raw = (id: string, name: string, owner = 95522544) => ({
  id, name, created_at: '', group: { title: 'Automation' },
  column_values: [{ id: 'multiple_person_mm7p7hex', text: '', value: JSON.stringify({ personsAndTeams: [{ id: owner, kind: 'person' }] }) }],
});
let items: ReturnType<typeof raw>[];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  resetMondayStatus();
  items = [raw('1', 'Existing one')];
  fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ data: { me: { id: '95522544' }, boards: [{ items_page: { cursor: null, items } }] } }))));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useMondaySync', () => {
  it('does nothing without a config', async () => {
    mount();
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('baselines the first run without importing, then imports only new items', async () => {
    saveMondayConfig({ token: 'tok', boardId: '5105228983', mineOnly: true });
    mount();
    await waitFor(() => expect(screen.getByTestId('seen').textContent).toBe('["1"]'));
    expect(screen.queryByText('Existing one')).toBeNull();
    expect(screen.getByText('Connected. New items from now on will appear in Tasks.')).toBeTruthy();

    items = [raw('1', 'Existing one'), raw('2', 'Brand new'), raw('3', 'Not mine', 7)];
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(screen.getByText('Brand new')).toBeTruthy());
    expect(screen.queryByText('Not mine')).toBeNull();
    expect(screen.getByTestId('seen').textContent).toBe('["1","2","3"]');
    expect(screen.getByText('New from monday: Brand new')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
  });

  it('can import the open items the baseline skipped', async () => {
    saveMondayConfig({ token: 'tok', boardId: '5105228983', mineOnly: true });
    mount();
    await waitFor(() => expect(screen.getByTestId('seen').textContent).toBe('["1"]'));
    fireEvent.click(screen.getByText('import'));
    await waitFor(() => expect(screen.getByText('Existing one', { selector: 'li' })).toBeTruthy());
  });

  it('toasts an error once and keeps the token out of it', async () => {
    saveMondayConfig({ token: 'tok-secret', boardId: '5105228983', mineOnly: true });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 401 })));
    mount();
    await waitFor(() => expect(screen.getByText('monday: monday rejected the token. Make a new one.')).toBeTruthy());
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText('monday: monday rejected the token. Make a new one.')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('tok-secret');
  });
});
