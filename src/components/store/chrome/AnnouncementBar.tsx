import Link from 'next/link';

import { resolveStoreHref } from '@/app/store/_lib/present';
import type { ThemeAnnouncement } from '@/lib/storefront-theme';

import { StoreContainer } from '../ui';
import styles from './Chrome.module.css';

export interface AnnouncementBarProps {
  announcement: ThemeAnnouncement;
  storeSlug: string;
}

/**
 * The optional strip above the header.
 *
 * Renders nothing when the merchant has disabled it or left the text blank —
 * an enabled-but-empty bar would otherwise show as a coloured stripe of
 * nothing, which looks like a rendering bug.
 *
 * The link is passed through `resolveStoreHref`, so merchant text cannot turn
 * the bar into an off-site redirector.
 *
 * @param props - {@link AnnouncementBarProps}
 * @returns The announcement strip, or null
 */
export function AnnouncementBar({ announcement, storeSlug }: AnnouncementBarProps) {
  const text = announcement.text?.trim();
  if (!announcement.enabled || !text) return null;

  const body = announcement.href ? (
    <Link href={resolveStoreHref(storeSlug, announcement.href)} className={styles.announceLink}>
      {text}
    </Link>
  ) : (
    text
  );

  return (
    <div className={styles.announce}>
      <StoreContainer>
        <p className={styles.announceInner}>{body}</p>
      </StoreContainer>
    </div>
  );
}
