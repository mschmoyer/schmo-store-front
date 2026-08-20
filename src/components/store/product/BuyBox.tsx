'use client';

import * as React from 'react';
import { IconMinus, IconPlus } from '@tabler/icons-react';

import { StoreLinkButton, storeUi } from '../ui';
import { AddToCartButton } from './AddToCartButton';
import styles from './ProductDetail.module.css';

export interface BuyBoxProps {
  productId: string;
  productName: string;
  /** The chosen variant, when the product has options. */
  variantId?: string | null;
  /** "Alpine Green / Medium", used in the add confirmation. */
  variantTitle?: string | null;
  /** Upper bound on the quantity a shopper may add. */
  maxQuantity: number;
  disabled: boolean;
  cartHref: string;
  /**
   * What the button says when it cannot be pressed.
   *
   * "Out of stock" is wrong for a combination the shop never made — the
   * shopper would wait for a restock that is not coming.
   * @default 'Out of stock'
   */
  disabledLabel?: string;
}

/**
 * Quantity selector plus add-to-cart.
 *
 * The stepper is a real `<input type="number">` with buttons either side, so it
 * can be typed into as well as clicked, and the value is clamped on blur rather
 * than while typing — clamping on every keystroke makes it impossible to clear
 * the field and type a new number.
 *
 * @param props - {@link BuyBoxProps}
 * @returns The quantity control and purchase actions
 */
export function BuyBox({
  productId,
  productName,
  variantId = null,
  variantTitle = null,
  maxQuantity,
  disabled,
  cartHref,
  disabledLabel = 'Out of stock',
}: BuyBoxProps) {
  const [quantity, setQuantity] = React.useState(1);
  const [draft, setDraft] = React.useState('1');
  const inputId = React.useId();

  const cap = Math.max(1, Math.min(maxQuantity, 99));

  /**
   * Commit a quantity, clamped into range.
   * @param value - The candidate quantity
   */
  const commit = (value: number): void => {
    const next = Math.min(Math.max(Math.floor(value) || 1, 1), cap);
    setQuantity(next);
    setDraft(String(next));
  };

  return (
    <div className={styles.buyActions}>
      <div>
        <label htmlFor={inputId} className={storeUi.srOnly}>
          Quantity
        </label>
        <div className={storeUi.qty}>
          <button
            type="button"
            className={storeUi.qtyBtn}
            onClick={() => commit(quantity - 1)}
            disabled={disabled || quantity <= 1}
            aria-label="Decrease quantity"
          >
            <IconMinus size={16} aria-hidden="true" />
          </button>
          <input
            id={inputId}
            className={storeUi.qtyValue}
            type="number"
            inputMode="numeric"
            min={1}
            max={cap}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => commit(Number(event.target.value))}
          />
          <button
            type="button"
            className={storeUi.qtyBtn}
            onClick={() => commit(quantity + 1)}
            disabled={disabled || quantity >= cap}
            aria-label="Increase quantity"
          >
            <IconPlus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className={styles.addWrap}>
        <AddToCartButton
          productId={productId}
          productName={variantTitle ? `${productName} (${variantTitle})` : productName}
          variantId={variantId}
          quantity={quantity}
          disabled={disabled}
          size="lg"
          block
          label={disabled ? disabledLabel : 'Add to cart'}
        />
      </div>

      <StoreLinkButton href={cartHref} variant="secondary" size="lg">
        View cart
      </StoreLinkButton>
    </div>
  );
}
