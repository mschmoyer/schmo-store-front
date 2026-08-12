import type * as React from 'react';
import Image from 'next/image';

import { imageSrc, num, pick, str } from '@/app/store/_lib/settings';
import { resolveStoreHref } from '@/app/store/_lib/present';

import { StoreBand, StoreContainer, StoreLinkButton, cx, storeUi } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * The hero section.
 *
 * Three layouts, all from the merchant's settings:
 *
 *  - `split` — copy beside a photograph, stacking to copy-under-image on a
 *    phone (the image moves *above* the copy, because a headline pushed below
 *    the fold by a tall image is a worse first screen than the reverse).
 *  - `overlay` — copy over the photograph, with a dimming scrim whose opacity
 *    the merchant controls, so text stays readable over a busy image.
 *  - `text-only` — no image at all.
 *
 * When a layout wants an image and none is set, it degrades to `text-only`
 * rather than reserving an empty grey rectangle.
 *
 * The headline is the page's `h1`. Hero copy falls back to the store's own
 * `hero_title` / `hero_description` so a merchant who has never opened the
 * customizer still gets their real words rather than placeholder copy.
 *
 * @param props - {@link SectionProps}
 * @returns The hero band
 */
export function Hero({ section, ctx }: SectionProps) {
  const { settings } = section;
  const { store } = ctx;

  const eyebrow = str(settings, 'eyebrow');
  const heading = str(settings, 'heading') || store.heroTitle || store.storeName;
  const subheading =
    str(settings, 'subheading') || store.heroDescription || store.storeDescription || '';

  const primaryLabel = str(settings, 'primaryLabel', 'Shop all');
  const primaryHref = resolveStoreHref(store.storeSlug, str(settings, 'primaryHref', '/products'));
  const secondaryLabel = str(settings, 'secondaryLabel');
  const secondaryHref = secondaryLabel
    ? resolveStoreHref(store.storeSlug, str(settings, 'secondaryHref'))
    : '';

  const image = imageSrc(settings, 'image');
  const requested = pick(settings, 'layout', ['split', 'overlay', 'text-only'] as const, 'split');
  const layout = image ? requested : 'text-only';
  const height = pick(settings, 'height', ['small', 'medium', 'large'] as const, 'medium');
  const align = pick(settings, 'align', ['left', 'center'] as const, 'left');
  const scrim = num(settings, 'overlayOpacity', 35, 0, 80) / 100;

  const heightClass = {
    small: styles.heightSmall,
    medium: styles.heightMedium,
    large: styles.heightLarge,
  }[height];

  const copy = (
    <div className={cx(styles.heroCopy, align === 'center' && styles.heroCopyCenter)}>
      {eyebrow ? <span className={storeUi.eyebrow}>{eyebrow}</span> : null}
      <h1>{heading}</h1>
      {subheading ? <p className={styles.heroLead}>{subheading}</p> : null}
      {primaryLabel || secondaryLabel ? (
        <div className={styles.heroActions}>
          {primaryLabel ? (
            <StoreLinkButton href={primaryHref} size="lg">
              {primaryLabel}
            </StoreLinkButton>
          ) : null}
          {secondaryLabel ? (
            <StoreLinkButton href={secondaryHref} size="lg" variant="secondary">
              {secondaryLabel}
            </StoreLinkButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (layout === 'overlay') {
    return (
      <StoreBand tone="surface" className={styles.hero} tight>
        <StoreContainer>
          <div
            className={cx(styles.heroOverlay, heightClass)}
            style={{ '--_scrim': scrim } as React.CSSProperties}
          >
            <div className={styles.heroOverlayImage}>
              <Image src={image} alt="" fill priority sizes="100vw" aria-hidden="true" />
            </div>
            <div className={styles.heroScrim} aria-hidden="true" />
            {copy}
          </div>
        </StoreContainer>
      </StoreBand>
    );
  }

  if (layout === 'text-only') {
    return (
      <StoreBand tone="surface" className={styles.hero} tight>
        <StoreContainer>
          <div
            className={cx(
              styles.heroPlain,
              align === 'left' && styles.heroPlainStart,
              heightClass,
            )}
          >
            {copy}
          </div>
        </StoreContainer>
      </StoreBand>
    );
  }

  return (
    <StoreBand tone="surface" className={styles.hero}>
      <StoreContainer>
        <div className={cx(styles.heroSplit, heightClass)}>
          {copy}
          <div className={styles.heroMedia}>
            <Image
              src={image}
              alt=""
              fill
              priority
              sizes="(max-width: 860px) 100vw, 50vw"
              aria-hidden="true"
            />
          </div>
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
