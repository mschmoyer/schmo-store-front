import * as React from 'react';
import styles from './Rail.module.css';

export interface RailProps {
  /** The peer items. Each child is wrapped in its own snap target. */
  children: React.ReactNode;
  /**
   * Accessible name for the scroll container. Required: below the rail
   * breakpoint this is a focusable scrollable region, and an unnamed one is a
   * bare tab stop to a screen-reader user.
   */
  label: string;
  /** Columns once the rail becomes a grid. @default 3 */
  columns?: number;
  /** Narrower tracks, for peers whose content is a line or two. */
  tight?: boolean;
  /**
   * Separates items with the site's hairline rule instead of card borders.
   * Use where the peers are prose rather than objects.
   */
  divided?: boolean;
  className?: string;
}

/**
 * The marketing site's only reflow primitive for a group of peer cards.
 *
 * Three equal cards are a row on a desktop. Stacked on a phone they are three
 * full-height screens, and the homepage carried three such groups — the setup
 * steps, the capability entries and the proof cards — which between them were
 * roughly 2,000px of the mobile scroll. Below 760px this renders them as one
 * horizontal snap-scroller a single card tall; at and above it, the identical
 * markup is the grid it always was.
 *
 * Nothing is hidden in either mode: every card is in the DOM, in order, with no
 * JavaScript involved, so the no-JS render and a crawler both see all of it.
 *
 * @param props - {@link RailProps}
 * @returns A list that is a snap rail on a phone and a grid above it.
 */
export function Rail({
  children,
  label,
  columns = 3,
  tight = false,
  divided = false,
  className,
}: RailProps): React.JSX.Element {
  return (
    <ul
      className={[
        styles.rail,
        tight ? styles.tight : '',
        divided ? styles.divided : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--rail-columns': columns } as React.CSSProperties}
      tabIndex={0}
      role="group"
      aria-label={label}
    >
      {React.Children.map(children, (child, index) => (
        // eslint-disable-next-line react/no-array-index-key
        <li key={index} className={styles.item}>
          {child}
        </li>
      ))}
    </ul>
  );
}

export default Rail;
