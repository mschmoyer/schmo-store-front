'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { IconInfoCircle, IconMinus, IconPlus } from '@tabler/icons-react';

import { formatMoney } from '@/app/store/_lib/present';

import { EmptyCart } from '../states/EmptyStates';
import {
  Notice,
  SectionHeading,
  StoreButton,
  StoreLinkButton,
  cx,
  storeUi,
} from '../ui';
import { CouponField, type AppliedCoupon } from './CouponField';
import { useCart } from './CartProvider';
import styles from './Cart.module.css';

export interface CartViewProps {
  storeId: string;
  storeSlug: string;
  currency: string;
}

/**
 * The cart page body.
 *
 * The important property here is that **nothing shown is taken from
 * `localStorage`**. The browser contributes product ids and quantities; the
 * name, image, price and stock on every line came back from the server on
 * load, and the subtotal is computed from those server prices. Editing the
 * stored cart in devtools changes what you asked for, never what it costs.
 *
 * Removal is undoable, because a mis-tapped remove on a phone otherwise means
 * finding the product again. Shipping is stated as "calculated at checkout"
 * rather than estimated, because an estimate we cannot stand behind is worse
 * than an honest deferral.
 *
 * @param props - {@link CartViewProps}
 * @returns The cart
 */
export function CartView({ storeId, storeSlug, currency }: CartViewProps) {
  const {
    lines,
    subtotal,
    loading,
    removedNotice,
    setQuantity,
    removeItem,
    undoRemove,
    pendingUndo,
    clearUndo,
  } = useCart();

  const [coupon, setCoupon] = React.useState<AppliedCoupon | null>(null);
  const base = `/store/${storeSlug}`;

  // A coupon validated against an older basket must not survive a change to it.
  const signature = lines.map((line) => `${line.key}:${line.quantity}`).join(',');
  React.useEffect(() => {
    setCoupon(null);
  }, [signature]);

  if (loading && lines.length === 0) {
    return (
      <div role="status" aria-label="Loading your cart">
        {[0, 1].map((index) => (
          <div key={index} className={cx(styles.skeletonLine, storeUi.muted)} />
        ))}
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <>
        {removedNotice ? <p className={styles.alert}>{removedNotice}</p> : null}
        <EmptyCart shopHref={`${base}/products`} />
      </>
    );
  }

  const discount = coupon ? Math.min(coupon.discountAmount, subtotal) : 0;
  const total = Math.max(subtotal - discount, 0);

  return (
    <div>
      {removedNotice ? (
        <p className={styles.alert} role="status">
          {removedNotice}
        </p>
      ) : null}

      {pendingUndo ? (
        <div className={styles.undo} role="status">
          <span>Removed “{pendingUndo.name}”.</span>
          <span className={styles.lineControls}>
            <StoreButton size="sm" variant="secondary" onClick={undoRemove}>
              Undo
            </StoreButton>
            <button type="button" className={styles.remove} onClick={clearUndo}>
              Dismiss
            </button>
          </span>
        </div>
      ) : null}

      <div className={styles.layout}>
        <div>
          <ul className={styles.lines}>
            {lines.map((line) => {
              const href = `${base}/product/${line.slug || line.productId}`;
              return (
                <li key={line.key} className={styles.line}>
                  <Link href={href} className={styles.lineMedia} aria-hidden="true" tabIndex={-1}>
                    {line.thumbnailUrl ? (
                      <Image src={line.thumbnailUrl} alt="" fill sizes="96px" />
                    ) : null}
                  </Link>

                  <div className={styles.lineBody}>
                    <Link href={href} className={styles.lineName}>
                      {line.name}
                    </Link>
                    {/* Without this, two sizes of one shirt are two identical
                        rows and the shopper cannot tell which is which. */}
                    {line.variantTitle ? (
                      <span className={styles.lineVariant}>{line.variantTitle}</span>
                    ) : null}
                    {line.sku ? <span className={styles.lineSku}>SKU {line.sku}</span> : null}

                    <div className={styles.lineControls}>
                      <div className={storeUi.qty}>
                        <button
                          type="button"
                          className={storeUi.qtyBtn}
                          onClick={() => setQuantity(line.key, line.quantity - 1)}
                          disabled={line.quantity <= 1}
                          aria-label={`Decrease quantity of ${line.name}`}
                        >
                          <IconMinus size={15} aria-hidden="true" />
                        </button>
                        <input
                          className={storeUi.qtyValue}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={line.maxQuantity}
                          value={line.quantity}
                          aria-label={`Quantity of ${line.name}`}
                          onChange={(event) =>
                            setQuantity(line.key, Number(event.target.value))
                          }
                        />
                        <button
                          type="button"
                          className={storeUi.qtyBtn}
                          onClick={() => setQuantity(line.key, line.quantity + 1)}
                          disabled={line.quantity >= line.maxQuantity}
                          aria-label={`Increase quantity of ${line.name}`}
                        >
                          <IconPlus size={15} aria-hidden="true" />
                        </button>
                      </div>

                      <button
                        type="button"
                        className={styles.remove}
                        onClick={() => removeItem(line.key)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className={styles.lineTotals}>
                    <span className={styles.rowValue}>
                      {formatMoney(line.price * line.quantity, currency)}
                    </span>
                    {line.quantity > 1 ? (
                      <span className={styles.lineEach}>
                        {formatMoney(line.price, currency)} each
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className={styles.lineControls} style={{ marginTop: 'var(--st-space-5)' }}>
            <StoreLinkButton href={`${base}/products`} variant="secondary">
              Continue shopping
            </StoreLinkButton>
          </div>
        </div>

        <aside className={styles.summary} aria-label="Order summary">
          <SectionHeading heading="Summary" level={2} />

          <div className={styles.row}>
            <span>Subtotal</span>
            <span className={styles.rowValue}>{formatMoney(subtotal, currency)}</span>
          </div>

          {discount > 0 ? (
            <div className={cx(styles.row, styles.rowDiscount)}>
              <span>Discount</span>
              <span className={styles.rowValue}>−{formatMoney(discount, currency)}</span>
            </div>
          ) : null}

          <div className={styles.row}>
            <span>Shipping</span>
            <span className={styles.rowValue}>Calculated at checkout</span>
          </div>

          <CouponField
            storeId={storeId}
            currency={currency}
            lines={lines}
            subtotal={subtotal}
            applied={coupon}
            onApply={setCoupon}
          />

          <div className={styles.total}>
            <span>Total</span>
            <span className={styles.totalValue}>{formatMoney(total, currency)}</span>
          </div>

          <StoreLinkButton href={`${base}/checkout`} size="lg" block>
            Checkout
          </StoreLinkButton>

          <Notice icon={<IconInfoCircle size={16} />}>
            Shipping and any tax are worked out at checkout once you enter a delivery address.
            Prices are confirmed against live stock before payment.
          </Notice>
        </aside>
      </div>
    </div>
  );
}
