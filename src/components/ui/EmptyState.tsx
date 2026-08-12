import * as React from 'react';
import { cn } from '@/lib/design/cn';
import styles from './EmptyState.module.css';

/**
 * The default mark: an open box with a dashed lid. Deliberately geometric so it
 * sits with the rest of the icon set instead of reading as clip art.
 */
function DefaultMark(): React.ReactElement {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M4 12.5 16 7l12 5.5v11L16 29 4 23.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 12.5 16 18l12-5.5M16 18v11" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M10 4.5 16 2l6 2.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="2.4 2.4"
      />
    </svg>
  );
}

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** What is missing. One short noun phrase — "No products yet". */
  title: React.ReactNode;
  /** One sentence on what belongs here and how it gets here. */
  description?: React.ReactNode;
  /** Custom illustration. Falls back to a generic mark sized to 34px. */
  illustration?: React.ReactNode;
  /** The single primary action. */
  action?: React.ReactNode;
  /** An optional escape hatch next to the primary action. */
  secondaryAction?: React.ReactNode;
  /** Draws a dashed well around the state. @default true */
  bordered?: boolean;
  /** Tighter padding, for empty states inside a card or panel. */
  compact?: boolean;
  /** Left-aligns instead of centring. Useful in narrow side panels. */
  align?: 'center' | 'left';
  /**
   * Element for the title. It is styled as a heading and reads as one, so it
   * should be one — a screen-reader user navigating by headings otherwise
   * skips every empty state in the product. Pass `'p'` only when the state
   * sits under a heading that already names the region. @default 'h3'
   */
  titleAs?: React.ElementType;
}

/**
 * The empty-state primitive. Never ship a bare "No data" — this component
 * exists so that the illustration/sentence/action triad from §5 is the path of
 * least resistance.
 *
 * @param props - {@link EmptyStateProps}
 * @param ref - Forwarded to the wrapper.
 * @returns A composed empty state.
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  {
    title,
    description,
    illustration,
    action,
    secondaryAction,
    bordered = true,
    compact = false,
    align = 'center',
    titleAs,
    className,
    ...rest
  },
  ref
) {
  const TitleTag: React.ElementType = titleAs ?? 'h3';

  return (
    <div
      ref={ref}
      className={cn(
        styles.root,
        bordered && styles.bordered,
        compact && styles.compact,
        align === 'left' && styles.left,
        className
      )}
      {...rest}
    >
      <div className={styles.figure}>{illustration ?? <DefaultMark />}</div>

      <TitleTag className={styles.title}>{title}</TitleTag>
      {description ? <p className={styles.description}>{description}</p> : null}

      {action || secondaryAction ? (
        <div className={styles.actions}>
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
});

export default EmptyState;
