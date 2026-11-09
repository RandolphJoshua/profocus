import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AI_KEY } from '../lib/ai';
import { addDays, todayKey } from '../lib/date';
import { emptyState } from '../lib/storage';
import { AiPlanProvider, useAiPlan } from '../state/aiPlan';
import { CoachProvider } from '../state/coach';
import { StoreProvider, useStore } from '../state/store';
import { ToastProvider } from './Toaster';

const TOMORROW = addDays(todayKey(), 1);
const planJson = JSON.stringify({
  summary: 'Two tasks tomorrow.',
  newTasks: [{ ref: 't1', title: 'Call Tom', estimateMin: 15, priority: 'high', date: TOMORROW }, { ref: 't2', title: 'Draft brief', date: TOMORROW }],
  blocks: [{ date: TOMORROW, start: '10:00', end: '10:15', title: 'Call Tom', taskRef: 't1' }],
});
const reply = (text: string) => vi.fn(() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 })));

function Probe() {
  const { state } = useStore();
  const ai = useAiPlan();
  return (
    <>
      <button type="button" onClick={() => ai.open()}>open</button>
      <output data-testid="counts">{state.tasks.length}/{state.blocks.length}</output>
    </>
  );
}
const mount = () => render(
  <StoreProvider initial={emptyState()}>
    <CoachProvider><ToastProvider><AiPlanProvider><Probe /></AiPlanProvider></ToastProvider></CoachProvider>
  </StoreProvider>,
);
const counts = () => screen.getByTestId('counts').textContent;

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) { this.removeAttribute('open'); };
});
beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('Plan with AI dialog', () => {
  it('asks to set up the coach when there is no key', () => {
    mount();
    fireEvent.click(screen.getByText('open'));
    expect(screen.getByText('Set up the AI coach first.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Settings' }).getAttribute('href')).toBe('#settings');
  });

  it('previews, applies only the ticked items, then undoes', async () => {
    localStorage.setItem(AI_KEY, JSON.stringify({ provider: 'openai-compatible', apiKey: 'SECRET-KEY', model: 'm', baseUrl: 'https://x.test/v1' }));
    const fetchMock = reply(planJson);
    vi.stubGlobal('fetch', fetchMock);
    mount();
    fireEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByRole('button', { name: 'Break a task into steps' }));
    fireEvent.change(screen.getByLabelText('What should I plan?'), { target: { value: 'Call Tom tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    expect(await screen.findByText('Two tasks tomorrow.')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(counts()).toBe('0/0');

    fireEvent.click(screen.getByRole('checkbox', { name: /Draft brief/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply 2' }));
    expect(counts()).toBe('1/1');
    expect(await screen.findByText('Added 1 task and 1 block')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(counts()).toBe('0/0'));
    expect(document.body.innerHTML).not.toContain('SECRET-KEY');
  });

  it('shows the provider error inline', async () => {
    localStorage.setItem(AI_KEY, JSON.stringify({ provider: 'openai-compatible', apiKey: 'k', model: 'm', baseUrl: 'https://x.test/v1' }));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), { status: 401 }))));
    mount();
    fireEvent.click(screen.getByText('open'));
    fireEvent.change(screen.getByLabelText('What should I plan?'), { target: { value: 'x' } });
    fireEvent.keyDown(screen.getByLabelText('What should I plan?'), { key: 'Enter', ctrlKey: true });
    expect((await screen.findByRole('alert')).textContent).toBe('Invalid API key');
  });
});
