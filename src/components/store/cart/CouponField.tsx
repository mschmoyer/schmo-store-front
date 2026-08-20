'use client';

import * as React from 'react';
import { IconX } from '@tabler/icons-react';

import { formatMoney } from '@/app/store/_lib/present';

import { StoreButton, cx, storeUi } from '../ui';
import type { CartLine } from './CartProvider';
import styles from './Cart.module.css';

export interface AppliedCoupon {
  code: string;
  discountAmount: number;
  description: string;
}

export interface CouponFieldProps {
  storeId: string;
  currency: string;
  lines: CartLine[];
  subtotal: number;
  applied: AppliedCoupon | null;
  onApply: (coupon: AppliedCoupon | null) => void;
}

/**
 * Coupon entry, wired to the store's existing validation endpoint.
 *
 * The discount is **never** computed in the browser. The code, the current
 * lines and the subtotal go to `/api/store/{id}/coupons/validate`, and whatever
 * amount comes back is what the summary shows. That keeps the rule engine —
 * minimum order values, per-product and per-category targeting, usage caps,
 * date windows — in exactly one place, and it means a shopper cannot conjure a
 * discount by editing anything on this page.
 *
 * Checkout re-validates independently before charging, so a stale coupon here
 * cannot turn into a stale coupon on the order.
 *
 * @param props - {@link CouponFieldProps}
 * @returns The coupon input, or a summary of the applied code
 */
export function CouponField({
  storeId,
  currency,
  lines,
  subtotal,
  applied,
  onApply,
}: CouponFieldProps) {
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();

  const submit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/store/${storeId}/coupons/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          couponCode: trimmed,
          cartItems: lines.map((line) => ({
            product_id: line.productId,
            variant_id: line.variantId,
            name: line.name,
            price: line.price,
            quantity: line.quantity,
          })),
          orderTotal: subtotal,
        }),
      });

      const payload = await response.json();
      const data = payload?.data;

      if (!response.ok || !payload?.success) {
        setError('We could not check that code. Try again in a moment.');
        return;
      }

      if (!data?.valid) {
        setError(typeof data?.error === 'string' ? data.error : 'That code is not valid.');
        return;
      }

      onApply({
        code: trimmed.toUpperCase(),
        discountAmount: Number(data.discountAmount) || 0,
        description:
          typeof data.discount?.description === 'string' ? data.discount.description : '',
      });
      setCode('');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (applied) {
    return (
      <div>
        <div className={styles.appliedCoupon}>
          <span>
            <strong>{applied.code}</strong> applied — −{formatMoney(applied.discountAmount, currency)}
          </span>
          <button
            type="button"
            className={styles.remove}
            onClick={() => onApply(null)}
            aria-label={`Remove coupon ${applied.code}`}
          >
            <IconX size={14} aria-hidden="true" />
          </button>
        </div>
        {applied.description ? (
          <p className={cx(styles.couponNote, storeUi.muted)}>{applied.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} className={storeUi.label}>
        Discount code
      </label>
      <form className={styles.coupon} onSubmit={submit}>
        <input
          id={inputId}
          className={storeUi.input}
          type="text"
          name="coupon"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Enter code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        <StoreButton type="submit" variant="secondary" disabled={busy || code.trim() === ''}>
          {busy ? 'Checking…' : 'Apply'}
        </StoreButton>
      </form>
      <p
        id={`${inputId}-error`}
        className={cx(styles.couponNote, error ? styles.couponError : storeUi.muted)}
        role={error ? 'alert' : undefined}
      >
        {error ?? ''}
      </p>
    </div>
  );
}
