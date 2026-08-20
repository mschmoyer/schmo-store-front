'use client';

import * as React from 'react';
import { IconCheck, IconShoppingCartPlus } from '@tabler/icons-react';

import { StoreButton, storeUi } from '../ui';
import { useCart } from '../cart/CartProvider';

export interface AddToCartButtonProps {
  productId: string;
  productName: string;
  /** The chosen variant, when the product has options. */
  variantId?: string | null;
  quantity?: number;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  className?: string;
  /** Label before anything is added. @default 'Add to cart' */
  label?: string;
  /** Hide the icon; used by the compact quick-add on a card. */
  hideIcon?: boolean;
}

/** How long the confirmed state stays up before reverting. */
const CONFIRM_MS = 1800;

/**
 * Add-to-cart with feedback that is actually feedback.
 *
 * Three things happen on click, because "the button flashed" is not
 * confirmation: the label changes to "Added", the icon becomes a tick, and a
 * polite live region announces the addition for anyone not watching the button.
 * The control is disabled while the write is in flight so a double-click cannot
 * add twice.
 *
 * @param props - {@link AddToCartButtonProps}
 * @returns A button that adds the product to the cart
 */
export function AddToCartButton({
  productId,
  productName,
  variantId = null,
  quantity = 1,
  disabled = false,
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  label = 'Add to cart',
  hideIcon = false,
}: AddToCartButtonProps) {
  const { addItem } = useCart();
  const [state, setState] = React.useState<'idle' | 'busy' | 'done'>('idle');
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = async (): Promise<void> => {
    if (state === 'busy' || disabled) return;
    setState('busy');
    await addItem(productId, quantity, variantId);
    setState('done');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), CONFIRM_MS);
  };

  const done = state === 'done';

  return (
    <>
      <StoreButton
        variant={variant}
        size={size}
        block={block}
        className={className}
        disabled={disabled || state === 'busy'}
        onClick={onClick}
      >
        {hideIcon ? null : done ? (
          <IconCheck size={18} aria-hidden="true" />
        ) : (
          <IconShoppingCartPlus size={18} aria-hidden="true" />
        )}
        {done ? 'Added' : label}
      </StoreButton>
      <span role="status" aria-live="polite" className={storeUi.srOnly}>
        {done ? `${productName} added to your cart.` : ''}
      </span>
    </>
  );
}
