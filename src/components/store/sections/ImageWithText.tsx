import Image from 'next/image';

import { toParagraphs } from '@/app/store/_lib/html';
import { imageSrc, pick, str } from '@/app/store/_lib/settings';
import { resolveStoreHref } from '@/app/store/_lib/present';

import { StoreBand, StoreContainer, StoreLinkButton, cx } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/** Aspect ratios for the image half. */
const RATIO: Record<string, string> = {
  square: '1 / 1',
  portrait: '3 / 4',
  landscape: '4 / 3',
};

/**
 * A photograph beside a paragraph — the workhorse of a good home page.
 *
 * Without an image this becomes a plain copy block rather than a half-empty
 * two-column grid, and on a phone the image always moves above the text so the
 * heading is not pushed off the first screen.
 *
 * @param props - {@link SectionProps}
 * @returns The band, or null when there is no content
 */
export function ImageWithText({ section, ctx }: SectionProps) {
  const { settings } = section;
  const heading = str(settings, 'heading');
  const body = str(settings, 'body');
  const image = imageSrc(settings, 'image');
  if (!heading && !body && !image) return null;

  const ctaLabel = str(settings, 'ctaLabel');
  const ctaHref = ctaLabel ? resolveStoreHref(ctx.store.storeSlug, str(settings, 'ctaHref')) : '';
  const imageSide = pick(settings, 'imageSide', ['left', 'right'] as const, 'left');
  const ratio = RATIO[pick(settings, 'imageRatio', ['square', 'portrait', 'landscape'] as const, 'landscape')];

  const copy = (
    <div className={styles.splitCopy}>
      {heading ? <h2>{heading}</h2> : null}
      {body ? (
        <div className={styles.prose}>
          {toParagraphs(body).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : null}
      {ctaLabel ? <StoreLinkButton href={ctaHref}>{ctaLabel}</StoreLinkButton> : null}
    </div>
  );

  if (!image) {
    return (
      <StoreBand tone="surface">
        <StoreContainer width="narrow">{copy}</StoreContainer>
      </StoreBand>
    );
  }

  return (
    <StoreBand tone="surface">
      <StoreContainer>
        <div className={cx(styles.split, imageSide === 'right' && styles.splitImageRight)}>
          <div className={styles.splitMedia} style={{ aspectRatio: ratio }}>
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 860px) 100vw, 50vw"
              aria-hidden="true"
            />
          </div>
          {copy}
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
