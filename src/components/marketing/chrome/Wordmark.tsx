'use client';

import * as React from 'react';
import styles from './Wordmark.module.css';

export interface WordmarkProps {
  /** Height of the mark in pixels. The wordmark scales with it. @default 30 */
  size?: number;
  /** Hides the "RebelShops" lettering, leaving the mark alone. */
  markOnly?: boolean;
  /** Inverts the lettering for use on `--ink-950` grounds. */
  onDark?: boolean;
  className?: string;
}

/**
 * The RebelShops lockup.
 *
 * Prefers the produced brand asset at `/brand/logo-horizontal.svg` and falls
 * back to an inline mark plus live type the moment that file 404s, so the
 * header never renders a broken image while brand assets are still in flight.
 *
 * @param props - {@link WordmarkProps}
 * @returns The brand lockup.
 */
export function Wordmark({
  size = 30,
  markOnly = false,
  onDark = false,
  className,
}: WordmarkProps): React.JSX.Element {
  const [assetFailed, setAssetFailed] = React.useState(false);
  const assetSrc = markOnly ? '/brand/mark.svg' : '/brand/logo-horizontal.svg';

  return (
    <span
      className={[styles.root, onDark ? styles.onDark : '', className].filter(Boolean).join(' ')}
      style={{ '--wordmark-size': `${size}px` } as React.CSSProperties}
    >
      {assetFailed ? null : (
        // eslint-disable-next-line @next/next/no-img-element -- brand asset may not exist yet; onError drives the fallback.
        <img
          src={assetSrc}
          alt="RebelShops"
          height={size}
          className={styles.asset}
          onError={() => setAssetFailed(true)}
        />
      )}

      {assetFailed ? (
        <>
          <svg
            className={styles.mark}
            viewBox="0 0 32 32"
            width={size}
            height={size}
            role="img"
            aria-label="RebelShops"
            focusable="false"
          >
            <rect width="32" height="32" rx="8" fill="var(--ink-950)" />
            <path
              d="M7.5 14.2 16 8.4l8.5 5.8"
              fill="none"
              stroke="var(--ember-500)"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M11 16h10v7.6H11z" fill="var(--paper)" opacity="0.94" />
            <circle cx="16" cy="19.4" r="1.7" fill="var(--ember-500)" />
          </svg>
          {markOnly ? null : <span className={styles.text}>RebelShops</span>}
        </>
      ) : null}
    </span>
  );
}

export default Wordmark;
