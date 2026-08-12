import * as React from 'react';
import { Eyebrow } from '@/components/ui';
import styles from './SectionIntro.module.css';

export interface SectionIntroProps {
  /** Uppercase section label. Omit for sections the deck gives no eyebrow. */
  eyebrow?: string;
  /** The section heading. */
  heading: React.ReactNode;
  /** One lead line under the heading. */
  subhead?: React.ReactNode;
  /** Heading element. Use `h1` only on the page's single hero. @default 'h2' */
  as?: 'h1' | 'h2';
  /** Centres the block and caps its measure. */
  centered?: boolean;
  /** Anchor id applied to the heading, for in-page links. */
  id?: string;
  className?: string;
}

/**
 * The eyebrow / heading / subhead trio, with one vertical rhythm for every
 * section on the site so the page does not drift.
 *
 * There is no `onDark` variant any more. The one dark section on the site
 * re-points `--text-primary` and `--text-secondary` on its own container
 * (see `Section.module.css`), so this component reads the right colours there
 * without knowing it is on a dark ground — which is the only way to keep a
 * single source of truth for "what colour is a heading".
 *
 * @param props - {@link SectionIntroProps}
 * @returns A section introduction block.
 */
export function SectionIntro({
  eyebrow,
  heading,
  subhead,
  as: Heading = 'h2',
  centered = false,
  id,
  className,
}: SectionIntroProps): React.JSX.Element {
  return (
    <div
      className={[styles.root, centered ? styles.centered : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {eyebrow ? <Eyebrow rule>{eyebrow}</Eyebrow> : null}
      <Heading id={id} className={Heading === 'h1' ? styles.h1 : styles.h2}>
        {heading}
      </Heading>
      {subhead ? <p className={styles.subhead}>{subhead}</p> : null}
    </div>
  );
}

export default SectionIntro;
