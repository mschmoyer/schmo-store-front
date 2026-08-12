'use client';

import * as React from 'react';
import NextLink from 'next/link';
import { cn } from '@/lib/design/cn';
import { Spinner } from './Spinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const SPINNER_SIZE: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 17 };

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'prefix'> {
  /** Visual weight. Never place two `primary` buttons in one view (§5). @default 'primary' */
  variant?: ButtonVariant;
  /** 32 / 40 / 48px heights. @default 'md' */
  size?: ButtonSize;
  /** Swaps the label for a spinner without changing the button's width. */
  loading?: boolean;
  /** Node rendered before the label — an icon, not an emoji (§1). */
  leftIcon?: React.ReactNode;
  /** Node rendered after the label. */
  rightIcon?: React.ReactNode;
  /** Stretches the button to its container. */
  fullWidth?: boolean;
  /**
   * Renders a square control sized to the height. Requires `aria-label` (§7).
   */
  iconOnly?: boolean;
  /**
   * Render as a different element — `'a'`, `next/link`, or any component that
   * forwards `className` and `ref`. Lets a link carry button styling without
   * nesting an `<a>` inside a `<button>`.
   *
   * Server Components must not pass a component here: a function cannot cross
   * the Server/Client boundary (React throws "Functions cannot be passed
   * directly to Client Components"). Pass `href` on its own instead — the
   * button then renders `next/link` itself, from inside this client module.
   * @default 'button', or `next/link` when `href` is set
   */
  as?: React.ElementType;
  /** Renders the button as a `next/link` unless `as` overrides the element. */
  href?: string;
}

/**
 * The primary action primitive.
 *
 * @param props - {@link ButtonProps}, plus any native `<button>` attribute (or
 * the props of whatever `as` resolves to).
 * @param ref - Forwarded to the rendered element.
 * @returns A styled, keyboard-accessible action control.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    iconOnly = false,
    as,
    href,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref
) {
  const Component: React.ElementType = as ?? (href ? NextLink : 'button');
  const isNativeButton = Component === 'button';
  const isInert = Boolean(disabled) || loading;

  return (
    <Component
      ref={ref}
      href={href}
      className={cn(
        styles.root,
        styles[variant],
        styles[size],
        iconOnly && styles.iconOnly,
        fullWidth && styles.fullWidth,
        loading && styles.loading,
        className
      )}
      // A native button uses `disabled`; anything else keeps focus but is inert.
      disabled={isNativeButton ? isInert : undefined}
      aria-disabled={!isNativeButton && isInert ? true : undefined}
      aria-busy={loading || undefined}
      type={isNativeButton ? (type ?? 'button') : type}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
      <span className={styles.label}>
        {leftIcon ? (
          <span className={styles.icon} aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}
        {children}
        {rightIcon ? (
          <span className={styles.icon} aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </span>

      {loading ? (
        <span className={styles.spinnerSlot}>
          <Spinner size={SPINNER_SIZE[size]} label={null} />
        </span>
      ) : null}
    </Component>
  );
});

export default Button;
