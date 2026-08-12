import * as React from 'react';
import { Eyebrow } from '@/components/ui';
import { Section } from './Section';
import styles from './PageHead.module.css';

export interface PageHeadProps {
  /** Uppercase page label. */
  eyebrow: string;
  /** The page's single `h1`. */
  title: React.ReactNode;
  /** One lead paragraph. */
  lede: React.ReactNode;
  /** The page's CTA cluster. One primary, at most one secondary. */
  children?: React.ReactNode;
}

/**
 * The opening block shared by every non-home marketing page.
 *
 * Each page used to hand-roll this with its own `.head`/`.headInner` rules in a
 * page-local CSS module, which is how three pages that should be identical
 * ended up on three slightly different containers. There is one of these now,
 * and it sits inside the same `Section` every other block on the site uses.
 *
 * @param props - {@link PageHeadProps}
 * @returns The page's opening block.
 */
export function PageHead({ eyebrow, title, lede, children }: PageHeadProps): React.JSX.Element {
  return (
    <Section innerClassName={styles.inner}>
      <Eyebrow rule>{eyebrow}</Eyebrow>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.lede}>{lede}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </Section>
  );
}

export default PageHead;
