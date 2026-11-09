import { SOS_STEPS, sosNext, sosStart, sosTick } from './sos';

describe('SOS steps', () => {
  it('add up to twenty minutes', () => {
    expect(SOS_STEPS.reduce((n, s) => n + s.minutes, 0)).toBe(20);
  });

  it('count down and move on at zero', () => {
    let run = { ...sosStart(), running: true };
    expect(run.left).toBe(120);
    for (let i = 0; i < 119; i++) run = sosTick(run);
    expect(run).toMatchObject({ step: 0, left: 1 });
    run = sosTick(run);
    expect(run).toMatchObject({ step: 1, left: 600, running: true });
  });

  it('does not tick while paused, and stops when finished', () => {
    const paused = sosStart();
    expect(sosTick(paused)).toBe(paused);
    let run = { ...sosStart(), running: true };
    for (let i = 0; i < SOS_STEPS.length; i++) run = sosNext(run);
    expect(run).toEqual({ step: SOS_STEPS.length, left: 0, running: false });
  });
});
