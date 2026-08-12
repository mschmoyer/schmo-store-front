import type { Metadata } from 'next';

import { StorefrontShell } from '@/components/store/StorefrontShell';
import { CartView } from '@/components/store/cart/CartView';
import { SectionHeading, StoreBand, StoreContainer } from '@/components/store/ui';

import { loadStorefront, type SearchParams } from '../../_lib/load';

interface CartPageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Cart',
  // A cart is per-visitor and has nothing to index.
  robots: { index: false, follow: true },
};

/**
 * The cart page.
 *
 * The shell and chrome are server-rendered and themed like every other page;
 * only the cart itself is a client component, because its contents live in the
 * visitor's browser. Those contents are ids and quantities — every price shown
 * is re-fetched from the server, so a tampered `localStorage` changes what a
 * shopper asked for and never what they are charged.
 *
 * Checkout is owned by another track. This page links to it and does not reach
 * into it.
 *
 * @param props - Route and search params
 * @returns The themed cart page
 */
export default async function CartPage({ params, searchParams }: CartPageProps) {
  const [{ storeSlug }, search] = await Promise.all([params, searchParams]);

  const result = await loadStorefront(storeSlug, search);
  if (!result.ok) return result.fallback;

  const { store } = result.data;

  return (
    <StorefrontShell {...result.data}>
      <StoreBand>
        <StoreContainer>
          <SectionHeading heading="Your cart" level={2} />
          <CartView
            storeId={store.id}
            storeSlug={store.storeSlug}
            currency={store.currency}
          />
        </StoreContainer>
      </StoreBand>
    </StorefrontShell>
  );
}
