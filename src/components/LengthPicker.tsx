import { useEffect, useRef } from 'react';
import type { Settings } from '../lib/types';
import { useStore } from '../state/store';
import { useTimer, type TimerMode } from '../state/timer';

const FIELD = { focus: 'focusMin', short: 'shortBreakMin', long: 'longBreakMin' } as const satisfies Record<TimerMode, keyof Settings>;
const CHOICES: Record<TimerMode, number[]> = {
  focus: [15, 20, 25, 30, 45, 50, 60, 90],
  short: [5, 10, 15],
  long: [15, 20, 30],
};
const LABELS: Record<TimerMode, string> = { focus: 'Focus length', short: 'Short break length', long: 'Long break length' };

/** The offered lengths, plus the current one when it is not a preset, so the select always shows the truth. */
export function lengthChoices(mode: TimerMode, current: number): number[] {
  const list = CHOICES[mode];
  return list.includes(current) ? list : [...list, current].sort((a, b) => a - b);
}

/** Native select for the current interval's length. Hidden while the timer runs; `focusOnly` hides it in break modes. */
export function LengthPicker({ focusOnly = false }: { focusOnly?: boolean }) {
  const timer = useTimer();
  const { state, dispatch } = useStore();
  const { mode } = timer;
  const field = FIELD[mode];
  const current = state.settings[field];
  // A paused timer keeps its old length until reset; wait for the new setting to land, then reset.
  const resetAfter = useRef<number | undefined>();
  const { reset } = timer;
  useEffect(() => {
    if (resetAfter.current === current) {
      resetAfter.current = undefined;
      reset();
    }
  }, [current, reset]);

  if (timer.running || (focusOnly && mode !== 'focus')) return null;
  const onChange = (value: number) => {
    if (value === current) return;
    if (timer.remainingSec < timer.plannedMin * 60) resetAfter.current = value;
    dispatch({ type: 'SET_SETTINGS', patch: { [field]: value } });
  };

  return (
    <select className="length-pick" aria-label={LABELS[mode]} value={current} onChange={(e) => onChange(Number(e.target.value))}>
      {lengthChoices(mode, current).map((m) => <option key={m} value={m}>{m} min</option>)}
    </select>
  );
}
