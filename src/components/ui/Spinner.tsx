import * as React from 'react';
import { cn } from '@/lib/design/cn';
import styles from './Spinner.module.css';

/** Pixel diameters. `inherit` sizes the spinner from the parent's font-size. */
const SIZE_MAP = { xs: 12, sm: 16, md: 20, lg: 28, xl: 40 } as const;

export type SpinnerSize = keyof typeof SIZE_MAP;

export interface SpinnerProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Diameter preset, or a raw pixel number. @default 'md' */
  size?: SpinnerSize | number;
  /** Stroke thickness in pixels. Defaults to a proportional value. */
  thickness?: number;
  /**
   * Announced to screen readers. Pass `null` when the spinner sits inside a
   * control that already describes the busy state (e.g. a loading Button).
   * @default 'Loading'
   */
  label?: string | null;
}

/**
 * A two-arc indeterminate spinner. The faint track keeps the shape readable at
 * small sizes instead of leaving a lone hairline chasing itself.
 *
 * @param props - {@link SpinnerProps}
 * @returns A decorative or labelled busy indicator inheriting `currentColor`.
 */
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = 'md', thickness, label = 'Loading', className, style, ...rest },
  ref
) {
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const stroke = thickness ?? Math.max(1.5, Math.round(px * 0.12 * 10) / 10);
  const radius = (24 - stroke) / 2;

  return (
    <span
      ref={ref}
      className={cn(styles.root, className)}
      style={{ width: px, height: px, ...style }}
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      {...rest}
    >
      <svg className={styles.svg} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle
          className={styles.track}
          cx="12"
          cy="12"
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
        />
        <circle
          className={styles.head}
          cx="12"
          cy="12"
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </svg>
      {label ? <span className="sr-only-focusable">{label}</span> : null}
    </span>
  );
});

export default Spinner;
