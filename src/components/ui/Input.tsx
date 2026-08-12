'use client';

import * as React from 'react';
import { cn } from '@/lib/design/cn';
import { FieldShell, describedBy, fieldStyles as styles, type FieldOwnProps } from './Field';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps
  extends FieldOwnProps,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'className'> {
  /** Control height: 32 / 40 / 48. @default 'md' */
  size?: InputSize;
  /** Leading adornment — an icon or a unit. Not focusable. */
  leftSection?: React.ReactNode;
  /** Trailing adornment — a unit, a clear button, a character count. */
  rightSection?: React.ReactNode;
  /** Renders the value in the mono face. Use for SKUs, order IDs, API keys (§3). */
  mono?: boolean;
  /** Class applied to the `<input>` element itself. */
  className?: string;
}

/**
 * Single-line text field with label, hint and error slots.
 *
 * @param props - {@link InputProps}
 * @param ref - Forwarded to the underlying `<input>`.
 * @returns A labelled text input.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    required,
    optionalLabel,
    fullWidth = true,
    wrapperClassName,
    size = 'md',
    leftSection,
    rightSection,
    mono = false,
    className,
    id,
    disabled,
    ...rest
  },
  ref
) {
  const reactId = React.useId();
  const controlId = id ?? `input-${reactId}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      required={required}
      optionalLabel={optionalLabel}
      fullWidth={fullWidth}
      wrapperClassName={wrapperClassName}
      controlId={controlId}
      hintId={hintId}
      errorId={errorId}
    >
      <div
        className={cn(
          styles.control,
          size === 'sm' && styles.sizeSm,
          size === 'lg' && styles.sizeLg,
          mono && styles.mono,
          error && styles.invalid,
          disabled && styles.disabled
        )}
      >
        {leftSection ? (
          <span className={styles.affix} aria-hidden="true">
            {leftSection}
          </span>
        ) : null}

        <input
          ref={ref}
          id={controlId}
          className={cn(styles.input, className)}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy({ hint, error, hintId, errorId })}
          {...rest}
        />

        {rightSection ? <span className={styles.affix}>{rightSection}</span> : null}
      </div>
    </FieldShell>
  );
});

export default Input;
