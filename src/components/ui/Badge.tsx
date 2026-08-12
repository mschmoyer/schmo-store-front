import * as React from 'react';
import { cn } from '@/lib/design/cn';
import styles from './Badge.module.css';

export type BadgeTone = 'neutral' | 'ember' | 'mint' | 'amber' | 'rose';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic colour. `mint` is reserved for money/success (§2). @default 'neutral' */
  tone?: BadgeTone;
  /** @default 'md' */
  size?: BadgeSize;
  /**
   * Leading status dot. Gives colour-blind users a second cue and, with
   * `pulse`, marks a live/in-flight state (§7).
   */
  dot?: boolean;
  /** Animates the dot. Requires `dot`. */
  pulse?: boolean;
  /** Filled treatment for badges that sit on imagery or coloured chrome. */
  solid?: boolean;
  /** Square corners instead of a pill — for SKU-adjacent metadata. */
  square?: boolean;
  /** Leading icon. Sized to `1em`. */
  icon?: React.ReactNode;
}

/**
 * A compact status pill.
 *
 * @param props - {@link BadgeProps}
 * @param ref - Forwarded to the wrapping `<span>`.
 * @returns An inline status label.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    tone = 'neutral',
    size = 'md',
    dot = false,
    pulse = false,
    solid = false,
    square = false,
    icon,
    className,
    children,
    ...rest
  },
  ref
) {
  return (
    <span
      ref={ref}
      className={cn(
        styles.root,
        styles[tone],
        styles[size],
        solid && styles.solid,
        square && styles.square,
        pulse && dot && styles.pulse,
        className
      )}
      data-tone={tone}
      {...rest}
    >
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
});

export default Badge;
