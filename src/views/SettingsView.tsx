import { useRef, useState } from 'react';
import { todayKey } from '../lib/date';
import { emptyState, normalizeState } from '../lib/storage';
import { listSnapshots, saveSnapshot } from '../lib/snapshots';
import type { Settings, Theme } from '../lib/types';
import { useAuth } from '../state/auth';
import { DEFAULT_MODELS, type AiConfig, type Provider } from '../lib/ai';
import { useCalendar } from '../state/calendar';
import { useCalendarLine } from '../state/calendarStatus';
import { useCoach } from '../state/coach';
import { useStore } from '../state/store';
import { MondaySection } from './MondaySection';
import { SlackSection } from './SlackSection';
import { useSync } from '../state/sync';

function CalendarLine() {
  const cal = useCalendar();
  const { state } = useStore();
  const line = useCalendarLine();
  const linked = state.settings.calendarConnected === true;
  return (
    <div className="row gap calendar-line">
      {line ? (
        <>
          <span role="status" className={`num ${line.error ? 'sync-error' : 'muted'}`}>{line.text}</span>
          {line.actionLabel && <button type="button" className="link-btn" onClick={line.run}>{line.actionLabel}</button>}
          {cal.status === 'connected' && <button type="button" className="link-btn" onClick={cal.disconnect}>Disconnect</button>}
        </>
      ) : (
        <>
          <span className="muted">Google Calendar:</span>
          <span className="muted">{linked ? 'Disconnected' : 'Not connected'}</span>
          <button type="button" className="link-btn" onClick={cal.connect}>{linked ? 'Reconnect' : 'Connect'}</button>
        </>
      )}
    </div>
  );
}

function CalendarWriteRow() {
  const cal = useCalendar();
  const { state, dispatch } = useStore();
  if (cal.status !== 'connected') return null;
  const on = state.settings.calendarWrite === true;
  const time = cal.lastPushAt ? new Date(cal.lastPushAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div>
      <label className="row gap">
        <input type="checkbox" checked={on} onChange={(e) => dispatch({ type: 'SET_SETTINGS', patch: { calendarWrite: e.target.checked } })} />
        <span>Show my time blocks in Google Calendar</span>
      </label>
      <p className="hint">
        Adds and updates events for blocks you plan here. Only events ProFocus created are ever changed. Turning this off keeps the events already added.
        {on && time && <span className="num"> Last synced {time}</span>}
      </p>
      <p className="hint">Only blocks on the calendar grid sync. Drag a task onto a day, or give it a time like @3pm.</p>
    </div>
  );
}

function AccountSection() {
  const { user, status, signInWithGoogle, sendMagicLink, signOut } = useAuth();
  const sync = useSync();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const report = (err: string | undefined, ok = '') => {
    setFailed(Boolean(err));
    setNote(err ?? ok);
  };
  const lastSaved = sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <section className="setting">
      <div>
        <h2 className="panel-title">Account</h2>
        <p className="muted">Optional. Sync your data across devices.</p>
      </div>
      <div className="setting-body stack">
        {status === 'disabled' && <p className="muted">Cloud sync is not configured on this build.</p>}
        {status === 'loading' && <p className="muted">Checking your session…</p>}
        {status === 'signed-out' && (
          <>
            <form
              className="row gap account-form"
              onSubmit={async (e) => {
                e.preventDefault();
                report(await sendMagicLink(email.trim()), 'Check your email for the link.');
              }}
            >
              <label className="account-email">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
              <button type="submit" className="btn">Send magic link</button>
            </form>
            <div className="row gap">
              <button type="button" className="btn" onClick={async () => report(await signInWithGoogle())}>Continue with Google</button>
            </div>
            {note && <p role="status" className={failed ? 'sync-error' : 'muted'}>{note}</p>}
          </>
        )}
        {status === 'signed-in' && (
          <>
            <p>{user?.email}</p>
            <p role="status" className={sync.status === 'error' ? 'sync-error' : 'muted'}>
              {sync.status === 'error' ? sync.error : sync.status === 'syncing' ? 'Syncing…' : `Synced · last saved ${lastSaved}`}
            </p>
            <CalendarLine />
            <CalendarWriteRow />
            <div className="row gap">
              <button type="button" className="link-btn" onClick={() => void signOut()}>Sign out</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function CoachSection() {
  const coach = useCoach();
  const saved = coach.config;
  const [provider, setProvider] = useState<Provider>(saved?.provider ?? 'anthropic');
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? '');
  const [model, setModel] = useState(saved?.model ?? DEFAULT_MODELS[saved?.provider ?? 'anthropic']);
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? '');
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const draft = (): AiConfig => ({ provider, apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODELS[provider], ...(provider === 'openai-compatible' && baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}) });
  const save = () => {
    if (!apiKey.trim()) { setFailed(true); setNote('Paste an API key first.'); return false; }
    coach.setConfig(draft());
    setFailed(false);
    setNote('Saved in this browser.');
    return true;
  };
  return (
    <section className="setting">
      <div>
        <h2 className="panel-title">AI coach</h2>
        <p className="muted">Optional. A daily note and weekly suggestions, from a model you choose.</p>
      </div>
      <div className="setting-body stack">
        <form className="stack" autoComplete="off" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label>Provider
            <select
              value={provider}
              onChange={(e) => {
                const next = e.target.value as Provider;
                if (model === DEFAULT_MODELS[provider]) setModel(DEFAULT_MODELS[next]);
                setProvider(next);
              }}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="gemini">Gemini</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </select>
          </label>
          <label>API key
            <input type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </label>
          <p className="hint">Stays in this browser. Never synced.</p>
          <label>Model
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} />
            <span className="hint">Model names change; if the provider says one is unavailable, type the one it suggests and Test again.</span>
          </label>
          {provider === 'openai-compatible' && (
            <label>Base URL
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.groq.com/openai/v1" />
            </label>
          )}
          <div className="row gap">
            <button type="submit" className="btn">Save</button>
            <button
              type="button"
              className="link-btn"
              disabled={coach.busy}
              onClick={async () => {
                if (!save()) return;
                const out = await coach.test();
                setFailed(!out);
                setNote(out ? 'OK — connected' : '');
              }}
            >{coach.busy ? 'Testing…' : 'Test'}</button>
            <button
              type="button"
              className="link-btn"
              onClick={() => { coach.setConfig(null); setApiKey(''); setFailed(false); setNote('Key removed.'); }}
            >Remove key</button>
          </div>
          {note && <p role="status" className={failed ? 'sync-error' : 'muted'}>{note}</p>}
          {failed && coach.error && <p role="alert" className="sync-error">{coach.error}</p>}
        </form>
        <p className="hint">Anthropic Console (Claude) · Google AI Studio (Gemini) · Groq · OpenRouter. The coach sees your goal, priority and task titles plus this week’s numbers — never your notes.</p>
      </div>
    </section>
  );
}

