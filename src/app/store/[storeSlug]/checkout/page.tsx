import type { Metadata } from 'next';

import { StorefrontShell } from '@/components/store/StorefrontShell';
import { CheckoutView } from '@/components/store/checkout/CheckoutView';
import { SectionHeading, StoreBand, StoreContainer } from '@/components/store/ui';

import { loadStorefront, type SearchParams } from '../../_lib/load';

interface CheckoutPageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Checkout',
  // A checkout is per-visitor and has nothing to index.
  robots: { index: false, follow: false },
};

/**
 * The checkout page.
 *
 * Server-rendered inside `StorefrontShell`, exactly like the cart, so the
 * merchant's announcement bar, header, nav, footer, palette, type and radius
 * are all still there when the shopper is asked for money. Before this, the
 * route rendered a white RebelShops admin form with its own `TopNav`, no
 * `[data-store-id]` wrapper, and forty `var(--theme-*)` references that every
 * one of them resolved to the empty string — the shop simply stopped at the
 * moment a card number was required, which is the moment trust matters most.
 *
 * Only the form itself is a client component, because the cart lives in the
 * visitor's browser. Every price it shows is re-quoted by the server.
 *
 * @param props - Route and search params
 * @returns The themed checkout page
 */
export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const [{ storeSlug }, search] = await Promise.all([params, searchParams]);

  const result = await loadStorefront(storeSlug, search);
  if (!result.ok) return result.fallback;

  const { store } = result.data;
  const wasCancelled = search.checkout === 'cancelled';

  return (
    <StorefrontShell {...result.data}>
      <StoreBand>
        <StoreContainer>
          <SectionHeading heading="Checkout" level={2} />
          <CheckoutView
            storeId={store.id}
            storeSlug={store.storeSlug}
            storeName={store.storeName}
            currency={store.currency}
            wasCancelled={wasCancelled}
          />
        </StoreContainer>
      </StoreBand>
    </StorefrontShell>
  );
}
