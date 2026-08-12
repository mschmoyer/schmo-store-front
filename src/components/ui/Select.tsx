'use client';

import * as React from 'react';
import { cn } from '@/lib/design/cn';
import { FieldShell, describedBy, fieldStyles as styles, type FieldOwnProps } from './Field';

/** A single choice. `options` is the shorthand; pass `children` for groups. */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends FieldOwnProps,
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'className'> {
  /** Control height: 32 / 40 / 48. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Convenience list of options. Ignored when `children` is provided. */
  options?: SelectOption[];
  /** Renders a disabled first option as the empty state of the field. */
  placeholder?: string;
  /** Class applied to the `<select>` element itself. */
  className?: string;
}

/**
 * Native `<select>` in our chrome. We stay native here on purpose: the OS
 * picker is the best mobile experience and it is keyboard-complete for free.
 * Reach for Mantine's `Select` only when you need search or multi-select.
 *
 * @param props - {@link SelectProps}
 * @param ref - Forwarded to the underlying `<select>`.
 * @returns A labelled select control.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    required,
    optionalLabel,
    fullWidth = true,
    wrapperClassName,
    size = 'md',
    options,
    placeholder,
    className,
    id,
    disabled,
    children,
    defaultValue,
    value,
    ...rest
  },
  ref
) {
  const reactId = React.useId();
  const controlId = id ?? `select-${reactId}`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  // Only seed the empty option as the default when the caller has not set one.
  const resolvedDefault =
    value === undefined && defaultValue === undefined && placeholder ? '' : defaultValue;

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
          styles.selectControl,
          size === 'sm' && styles.sizeSm,
          size === 'lg' && styles.sizeLg,
          Boolean(error) && styles.invalid,
          disabled && styles.disabled
        )}
      >
        <select
          ref={ref}
          id={controlId}
          className={cn(styles.input, styles.select, className)}
          disabled={disabled}
          required={required}
          value={value}
          defaultValue={resolvedDefault}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy({ hint, error, hintId, errorId })}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {children ??
            options?.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
        </select>

        <svg className={styles.chevron} viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M4 6.25 8 10l4-3.75"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </FieldShell>
  );
});

export default Select;
