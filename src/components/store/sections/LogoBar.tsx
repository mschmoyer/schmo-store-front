import Link from 'next/link';

import { bool, imageSrc, list, str } from '@/app/store/_lib/settings';
import { resolveStoreHref } from '@/app/store/_lib/present';

import { SectionHeading, StoreBand, StoreContainer, cx } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * A row of brand or partner logos.
 *
 * Entries may carry an image, a name, or both. A name-only entry renders as
 * set type rather than being dropped, which is what makes this section usable
 * by a merchant who has the brand list but not the asset files.
 *
 * The `scroll` setting is intentionally not implemented as an infinite marquee:
 * a continuously moving strip is a motion-sensitivity problem and an
 * accessibility regression for a section whose entire content is decorative
 * credibility. The logos wrap instead.
 *
 * @param props - {@link SectionProps}
 * @returns The band, or null when there are no logos
 */
export function LogoBar({ section, ctx }: SectionProps) {
  const { settings } = section;
  const logos = list(settings, 'logos', 16);
  if (logos.length === 0) return null;

  const grayscale = bool(settings, 'grayscale', true);

  const entries = logos
    .map((logo, index) => {
      const src = imageSrc(logo, 'image') || imageSrc(logo, 'src');
      const name =
        typeof logo.name === 'string'
          ? logo.name
          : typeof logo.alt === 'string'
            ? logo.alt
            : '';
      if (!src && !name) return null;

      const content = src ? (
        // Merchant-supplied logos have no known intrinsic size.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name || ''} />
      ) : (
        <span className={styles.logoText}>{name}</span>
      );

      const href = typeof logo.href === 'string' && logo.href ? logo.href : '';

      return (
        <span key={index} className={styles.logo}>
          {href ? (
            <Link href={resolveStoreHref(ctx.store.storeSlug, href)}>{content}</Link>
          ) : (
            content
          )}
        </span>
      );
    })
    .filter(Boolean);

  if (entries.length === 0) return null;

  return (
    <StoreBand tone="surface" tight>
      <StoreContainer>
        <SectionHeading heading={str(settings, 'heading')} align="center" />
        <div className={cx(styles.logos, grayscale && styles.logosMuted)}>{entries}</div>
      </StoreContainer>
    </StoreBand>
  );
}
