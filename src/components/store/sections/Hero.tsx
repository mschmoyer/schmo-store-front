import type * as React from 'react';
import Image from 'next/image';

import { imageSrc, num, pick, str } from '@/app/store/_lib/settings';
import { resolveStoreHref } from '@/app/store/_lib/present';
import { presetSectionDefault } from '@/lib/storefront-theme';

import { StoreBand, StoreContainer, StoreLinkButton, cx, storeUi } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * Minimum dimming on an overlay hero, as a percentage.
 *
 * A floor, not a clamp. Text over a photograph is the one place in the
 * storefront where the ground is unknowable at build time, so the scrim has to
 * be dark enough that the worst case — light copy over a white product shot —
 * is still legible. 55% of the palette's overlay tint takes a pure-white image
 * to roughly 5:1 against the light ink `Sections.module.css` pairs with it. A
 * merchant can dim further; they cannot dim below readable.
 */
const OVERLAY_SCRIM_FLOOR = 55;

/**
 * Read a hero string setting, but only when the merchant actually wrote it.
 *
 * Three sources want to fill the headline, and they rank in this order:
 *
 *  1. what the merchant typed into the customizer;
 *  2. the shop's own `hero_title` / `hero_description`, which is also copy they
 *     wrote, just in store settings rather than in the section editor;
 *  3. the preset's placeholder.
 *
 * A preset ships real copy so a brand-new shop looks designed, but that copy is
 * written for a *vertical*, not for this shop. If the value still matches the
 * preset's default it has not been touched, so it yields to the merchant's own
 * words and only wins when there are none.
 *
 * @param settings - The hero section's settings
 * @param key - `heading` or `subheading`
 * @param ctx - Section context, for the active preset id
 * @returns The merchant's own copy, or an empty string
 */
function merchantCopy(
  settings: Record<string, unknown>,
  key: 'heading' | 'subheading',
  ctx: SectionProps['ctx'],
): string {
  const value = str(settings, key);
  if (!value) return '';
  return value === presetSectionDefault(ctx.theme.preset, 'hero', key).trim() ? '' : value;
}

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
 * `hero_title` / `hero_description`, and the art falls back to the store's
 * `hero_image_url`, so a merchant who has never opened the customizer still
 * gets their real words and their real photograph rather than a text-only
 * band with half the first screen empty.
 *
 * @param props - {@link SectionProps}
 * @returns The hero band
 */
export function Hero({ section, ctx }: SectionProps) {
  const { settings } = section;
  const { store } = ctx;

  const eyebrow = str(settings, 'eyebrow');
  const heading = merchantCopy(settings, 'heading', ctx) || store.heroTitle || store.storeName;
  const subheading =
    merchantCopy(settings, 'subheading', ctx) ||
    store.heroDescription ||
    store.storeDescription ||
    '';

  const primaryLabel = str(settings, 'primaryLabel', 'Shop all');
  const primaryHref = resolveStoreHref(store.storeSlug, str(settings, 'primaryHref', '/products'));
  const secondaryLabel = str(settings, 'secondaryLabel');
  const secondaryHref = secondaryLabel
    ? resolveStoreHref(store.storeSlug, str(settings, 'secondaryHref'))
    : '';

  // The section's own image wins, but a merchant who set a hero photograph in
  // store settings should not have to re-enter it here — the same fallback the
  // headline and the lead already do, two lines up.
  const image = imageSrc(settings, 'image') || store.heroImageUrl || '';
  const requested = pick(settings, 'layout', ['split', 'overlay', 'text-only'] as const, 'split');
  const layout = image ? requested : 'text-only';
  const height = pick(settings, 'height', ['small', 'medium', 'large'] as const, 'medium');
  const align = pick(settings, 'align', ['left', 'center'] as const, 'left');
  const scrim =
    Math.max(num(settings, 'overlayOpacity', 35, 0, 80), OVERLAY_SCRIM_FLOOR) / 100;

  const heightClass = {
    small: styles.heightSmall,
    medium: styles.heightMedium,
    large: styles.heightLarge,
  }[height];

  const copy = (
    <div className={cx(styles.heroCopy, align === 'center' && styles.heroCopyCenter)}>
      {eyebrow ? (
        <span className={cx(storeUi.eyebrow, styles.heroEyebrow)}>{eyebrow}</span>
      ) : null}
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
