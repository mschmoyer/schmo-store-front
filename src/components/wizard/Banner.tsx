'use client';

import * as React from 'react';
import styles from './Wizard.module.css';

export type BannerTone = 'danger' | 'success' | 'info' | 'warning';

export interface BannerProps {
  tone: BannerTone;
  /** Optional bold first line. */
  title?: React.ReactNode;
  children: React.ReactNode;
  /** Trailing action, e.g. a "Retry" button. */
  action?: React.ReactNode;
}

/** Tone-specific mark. Colour is never the only signal (design system §7). */
function ToneIcon({ tone }: { tone: BannerTone }): React.ReactElement {
  if (tone === 'success') {
    return (
      <svg className={styles.bannerIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.9" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M5 8.2 7 10.2l4-4.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (tone === 'info') {
    return (
      <svg className={styles.bannerIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.9" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className={styles.bannerIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.9 15 14.3H1L8 1.9Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 6.3v3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.7" r="0.85" fill="currentColor" />
    </svg>
  );
}

/**
 * Inline status message inside a step. Announced politely for errors so a
 * screen-reader user hears a failed connection test without moving focus.
 *
 * @param props - {@link BannerProps}
 * @returns The banner
 */
export default function Banner({ tone, title, children, action }: BannerProps): React.ReactElement {
  return (
    <div
      className={styles.banner}
      data-tone={tone}
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
    >
      <ToneIcon tone={tone} />
      <div className={styles.bannerBody}>
        {title ? <p className={styles.bannerTitle}>{title}</p> : null}
        <p className={styles.bannerText}>{children}</p>
        {action}
      </div>
    </div>
  );
}
