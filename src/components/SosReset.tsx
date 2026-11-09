import { useEffect, useState } from 'react';
import { formatClock } from '../lib/date';
import { SOS_CLOSING, SOS_STEPS, sosNext, sosStart, sosTick } from '../lib/sos';
import { Modal } from './Modal';

const TICK_MS = 1000;

/** A 20-minute step-by-step reset. No animation, so nothing to reduce for prefers-reduced-motion. */
export function SosReset({ onClose, onPickTask }: { onClose: () => void; onPickTask: () => void }) {
  const [run, setRun] = useState(() => sosStart());
  const [started, setStarted] = useState(false);
  const finished = run.step >= SOS_STEPS.length;

  useEffect(() => {
    if (!run.running) return;
    const id = window.setInterval(() => setRun((r) => sosTick(r)), TICK_MS);
    return () => window.clearInterval(id);
  }, [run.running]);

  const toggle = () => {
    setStarted(true);
    setRun((r) => ({ ...r, running: !r.running }));
  };

  return (
    <Modal title="20-minute reset" onClose={onClose}>
      <div className="stack sos">
        {finished ? (
          <p className="sos-closing">{SOS_CLOSING}</p>
        ) : (
          <p className="sos-clock num" role="timer" aria-label="Time left in this step">{formatClock(run.left)}</p>
        )}
        <ol className="sos-steps">
          {SOS_STEPS.map((s, i) => (
            <li key={s.title} className={i === run.step ? 'is-active' : i < run.step ? 'is-done' : ''} aria-current={i === run.step ? 'step' : undefined}>
              <span>{s.title}</span>
              <span className="num sos-min">{s.minutes} min</span>
            </li>
          ))}
        </ol>
        <div className="row gap wrap">
          {finished ? (
            <button type="button" className="btn primary" onClick={onPickTask}>Pick a task</button>
          ) : (
            <>
              <button type="button" className="btn primary" onClick={toggle}>{run.running ? 'Pause' : started ? 'Resume' : 'Start'}</button>
              <button type="button" className="btn" onClick={() => setRun((r) => sosNext(r))}>Skip step</button>
            </>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
