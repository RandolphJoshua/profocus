import { useState } from 'react';
import { DEFAULT_SLACK, loadSlackConfig, saveSlackConfig, testSlack, validateToken, type SlackConfig } from '../lib/slack';
import { useSlackError } from '../state/slackFocus';

/** Settings form for the Slack status while focusing. The token is never rendered back except in the masked input. */
export function SlackSection() {
  const [saved] = useState(loadSlackConfig);
  const [token, setToken] = useState(saved?.token ?? '');
  const [text, setText] = useState(saved?.text ?? DEFAULT_SLACK.text);
  const [emoji, setEmoji] = useState(saved?.emoji ?? DEFAULT_SLACK.emoji);
  const [withTask, setWithTask] = useState(saved?.withTask ?? DEFAULT_SLACK.withTask);
  const [dnd, setDnd] = useState(saved?.dnd ?? DEFAULT_SLACK.dnd);
  const [note, setNote] = useState('');
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const syncError = useSlackError();

  const say = (message: string, isError: boolean) => { setNote(message); setFailed(isError); };
  const draft = (): SlackConfig => ({ token: token.trim(), text: text.trim() || DEFAULT_SLACK.text, emoji: emoji.trim() || DEFAULT_SLACK.emoji, withTask, dnd });
  const save = (): SlackConfig | null => {
    const problem = validateToken(token);
    if (problem) { say(problem, true); return null; }
    const cfg = draft();
    saveSlackConfig(cfg);
    say('Saved in this browser.', false);
    return cfg;
  };
  const test = async () => {
    const cfg = save();
    if (!cfg) return;
    setBusy(true);
    try {
      say(await testSlack(cfg.token), false);
    } catch (e) {
      say(e instanceof Error ? e.message : "Couldn't reach Slack.", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="setting">
      <div>
        <h2 className="panel-title">Slack status</h2>
        <p className="muted">Optional. Sets your Slack status while a focus session runs and clears it when you stop.</p>
      </div>
      <div className="setting-body stack">
        <form className="stack" autoComplete="off" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label>User OAuth Token
            <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
          <p className="hint">Stays in this browser. Never synced.</p>
          <label>Status when no task is picked
            <input value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <label>Status emoji
            <input value={emoji} onChange={(e) => setEmoji(e.target.value)} />
            <span className="hint">Slack emoji code, e.g. :headphones:</span>
          </label>
          <label className="row gap check-label"><input type="checkbox" checked={withTask} onChange={(e) => setWithTask(e.target.checked)} /> Use the task name as the status</label>
          <p className="hint">Your whole workspace sees it, e.g. "Finish chapter 3 outline".</p>
          <label className="row gap check-label"><input type="checkbox" checked={dnd} onChange={(e) => setDnd(e.target.checked)} /> Pause notifications while focusing (Do Not Disturb)</label>
          <div className="row gap">
            <button type="submit" className="btn">Save</button>
            <button type="button" className="link-btn" disabled={busy} onClick={() => void test()}>{busy ? 'Testing…' : 'Test'}</button>
            <button
              type="button"
              className="link-btn"
              onClick={() => { saveSlackConfig(null); setToken(''); say('Token removed.', false); }}
            >Remove token</button>
          </div>
          {note && <p role="status" className={failed ? 'sync-error' : 'muted'}>{note}</p>}
          {syncError && <p role="alert" className="sync-error">{syncError}</p>}
        </form>
        <ol className="hint">
          <li>Open <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">api.slack.com/apps</a>, then Create New App, then From scratch, and pick your workspace.</li>
          <li>Under OAuth &amp; Permissions, then <strong>User Token Scopes</strong>, add <code>users.profile:write</code> and <code>dnd:write</code>.</li>
          <li>Install to Workspace, then copy the <strong>User OAuth Token</strong> (<code>xoxp-…</code>).</li>
          <li>Paste it here, Save, Test.</li>
        </ol>
        <p className="hint">Some workspaces need an admin to approve new apps.</p>
      </div>
    </section>
  );
}
