'use client';

import * as React from 'react';
import { cn } from '@/lib/design/cn';
import { FieldShell, describedBy, fieldStyles as styles, type FieldOwnProps } from './Field';

export interface TextareaProps
  extends FieldOwnProps,
    Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  /** Class applied to the `<textarea>` element itself. */
  className?: string;
}

/**
 * Multi-line text field. Shares the Input's shell so labels, hints and errors
 * line up across a form.
 *
 * @param props - {@link TextareaProps}
 * @param ref - Forwarded to the underlying `<textarea>`.
 * @returns A labelled multi-line input.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    hint,
    error,
    required,
    optionalLabel,
    fullWidth = true,
    wrapperClassName,
    className,
    id,
    disabled,
    rows = 4,
    ...rest
  },
  ref
) {
  const reactId = React.useId();
  const controlId = id ?? `textarea-${reactId}`;
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
          styles.textareaControl,
          error && styles.invalid,
          disabled && styles.disabled
        )}
      >
        <textarea
          ref={ref}
          id={controlId}
          rows={rows}
          className={cn(styles.input, styles.textarea, className)}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy({ hint, error, hintId, errorId })}
          {...rest}
        />
      </div>
    </FieldShell>
  );
});

export default Textarea;
