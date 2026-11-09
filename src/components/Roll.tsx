import type { CSSProperties } from 'react';

const DIGITS = Array.from({ length: 10 }, (_, n) => n);

/**
 * A figure whose digits roll to a new value when `value` changes. Each digit is a strip 0-9 shifted by CSS,
 * so the first paint is already at its value (no roll) and a change is a transform transition.
 * The real text stays in a screen-reader-only span.
 */
export function Roll({ value }: { value: string }) {
  return (
    <span className="roll">
      <span className="sr-only">{value}</span>
      <span className="roll-digits" aria-hidden>
        {[...value].map((ch, i) =>
          /\d/.test(ch) ? (
            <span key={i} className="roll-col">
              <span className="roll-size">{ch}</span>
              <span className="roll-strip" style={{ '--d': ch } as CSSProperties}>
                {DIGITS.map((n) => <span key={n} data-n={n} />)}
              </span>
            </span>
          ) : (
            <span key={i} className="roll-lit">{ch}</span>
          ),
        )}
      </span>
    </span>
  );
}
