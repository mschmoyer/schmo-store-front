import * as React from 'react';
import { Eyebrow } from '@/components/ui';
import { Reveal } from './Reveal';
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
  /** Inverts colours for `--ink-950` grounds. */
  onDark?: boolean;
  /** Anchor id applied to the heading, for in-page links. */
  id?: string;
  className?: string;
}

/**
 * The eyebrow / heading / subhead trio, with one vertical rhythm for every
 * section on the site so the page does not drift.
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
  onDark = false,
  id,
  className,
}: SectionIntroProps): React.JSX.Element {
  return (
    <Reveal
      className={[
        styles.root,
        centered ? styles.centered : '',
        onDark ? styles.onDark : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {eyebrow ? (
        <Eyebrow rule className={styles.eyebrow}>
          {eyebrow}
        </Eyebrow>
      ) : null}
      <Heading id={id} className={Heading === 'h1' ? styles.h1 : styles.h2}>
        {heading}
      </Heading>
      {subhead ? <p className={styles.subhead}>{subhead}</p> : null}
    </Reveal>
  );
}

export default SectionIntro;
