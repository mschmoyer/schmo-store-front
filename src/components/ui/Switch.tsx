'use client';

import * as React from 'react';
import { cn } from '@/lib/design/cn';
import { fieldStyles as styles } from './Field';

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'className'> {
  /** Visible label. Rendered inside a real `<label>` wrapping the input (§7). */
  label?: React.ReactNode;
  /** Secondary line under the label — say what turning this on actually does. */
  hint?: React.ReactNode;
  /** Track size. @default 'md' */
  size?: 'sm' | 'md';
  /** Class applied to the outer `<label>`. */
  className?: string;
}

/**
 * An immediate on/off toggle over a native checkbox. Use a Switch when the
 * change applies straight away; use a Checkbox when it applies on submit.
 *
 * @param props - {@link SwitchProps}
 * @param ref - Forwarded to the underlying `<input>`.
 * @returns A labelled switch row.
 */
export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, hint, size = 'md', className, id, disabled, ...rest },
  ref
) {
  const reactId = React.useId();
  const controlId = id ?? `switch-${reactId}`;
  const hintId = `${controlId}-hint`;

  return (
    <label className={cn(styles.choice, disabled && styles.disabled, className)} htmlFor={controlId}>
      <span className={cn(styles.track, size === 'sm' && styles.trackSm)}>
        <input
          ref={ref}
          id={controlId}
          type="checkbox"
          role="switch"
          className={styles.nativeControl}
          disabled={disabled}
          aria-describedby={hint ? hintId : undefined}
          {...rest}
        />
        <span className={styles.thumb} aria-hidden="true" />
      </span>

      {label || hint ? (
        <span className={styles.choiceText}>
          {label ? <span className={styles.choiceLabel}>{label}</span> : null}
          {hint ? (
            <span className={styles.choiceHint} id={hintId}>
              {hint}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
});

export default Switch;
