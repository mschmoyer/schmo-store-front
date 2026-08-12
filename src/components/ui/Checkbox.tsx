'use client';

import * as React from 'react';
import { cn } from '@/lib/design/cn';
import { fieldStyles as styles } from './Field';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  /** Visible label. Rendered inside a real `<label>` wrapping the input (§7). */
  label?: React.ReactNode;
  /** Secondary line under the label. */
  hint?: React.ReactNode;
  /** Error message shown in place of the hint. */
  error?: React.ReactNode;
  /** Mixed state for "some children selected" headers. */
  indeterminate?: boolean;
  /** Class applied to the outer `<label>`. */
  className?: string;
}

/**
 * Checkbox with a painted box over a real `<input type="checkbox">`, so form
 * submission, `:checked` styling and keyboard behaviour all stay native.
 *
 * @param props - {@link CheckboxProps}
 * @param ref - Forwarded to the underlying `<input>`.
 * @returns A labelled checkbox row.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, error, indeterminate = false, className, id, disabled, ...rest },
  ref
) {
  const reactId = React.useId();
  const controlId = id ?? `checkbox-${reactId}`;
  const messageId = `${controlId}-message`;

  const innerRef = React.useRef<HTMLInputElement | null>(null);
  React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const message = error ?? hint;

  return (
    <label className={cn(styles.choice, disabled && styles.disabled, className)} htmlFor={controlId}>
      <span className={styles.box}>
        <input
          ref={innerRef}
          id={controlId}
          type="checkbox"
          className={styles.nativeControl}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          {...rest}
        />
        <svg className={styles.check} viewBox="0 0 12 12" fill="none" aria-hidden="true">
          {indeterminate ? (
            <path d="M2.5 6h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path
              d="M2 6.2 4.7 9 10 3.2"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </span>

      {label || message ? (
        <span className={styles.choiceText}>
          {label ? <span className={styles.choiceLabel}>{label}</span> : null}
          {message ? (
            <span className={cn(styles.choiceHint, error && styles.error)} id={messageId}>
              {message}
            </span>
          ) : null}
        </span>
      ) : null}
    </label>
  );
});

export default Checkbox;
