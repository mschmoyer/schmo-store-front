import * as React from 'react';
import { cn } from '@/lib/design/cn';
import styles from './Field.module.css';

/** Props every labelled control accepts. Kept in one place so the label, hint
 *  and error slots behave identically across Input, Textarea, Select and friends. */
export interface FieldOwnProps {
  /** Visible label. Rendered as a real `<label for>` (§7). */
  label?: React.ReactNode;
  /** Helper copy under the control. Hidden while an `error` is showing. */
  hint?: React.ReactNode;
  /** Error message. Its presence flips the control into the invalid state. */
  error?: React.ReactNode;
  /** Marks the field required and adds the asterisk affordance. */
  required?: boolean;
  /** Renders an "Optional" tag opposite the label. Ignored when `required`. */
  optionalLabel?: boolean;
  /** Stretches the field to its container. @default true */
  fullWidth?: boolean;
  /** Class applied to the outer wrapper (the control keeps `className`). */
  wrapperClassName?: string;
}

interface FieldShellProps extends FieldOwnProps {
  /** `id` of the control the label points at. */
  controlId: string;
  /** `id` of the hint element, for `aria-describedby`. */
  hintId: string;
  /** `id` of the error element, for `aria-describedby`. */
  errorId: string;
  children: React.ReactNode;
}

/** Inline warning triangle used by the error message row. */
function ErrorIcon(): React.ReactElement {
  return (
    <svg className={styles.errorIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.75 15 14.25H1L8 1.75Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 6.25v3.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11.6" r="0.85" fill="currentColor" />
    </svg>
  );
}

/**
 * Layout shell shared by every labelled form control: label row on top, the
 * control, then exactly one message row (error wins over hint).
 *
 * @param props - {@link FieldShellProps}
 * @returns The wrapped control with its label and message slots.
 */
export function FieldShell({
  label,
  hint,
  error,
  required,
  optionalLabel,
  fullWidth = true,
  wrapperClassName,
  controlId,
  hintId,
  errorId,
  children,
}: FieldShellProps): React.ReactElement {
  return (
    <div className={cn(styles.field, fullWidth && styles.fullWidth, wrapperClassName)}>
      {label ? (
        <div className={styles.labelRow}>
          <label className={styles.label} htmlFor={controlId}>
            {label}
            {required ? (
              <span className={styles.required} aria-hidden="true">
                *
              </span>
            ) : null}
          </label>
          {!required && optionalLabel ? <span className={styles.optional}>Optional</span> : null}
        </div>
      ) : null}

      {children}

      {error ? (
        <p className={cn(styles.message, styles.error)} id={errorId}>
          <ErrorIcon />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className={cn(styles.message, styles.hint)} id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Builds the `aria-describedby` value for a control from whichever message
 * slots are actually rendered.
 *
 * @param options - Message presence flags and the ids to reference.
 * @returns A space-separated id list, or `undefined` when there is nothing to describe.
 */
export function describedBy(options: {
  hint?: React.ReactNode;
  error?: React.ReactNode;
  hintId: string;
  errorId: string;
  extra?: string;
}): string | undefined {
  const ids = [
    options.error ? options.errorId : options.hint ? options.hintId : null,
    options.extra ?? null,
  ].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

export { styles as fieldStyles };
