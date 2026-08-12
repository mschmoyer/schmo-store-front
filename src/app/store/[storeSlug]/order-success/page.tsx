import type { Metadata } from 'next';

import { StorefrontShell } from '@/components/store/StorefrontShell';
import { OrderConfirmation } from '@/components/store/checkout/OrderConfirmation';
import { StoreBand, StoreContainer } from '@/components/store/ui';

import { loadStorefront, type SearchParams } from '../../_lib/load';

interface OrderSuccessPageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  title: 'Order confirmed',
  // A receipt is personal and must never be indexed.
  robots: { index: false, follow: false },
};

/**
 * The order confirmation page.
 *
 * Server-rendered inside `StorefrontShell` so the last thing a shopper sees is
 * still the shop they bought from. Previously this page had no chrome at all —
 * a floating white card on a white page, no store name, no header, no footer —
 * and its error branch offered no link out, so a shopper whose confirmation
 * failed was left on a dead end with no way back to the merchant.
 *
 * The confirmation itself is a client component because it polls the server
 * while Stripe's webhook lands.
 *
 * @param props - Route and search params
 * @returns The themed confirmation page
 */
export default async function OrderSuccessPage({ params, searchParams }: OrderSuccessPageProps) {
  const [{ storeSlug }, search] = await Promise.all([params, searchParams]);

  const result = await loadStorefront(storeSlug, search);
  if (!result.ok) return result.fallback;

  const { store } = result.data;
  const raw = search.session_id;
  const sessionId = (Array.isArray(raw) ? raw[0] : raw) ?? null;

  return (
    <StorefrontShell {...result.data}>
      <StoreBand>
        <StoreContainer width="narrow">
          <OrderConfirmation
            storeSlug={store.storeSlug}
            storeName={store.storeName}
            sessionId={sessionId}
          />
        </StoreContainer>
      </StoreBand>
    </StorefrontShell>
  );
}
