'use client';

import Link from 'next/link';
import { IconShoppingBag } from '@tabler/icons-react';

import { useCart } from '../cart/CartProvider';
import styles from './Chrome.module.css';

export interface CartBadgeProps {
  href: string;
}

/**
 * The header's cart link and item counter.
 *
 * The count comes from the cart context rather than from a private
 * `localStorage` read, so it stays in step with every other cart surface on the
 * page — add from a product card and the number moves immediately, with no
 * custom events to miss and no polling.
 *
 * The badge renders nothing at zero: an empty cart does not need a decoration,
 * and the accessible name already carries the count for assistive tech.
 *
 * @param props - {@link CartBadgeProps}
 * @returns A cart link with a live item count
 */
export function CartBadge({ href }: CartBadgeProps) {
  const { count } = useCart();

  return (
    <Link
      href={href}
      className={styles.iconButton}
      aria-label={count > 0 ? `Cart, ${count} item${count === 1 ? '' : 's'}` : 'Cart, empty'}
    >
      <IconShoppingBag size={22} aria-hidden="true" />
      {count > 0 ? (
        <span className={styles.badge} aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
