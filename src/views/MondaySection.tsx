import { useState } from 'react';
import { DEFAULT_BOARD_ID, isBoardId, loadMondayConfig, saveMondayConfig, type MondayConfig } from '../lib/monday';
import { useMondayActions, useMondayStatus } from '../state/mondaySync';
import { useStore } from '../state/store';

const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Settings form for the monday.com import. The token is never rendered back except in the masked input. */
export function MondaySection() {
  const { state } = useStore();
  const [saved, setSaved] = useState(loadMondayConfig);
  const [token, setToken] = useState(saved?.token ?? '');
  const [boardId, setBoardId] = useState(saved?.boardId ?? DEFAULT_BOARD_ID);
  const [mineOnly, setMineOnly] = useState(saved?.mineOnly ?? true);
  const [projectId, setProjectId] = useState(saved?.projectId ?? '');
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = useMondayStatus();
  const { syncNow, importExisting } = useMondayActions();
  const projects = state.projects.filter((p) => !p.archived);

  const say = (message: string, isError: boolean) => { setNote(message); setFailed(isError); };
  const save = (): MondayConfig | null => {
    if (!token.trim()) { say('Paste a token first.', true); return null; }
    if (!isBoardId(boardId.trim())) { say('The Board ID is the number in the board URL.', true); return null; }
    const cfg: MondayConfig = { token: token.trim(), boardId: boardId.trim(), mineOnly, projectId: projectId || undefined };
    saveMondayConfig(cfg);
    setSaved(cfg);
    say('Saved in this browser.', false);
    return cfg;
  };
  const sync = async () => {
    if (!save()) return;
    setBusy(true);
    await syncNow();
    setBusy(false);
  };
  const disconnect = () => {
    saveMondayConfig(null);
    setSaved(null);
    setToken('');
    say('Disconnected. The token is removed from this browser.', false);
  };

  const line = status.error
    ? status.error
    : status.lastSyncAt
      ? `Last checked ${clock(status.lastSyncAt)} · ${status.lastNew} new`
      : saved ? 'Not checked yet.' : '';

  return (
    <section className="setting">
      <div>
        <h2 className="panel-title">monday.com</h2>
        <p className="muted">Optional. New items on your monday board show up in Tasks.</p>
      </div>
      <div className="setting-body stack">
        <form className="stack" autoComplete="off" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label>Personal API token
            <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
            <span className="hint">monday → your avatar → Developers → My access tokens → Show/Copy. Stays in this browser.</span>
          </label>
          <label>Board ID
            <input inputMode="numeric" value={boardId} onChange={(e) => setBoardId(e.target.value)} />
            <span className="hint">From the board URL.</span>
          </label>
          <label className="row gap check-label"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only items where I&rsquo;m an Owner</label>
          <label>Project for new tasks
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="row gap">
            <button type="submit" className="btn">Save</button>
            <button type="button" className="link-btn" disabled={busy} onClick={() => void sync()}>{busy ? 'Syncing…' : 'Sync now'}</button>
            <button type="button" className="link-btn" onClick={disconnect}>Disconnect</button>
          </div>
          {status.importable.length > 0 && (
            <button type="button" className="link-btn" onClick={importExisting}>Import {status.importable.length} open {status.importable.length === 1 ? 'item' : 'items'} already there</button>
          )}
          {note && <p role="status" className={failed ? 'sync-error' : 'muted'}>{note}</p>}
          {line && <p role={status.error ? 'alert' : 'status'} className={status.error ? 'sync-error' : 'muted'}>{line}</p>}
        </form>
      </div>
    </section>
  );
}