export function SettingsView() {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const mergeRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [, refreshSnapshots] = useState(0);
  const snapshots = listSnapshots();
  const replaceAll = (next: typeof state, reason: string) => {
    saveSnapshot(reason, state);
    dispatch({ type: 'REPLACE_STATE', state: next });
    refreshSnapshots((n) => n + 1);
  };
  const set = (patch: Partial<Settings>) => dispatch({ type: 'SET_SETTINGS', patch });
  const num = (v: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || lo));

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `profocus-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="settings-page">
      <header className="page-head">
        <h1>Settings</h1>
        <p className="sub">Stored in this browser only.</p>
      </header>

      <AccountSection />

      <section className="setting">
        <div>
          <h2 className="panel-title">Focus timer</h2>
          <p className="muted">Session and break lengths.</p>
        </div>
        <div className="setting-body stack">
        <div className="grid-4">
          <label>Focus (min)<input type="number" min={5} max={180} value={s.focusMin} onChange={(e) => set({ focusMin: num(e.target.value, 1, 180) })} /></label>
          <label>Short break<input type="number" min={1} max={60} value={s.shortBreakMin} onChange={(e) => set({ shortBreakMin: num(e.target.value, 1, 60) })} /></label>
          <label>Long break<input type="number" min={1} max={90} value={s.longBreakMin} onChange={(e) => set({ longBreakMin: num(e.target.value, 1, 90) })} /></label>
          <label>Long break every<input type="number" min={2} max={10} value={s.longBreakEvery} onChange={(e) => set({ longBreakEvery: num(e.target.value, 2, 10) })} /></label>
        </div>
        <label className="row gap check-label"><input type="checkbox" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} /> Play a chime when a session ends</label>
        </div>
      </section>

      <section className="setting">
        <div>
          <h2 className="panel-title">Calendar</h2>
          <p className="muted">The hours your day grid shows, and the look of the app.</p>
        </div>
        <div className="setting-body stack">
        <div className="grid-4">
          <label>Day starts
            <select value={s.dayStartHour} onChange={(e) => set({ dayStartHour: Math.min(Number(e.target.value), s.dayEndHour - 1) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>
          <label>Day ends
            <select value={s.dayEndHour} onChange={(e) => set({ dayEndHour: Math.max(Number(e.target.value), s.dayStartHour + 1) })}>
              {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>
          <label>Week starts on
            <select value={s.weekStartsOn} onChange={(e) => set({ weekStartsOn: Number(e.target.value) as 0 | 1 })}>
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </select>
          </label>
          <label>Theme
            <select value={s.theme} onChange={(e) => set({ theme: e.target.value as Theme })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
        </div>
      </section>

      <CoachSection />

      <SlackSection />

      <MondaySection />

      <section className="setting">
        <div>
          <h2 className="panel-title">Your data</h2>
          <p className="muted">Backups and resets.</p>
        </div>
        <div className="setting-body stack">
        <p className="muted">Everything lives in this browser (localStorage), and in the cloud when you are signed in. Export a backup now and then. "Add from file" merges goals, projects, seasons, tasks, habits and routines from a file without changing anything you already have. "Replace everything from a backup" deletes what you have first.</p>
        <div className="row gap">
          <button type="button" className="btn" onClick={exportData}>Export JSON</button>
          <button type="button" className="btn" onClick={() => mergeRef.current?.click()}>Add from file…</button>
          <input
            ref={mergeRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const incoming = normalizeState(JSON.parse(await file.text()));
                const before = state.tasks.length + state.goals.length + state.projects.length + state.seasons.length + state.habits.length;
                dispatch({ type: 'MERGE_STATE', state: incoming });
                const total = incoming.tasks.length + incoming.goals.length + incoming.projects.length + incoming.seasons.length + incoming.habits.length;
                setMsg(`Added new items from the file (up to ${total}); nothing you already had was changed (${before} kept).`);
              } catch {
                setMsg('That file is not a valid ProFocus file.');
              }
            }}
          />
          <span className="spacer" />
          <button type="button" className="btn danger" onClick={() => fileRef.current?.click()}>Replace everything from a backup…</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                const next = normalizeState(JSON.parse(await file.text()));
                const ok = window.confirm(
                  `This DELETES your current ${state.tasks.length} tasks, ${state.blocks.length} blocks and ${state.routines.length} routines, and puts the backup's ${next.tasks.length} tasks in their place.\n\nTo add items without deleting anything, cancel and use "Add from file" instead.`,
                );
                if (!ok) return;
                replaceAll(next, 'Before replacing from a backup');
                setMsg('Backup loaded. Your previous data is kept under "Restore a previous copy".');
              } catch {
                setMsg('That file is not a valid ProFocus backup.');
              }
            }}
          />
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (window.confirm('Delete all tasks, blocks, habits, routines and history? A copy is kept under "Restore a previous copy".')) {
                replaceAll({ ...emptyState(), settings: state.settings }, 'Before reset');
                setMsg('All data cleared.');
              }
            }}
          >Reset everything</button>
        </div>
        {msg && <p role="status" className="muted">{msg}</p>}
        {snapshots.length > 0 && (
          <div className="stack">
            <h3 className="panel-title">Restore a previous copy</h3>
            <p className="hint">Saved automatically on this device just before your data was replaced. The newest three are kept.</p>
            <ul className="stack">
              {snapshots.map((snap) => (
                <li key={snap.at} className="row gap">
                  <span className="num">{new Date(snap.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="muted">{snap.reason} · {snap.counts.tasks} tasks · {snap.counts.blocks} blocks · {snap.counts.routines} routines</span>
                  <span className="spacer" />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      if (!window.confirm(`Replace what you have now with this copy (${snap.counts.tasks} tasks)? Your current data is saved as a copy first.`)) return;
                      replaceAll(snap.state, 'Before restoring a copy');
                      setMsg('Copy restored.');
                    }}
                  >Restore</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        </div>
      </section>

      <section className="setting">
        <div>
          <h2 className="panel-title">Shortcuts</h2>
          <p className="muted">Keys that work anywhere outside a text field.</p>
        </div>
        <div className="setting-body stack">
        <dl className="shortcuts">
          <dt><kbd>⌘</kbd>/<kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>Search, jump to a view, add a task or start focus</dd>
          <dt><kbd>N</kbd></dt><dd>Quick-add a task</dd>
          <dt><kbd>1</kbd>–<kbd>8</kbd></dt><dd>Switch view: Today, Week, Tasks, Goals, Seasons, Habits, Review, Settings</dd>
          <dt><kbd>Space</kbd></dt><dd>Start / pause the focus timer</dd>
        </dl>
        <h3 className="card-title">Quick-add syntax</h3>
        <dl className="shortcuts">
          <dt><code>#writing</code></dt><dd>Project (created if new)</dd>
          <dt><code>today</code> <code>tmr</code> <code>fri</code> <code>2026-12-01</code> <code>someday</code></dt><dd>Date</dd>
          <dt><code>45m</code> <code>1h30m</code></dt><dd>Estimate</dd>
          <dt><code>@9am</code> <code>@14:30</code></dt><dd>Time-block it at that time</dd>
          <dt><code>!high</code> <code>!med</code> <code>!low</code></dt><dd>Priority</dd>
        </dl>
        </div>
      </section>
    </div>
  );
}
