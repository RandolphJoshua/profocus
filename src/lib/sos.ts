export interface SosStep {
  title: string;
  minutes: number;
}

/** The 20-minute reset, in order. */
export const SOS_STEPS: readonly SosStep[] = [
  { title: 'Phone in another room. Sit in silence.', minutes: 2 },
  { title: 'Clean the kitchen or make the bed, slowly.', minutes: 10 },
  { title: 'Warm shower with the lights dimmed or off.', minutes: 6 },
  { title: 'Turn it to lukewarm, then cold for 30–60 seconds.', minutes: 2 },
];

export const SOS_CLOSING = 'Now pick one task and start it.';

export interface SosRun {
  /** Index of the current step; equals the step count when finished. */
  step: number;
  /** Seconds left in the current step. */
  left: number;
  running: boolean;
}

export const sosStart = (steps: readonly SosStep[] = SOS_STEPS): SosRun => ({ step: 0, left: (steps[0]?.minutes ?? 0) * 60, running: false });

/** Move to the next step (or to finished). A finished run stops. */
export function sosNext(run: SosRun, steps: readonly SosStep[] = SOS_STEPS): SosRun {
  const step = Math.min(run.step + 1, steps.length);
  const next = steps[step];
  return next ? { ...run, step, left: next.minutes * 60 } : { step, left: 0, running: false };
}

/** One second of a running countdown. */
export function sosTick(run: SosRun, steps: readonly SosStep[] = SOS_STEPS): SosRun {
  if (!run.running || run.step >= steps.length) return run;
  return run.left <= 1 ? sosNext(run, steps) : { ...run, left: run.left - 1 };
}
