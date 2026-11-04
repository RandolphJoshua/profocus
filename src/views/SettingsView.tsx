import { useRef, useState } from 'react';
import { todayKey } from '../lib/date';
import { emptyState, normalizeState } from '../lib/storage';
import type { Settings, Theme } from '../lib/types';
import { useAuth } from '../state/auth';
import { useStore } from '../state/store';
import { useSync } from '../state/sync';

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
            <div className="row gap">
              <button type="button" className="link-btn" onClick={() => void signOut()}>Sign out</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function SettingsView() {
  const { state, dispatch } = useStore();
  const s = state.settings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
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

      <section className="setting">
        <div>
          <h2 className="panel-title">Your data</h2>
          <p className="muted">Backups and resets.</p>
        </div>
        <div className="setting-body stack">
        <p className="muted">Everything lives in this browser (localStorage). Export a backup now and then, or to move to another device.</p>
        <div className="row gap">
          <button type="button" className="btn" onClick={exportData}>Export JSON</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import JSON…</button>
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
                if (!window.confirm(`Replace current data with ${next.tasks.length} tasks and ${next.blocks.length} blocks from the backup?`)) return;
                dispatch({ type: 'REPLACE_STATE', state: next });
                setMsg('Backup imported.');
              } catch {
                setMsg('That file is not a valid ProFocus backup.');
              }
            }}
          />
          <span className="spacer" />
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (window.confirm('Delete all tasks, blocks, habits and history? Export a backup first if unsure.')) {
                dispatch({ type: 'REPLACE_STATE', state: { ...emptyState(), settings: state.settings } });
                setMsg('All data cleared.');
              }
            }}
          >Reset everything</button>
        </div>
        {msg && <p role="status" className="muted">{msg}</p>}
        </div>
      </section>

      <section className="setting">
        <div>
          <h2 className="panel-title">Shortcuts</h2>
          <p className="muted">Keys that work anywhere outside a text field.</p>
        </div>
        <div className="setting-body stack">
        <dl className="shortcuts">
          <dt><kbd>N</kbd></dt><dd>Quick-add a task</dd>
          <dt><kbd>1</kbd>–<kbd>7</kbd></dt><dd>Switch view</dd>
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
