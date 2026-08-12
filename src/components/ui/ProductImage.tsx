'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/design/cn';
import { gradientForSeed, hashString } from '@/lib/design/tokens';
import styles from './ProductImage.module.css';

export type ProductImageFit = 'cover' | 'contain';
export type ProductImageRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';

const RADIUS_CLASS: Record<ProductImageRadius, string | undefined> = {
  none: styles.roundedNone,
  sm: styles.roundedSm,
  md: undefined,
  lg: styles.roundedLg,
  xl: styles.roundedXl,
};

/** Everything needed to paint the deterministic fallback tile. */
export interface ProductMark {
  /** One or two uppercase characters taken from the product name. */
  initials: string;
  /** CSS gradient for the tile background. */
  gradient: string;
  /** Foreground colour that stays legible on the gradient. */
  foreground: string;
  /** Highlight position, as CSS percentages. */
  glow: { x: string; y: string };
  /** Angle of the weave overlay. */
  weaveAngle: string;
  /** A tiny SVG data URI used as the blur-up placeholder. */
  blurDataURL: string;
}

/**
 * Derives up to two initials from a product name, falling back to the SKU when
 * the name has no usable letters.
 *
 * @param name - Product name.
 * @param sku - Product SKU.
 * @returns One or two uppercase characters.
 */
function deriveInitials(name: string | undefined, sku: string | undefined): string {
  const source = (name ?? '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  const words = source.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  const skuLetters = (sku ?? '').replace(/[^\p{L}\p{N}]/gu, '');
  return (skuLetters.slice(0, 2) || '??').toUpperCase();
}

/**
 * Builds the deterministic generated mark for a product. The same SKU always
 * produces the same tile, on the server and on the client, so a catalogue does
 * not reshuffle its colours between renders.
 *
 * @param options - The product's `sku` and/or `name`. SKU is preferred as the seed.
 * @returns A {@link ProductMark} describing the tile.
 */
export function getProductMark(options: { sku?: string; name?: string }): ProductMark {
  const seed = (options.sku || options.name || 'rebelshops').trim().toLowerCase();
  const hash = hashString(seed);
  const { from, to, on } = gradientForSeed(seed);

  // Spread the derived numbers across different bit ranges so angle, glow and
  // weave do not all move in lockstep with the palette choice.
  const angle = 90 + ((hash >>> 4) % 8) * 22.5;
  const glowX = 18 + ((hash >>> 9) % 5) * 16;
  const glowY = 14 + ((hash >>> 14) % 4) * 18;
  const weaveAngle = ((hash >>> 19) % 2 === 0 ? 45 : 135) + ((hash >>> 21) % 3) * 5;

  const gradient = `linear-gradient(${angle}deg, ${from} 0%, ${to} 100%)`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs><rect width="8" height="8" fill="url(#g)"/></svg>`;

  return {
    initials: deriveInitials(options.name, options.sku),
    gradient,
    foreground: on,
    glow: { x: `${glowX}%`, y: `${glowY}%` },
    weaveAngle: `${weaveAngle}deg`,
    blurDataURL: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
  };
}

export interface ProductImageProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Image URL. When absent, empty, or failing to load, the mark is drawn instead. */
  src?: string | null;
  /** Product name. Used for the alt text and the fallback initials. */
  name: string;
  /** Product SKU. The preferred seed for the deterministic fallback. */
  sku?: string;
  /**
   * Alt text. Defaults to the product name. Pass `''` when the image is purely
   * decorative because the name is already adjacent in the DOM.
   */
  alt?: string;
  /** CSS aspect ratio for the frame. @default '1 / 1' */
  ratio?: string;
  /** How the photograph fills the frame. @default 'cover' */
  fit?: ProductImageFit;
  /** Corner radius token. @default 'md' */
  rounded?: ProductImageRadius;
  /** Next.js `sizes` hint. @default '(max-width: 768px) 100vw, 320px' */
  sizes?: string;
  /** Opt into LCP priority loading. Use on hero/first-tile images only. */
  priority?: boolean;
  /** Scales the photograph slightly on hover. Off by default — see the CSS note. */
  zoomOnHover?: boolean;
  /** Overrides the `<img>` class. */
  imageClassName?: string;
}

/**
 * Product imagery with a graceful, *designed* fallback.
 *
 * When there is no photograph we render a mark generated from the SKU: a
 * gradient pulled deterministically from the palette, a soft off-centre light
 * source, a fine weave, the product's initials in the display face and the SKU
 * in mono. It is stable across renders and never looks like a broken image.
 *
 * @param props - {@link ProductImageProps}
 * @param ref - Forwarded to the frame element.
 * @returns An aspect-ratio-locked image frame.
 */
export const ProductImage = React.forwardRef<HTMLDivElement, ProductImageProps>(
  function ProductImage(
    {
      src,
      name,
      sku,
      alt,
      ratio = '1 / 1',
      fit = 'cover',
      rounded = 'md',
      sizes = '(max-width: 768px) 100vw, 320px',
      priority = false,
      zoomOnHover = false,
      className,
      imageClassName,
      style,
      ...rest
    },
    ref
  ) {
    const [failed, setFailed] = React.useState(false);

    // A new src deserves a fresh attempt.
    React.useEffect(() => {
      setFailed(false);
    }, [src]);

    const mark = React.useMemo(() => getProductMark({ sku, name }), [sku, name]);
    const showMark = !src || failed;

    return (
      <div
        ref={ref}
        className={cn(
          styles.frame,
          RADIUS_CLASS[rounded],
          zoomOnHover && styles.zoomOnHover,
          className
        )}
        style={{ aspectRatio: ratio, ...style }}
        {...rest}
      >
        {showMark ? (
          <div
            className={styles.mark}
            role="img"
            aria-label={alt ?? `${name} — no product image`}
            style={
              {
                '--mark-gradient': mark.gradient,
                '--mark-fg': mark.foreground,
                '--mark-glow-x': mark.glow.x,
                '--mark-glow-y': mark.glow.y,
                '--mark-weave-angle': mark.weaveAngle,
              } as React.CSSProperties
            }
          >
            <span className={styles.markGradient} aria-hidden="true" />
            <span className={styles.markGlow} aria-hidden="true" />
            <span className={styles.markWeave} aria-hidden="true" />
            <span className={styles.markVignette} aria-hidden="true" />
            <span className={styles.markInitials} aria-hidden="true">
              {mark.initials}
            </span>
            {sku ? (
              <span className={styles.markSku} aria-hidden="true">
                {sku}
              </span>
            ) : null}
          </div>
        ) : (
          <Image
            src={src}
            alt={alt ?? name}
            fill
            sizes={sizes}
            priority={priority}
            placeholder="blur"
            blurDataURL={mark.blurDataURL}
            className={cn(styles.image, styles[fit], imageClassName)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    );
  }
);

export default ProductImage;
