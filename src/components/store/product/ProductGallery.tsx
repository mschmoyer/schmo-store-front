'use client';

import * as React from 'react';
import Image from 'next/image';

import { ProductMark } from './ProductMark';
import { cx, storeUi } from '../ui';
import styles from './ProductDetail.module.css';

export interface ProductGalleryProps {
  images: string[];
  name: string;
  sku: string;
  /**
   * Image to show on the stage, driven from outside — the photograph of the
   * variant a shopper has selected. When it matches one of `images`, that
   * thumbnail becomes active, so picking "Forest Green" moves the gallery to
   * the green shirt. Null or absent leaves the shopper's own choice alone.
   */
  activeSrc?: string | null;
}

/**
 * The product image gallery.
 *
 * The thumbnails are a real ARIA tab list, which is what makes the gallery
 * keyboard-operable rather than merely clickable: arrow keys move between
 * images, Home and End jump to the ends, and only the selected thumbnail is in
 * the tab order — so a shopper tabbing through the page steps over the gallery
 * in one press instead of eight.
 *
 * With a single image the thumbnail strip is omitted entirely; with none, the
 * themed generated mark stands in.
 *
 * @param props - {@link ProductGalleryProps}
 * @returns An image stage with an optional thumbnail strip
 */
export function ProductGallery({ images, name, sku, activeSrc }: ProductGalleryProps) {
  const [active, setActive] = React.useState(0);
  const thumbRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  // Follow an externally-chosen image (the selected variant's photograph) onto
  // its thumbnail while still letting the shopper browse the strip themselves.
  // This is React's "adjust state when a prop changes" pattern — comparing the
  // last `activeSrc` and setting state during render, not in an effect, so
  // there is no extra commit and the change is applied before paint.
  const [lastSrc, setLastSrc] = React.useState(activeSrc ?? null);
  if ((activeSrc ?? null) !== lastSrc) {
    setLastSrc(activeSrc ?? null);
    if (activeSrc) {
      const index = images.indexOf(activeSrc);
      if (index >= 0) setActive(index);
    }
  }

  const count = images.length;
  const current = images[Math.min(active, Math.max(count - 1, 0))];

  /**
   * Move selection with the keyboard, following the ARIA tabs pattern.
   * @param event - The originating key event
   */
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (count < 2) return;

    const moves: Record<string, number> = {
      ArrowRight: active + 1,
      ArrowDown: active + 1,
      ArrowLeft: active - 1,
      ArrowUp: active - 1,
      Home: 0,
      End: count - 1,
    };

    const next = moves[event.key];
    if (next === undefined) return;

    event.preventDefault();
    const index = (next + count) % count;
    setActive(index);
    thumbRefs.current[index]?.focus();
  };

  return (
    <div className={styles.gallery}>
      <div className={styles.stage}>
        {current ? (
          <Image
            src={current}
            alt={count > 1 ? `${name} — image ${active + 1} of ${count}` : name}
            fill
            priority
            sizes="(max-width: 940px) 100vw, 55vw"
          />
        ) : (
          <ProductMark name={name} sku={sku} size="detail" />
        )}
      </div>

      {count > 1 ? (
        <div
          className={styles.thumbs}
          role="tablist"
          aria-label={`${name} images`}
          onKeyDown={onKeyDown}
        >
          {images.map((src, index) => (
            <button
              key={src}
              ref={(node) => {
                thumbRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={`Show image ${index + 1} of ${count}`}
              // Roving tabindex: the strip is one tab stop, not `count` of them.
              tabIndex={index === active ? 0 : -1}
              className={cx(styles.thumb, index === active && styles.thumbActive)}
              onClick={() => setActive(index)}
            >
              <Image src={src} alt="" fill sizes="74px" />
            </button>
          ))}
        </div>
      ) : null}

      <span role="status" aria-live="polite" className={storeUi.srOnly}>
        {count > 1 ? `Image ${active + 1} of ${count}` : ''}
      </span>
    </div>
  );
}
