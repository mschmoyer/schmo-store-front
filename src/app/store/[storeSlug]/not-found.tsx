import Link from 'next/link';
import { IconSearchOff } from '@tabler/icons-react';

import styles from '@/components/store/states/States.module.css';

/**
 * The 404 for anything under a store route.
 *
 * Covers both "no such shop" and "no such product", because a shopper who
 * followed a stale link cannot tell the difference and does not care — what
 * they need is a way back into a catalogue, not an apology.
 *
 * This renders outside a resolved merchant theme (there may be no merchant to
 * theme it with), so it uses RebelShops' own chrome deliberately.
 *
 * @returns The storefront not-found page
 */
export default function StoreNotFound() {
  return (
    <div className={styles.standalone}>
      <div className={styles.card}>
        <span className={styles.icon}>
          <IconSearchOff size={28} aria-hidden="true" />
        </span>
        <h1 className={styles.title}>We could not find that page</h1>
        <p className={styles.body}>
          The shop or product you are looking for does not exist, or it has been taken down. The
          link may be out of date.
        </p>
        <div className={styles.actions}>
          <Link href="/store">Browse shops</Link>
        </div>
      </div>
    </div>
  );
}
