'use client';

import * as React from 'react';

import styles from './Sections.module.css';

export interface CountdownClockProps {
  /** Epoch milliseconds for the deadline. */
  endsAt: number;
  /** Remove the whole section once the deadline passes. */
  hideWhenExpired: boolean;
  children?: React.ReactNode;
}

interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

/**
 * Split a duration into display units.
 * @param ms - Milliseconds remaining
 * @returns The unit breakdown, and whether the deadline has passed
 */
function split(ms: number): Remaining {
  const clamped = Math.max(ms, 0);
  const totalSeconds = Math.floor(clamped / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: clamped === 0,
  };
}

/**
 * A live countdown.
 *
 * The first render deliberately shows nothing but a placeholder: the server has
 * no idea what time it is in the visitor's browser, so rendering a real figure
 * during SSR guarantees a hydration mismatch and a visible flicker. The clock
 * starts on mount instead, which is one frame later and always correct.
 *
 * The value is also exposed as a single `aria-live="off"` summary rather than
 * four separately-announced numbers, because a screen reader reading a ticking
 * seconds counter is unusable.
 *
 * @param props - {@link CountdownClockProps}
 * @returns The clock, or null once expired if the merchant asked for that
 */
export function CountdownClock({ endsAt, hideWhenExpired, children }: CountdownClockProps) {
  const [remaining, setRemaining] = React.useState<Remaining | null>(null);

  React.useEffect(() => {
    const tick = (): void => setRemaining(split(endsAt - Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (remaining?.expired && hideWhenExpired) return null;

  const units: Array<[string, number | null]> = [
    ['Days', remaining?.days ?? null],
    ['Hours', remaining?.hours ?? null],
    ['Minutes', remaining?.minutes ?? null],
    ['Seconds', remaining?.seconds ?? null],
  ];

  return (
    <>
      <div className={styles.clock} role="timer" aria-live="off">
        {units.map(([label, value]) => (
          <div key={label} className={styles.clockUnit}>
            <span className={styles.clockValue}>
              {value === null ? '--' : String(value).padStart(2, '0')}
            </span>
            <span className={styles.clockLabel}>{label}</span>
          </div>
        ))}
      </div>
      {children}
    </>
  );
}
