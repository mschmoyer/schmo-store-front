import Link from 'next/link';
import { IconLock, IconMoonStars } from '@tabler/icons-react';

import type { StoreUnavailableReason } from '@/app/store/_lib/types';

import styles from './States.module.css';

export interface StoreUnavailableProps {
  reason: Exclude<StoreUnavailableReason, 'not-found'>;
  slug: string;
}

/** The copy for each reason a shop cannot be shown. */
const COPY = {
  private: {
    icon: IconLock,
    title: 'This shop is not open yet',
    body:
      'The owner has not published it. If this is your shop, switch it to public in your dashboard and it will appear here straight away.',
  },
  inactive: {
    icon: IconMoonStars,
    title: 'This shop is closed',
    body:
      'The owner has deactivated it for now. If this is your shop, reactivate it from your dashboard to start selling again.',
  },
} as const;

/**
 * The page a shopper gets when a shop exists but cannot be shown.
 *
 * Deliberately distinct from a 404. A merchant who has forgotten to publish
 * their shop, and lands on a generic "not found", has no way to work out what
 * went wrong; this page names the actual problem and the actual fix.
 *
 * It renders outside a resolved storefront theme — there is no merchant theme
 * to apply when we are declining to render the merchant's shop — so it uses
 * RebelShops' own chrome, which is correct here: this page is the platform
 * speaking, not the merchant.
 *
 * @param props - {@link StoreUnavailableProps}
 * @returns A full-page explanation
 */
export function StoreUnavailable({ reason, slug }: StoreUnavailableProps) {
  const { icon: Icon, title, body } = COPY[reason];

  return (
    <div className={styles.standalone}>
      <div className={styles.card}>
        <span className={styles.icon}>
          <Icon size={28} aria-hidden="true" />
        </span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>
        <p className={styles.body}>
          <code>/store/{slug}</code>
        </p>
        <div className={styles.actions}>
          <Link href="/store">Browse other shops</Link>
          <Link href="/admin">Go to your dashboard</Link>
        </div>
      </div>
    </div>
  );
}
