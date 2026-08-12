import * as React from 'react';
import styles from './Section.module.css';

export interface SectionProps {
  children: React.ReactNode;
  /** Anchor id, for in-page links. */
  id?: string;
  /**
   * Draws the 1px `--border` rule on the section's leading edge. This — not a
   * background change — is how one section is separated from the next.
   */
  ruled?: boolean;
  /** Uses the tighter step of the shared spacing scale. */
  tight?: boolean;
  /**
   * Full-bleed ink ground. Permitted ONCE on the marketing site, on pricing.
   * Adding a second one re-creates the banded look this layout removed.
   */
  dark?: boolean;
  /** Extra class on the `<section>`, for grid rules that are genuinely local. */
  className?: string;
  /** Extra class on the inner container. */
  innerClassName?: string;
}

/**
 * The marketing site's only section wrapper.
 *
 * Guarantees the two layout invariants the rebuild is built on: one page
 * ground, and one shared left edge. Sections describe what they contain; they
 * do not get to decide their own background, width or block padding.
 *
 * @param props - {@link SectionProps}
 * @returns A section with the shared geometry applied.
 */
export function Section({
  children,
  id,
  ruled = false,
  tight = false,
  dark = false,
  className,
  innerClassName,
}: SectionProps): React.JSX.Element {
  return (
    <section
      id={id}
      className={[
        styles.root,
        tight ? styles.tight : '',
        ruled ? styles.ruled : '',
        dark ? styles.dark : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={[styles.inner, innerClassName].filter(Boolean).join(' ')}>{children}</div>
    </section>
  );
}

export default Section;
