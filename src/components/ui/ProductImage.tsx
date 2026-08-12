'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/design/cn';
// getProductMark lives outside this file because every export of a
// 'use client' module becomes a client reference, which made it uncallable
// from server components. Re-exported here so existing imports keep working.
import { getProductMark, type ProductMark } from '@/lib/design/product-mark';
export { getProductMark };
export type { ProductMark };
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
  /** Corner radius token. Matches buttons/inputs so tiles agree with the
   *  rest of the composition (§4 caps a composition at two radii). @default 'sm' */
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
/**
 * Whether `next/image` can render this src without throwing.
 *
 * `next/image` validates `src` during *render* and throws "Invalid src prop"
 * for a host that is not configured, a malformed URL, or a protocol it does
 * not accept. That happens before any load is attempted, so `onError` never
 * fires and the whole page crashes — which is exactly what a real merchant hit
 * on /admin/inventory, where a product image pointed at their own Shopify CDN.
 *
 * Product image URLs arrive from merchant ShipStation catalogues, so they are
 * arbitrary third-party strings and some will be junk. A bad URL on one row
 * must degrade to that row's generated mark, never take down the page.
 *
 * @param src - Candidate image URL.
 * @returns True when the value is safe to hand to `next/image`.
 */
function isRenderableSrc(src: string | null | undefined): src is string {
  if (!src) return false;
  const value = src.trim();
  if (value === '') return false;
  // Root-relative paths are always fine.
  if (value.startsWith('/')) return true;
  try {
    const url = new URL(value);
    // data: and blob: are rejected by next/image; http is only configured for
    // localhost, so anything else non-https would throw.
    return url.protocol === 'https:'
      || (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

export const ProductImage = React.forwardRef<HTMLDivElement, ProductImageProps>(
  function ProductImage(
    {
      src,
      name,
      sku,
      alt,
      ratio = '1 / 1',
      fit = 'cover',
      rounded = 'sm',
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
    const usable = isRenderableSrc(src);
    const showMark = !usable || failed;

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
            <span
              className={cn(
                styles.markInitials,
                mark.single && styles.markInitialsSingle,
                mark.nonLatin && styles.markInitialsNonLatin
              )}
              aria-hidden="true"
            >
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
            src={src as string}
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
