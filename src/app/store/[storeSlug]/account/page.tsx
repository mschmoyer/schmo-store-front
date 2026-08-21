import type { Metadata } from 'next';

import { StorefrontShell } from '@/components/store/StorefrontShell';
import {
  SectionHeading,
  StoreBand,
  StoreContainer,
  StoreLinkButton,
  storeUi,
} from '@/components/store/ui';

import { loadStorefront, type SearchParams } from '../../_lib/load';

interface AccountPageProps {
  params: Promise<{ storeSlug: string }>;
  searchParams: Promise<SearchParams>;
}

export const metadata: Metadata = {
  // Nothing here is worth indexing, and a "no accounts yet" page ranking for a
  // merchant's brand name would be actively unhelpful.
  robots: { index: false, follow: false },
};

/**
 * The account page.
 *
 * There are no shopper accounts on this platform: there is no `customers`
 * table, checkout is guest-only, and `orders` carries the buyer as loose
 * columns rather than a foreign key. This page says so.
 *
 * What was here before did not. It rendered "Welcome Back!", a heading reading
 * *My Account*, and three cards styled `cursor: pointer` with no `onClick` and
 * no `href` — then, in body copy addressed to nobody in particular, admitted:
 * *"This is a placeholder account page. In a full implementation, this would
 * show user profile information, order history, saved addresses, payment
 * methods, and account settings."* That text was on a public URL, linked from
 * the header and the footer of **every** merchant's shop. A shopper reading it
 * learns that the shop they are buying from is unfinished; the merchant never
 * wrote it and probably never saw it.
 *
 * The honest version is short, carries the merchant's own chrome and theme
 * rather than the platform's gradients, and points at the two things that do
 * work: the order confirmation email, and the shop itself. It stays linked
 * rather than 404ing, because a shopper who clicks a person icon deserves an
 * answer.
 *
 * It goes when accounts land, and the page is deliberately small so that is a
 * deletion rather than a rewrite.
 *
 * @param props - Route params and search params
 * @returns The themed account page
 */
export default async function StoreAccountPage({ params, searchParams }: AccountPageProps) {
  const { storeSlug } = await params;
  const search = await searchParams;

  const result = await loadStorefront(storeSlug, search);
  if (!result.ok) return result.fallback;

  const base = `/store/${result.data.store.storeSlug}`;

  return (
    <StorefrontShell {...result.data}>
      <StoreBand>
        <StoreContainer width="narrow">
          <SectionHeading
            align="center"
            heading="Accounts are not set up yet"
            subheading="You can order without one. Your confirmation email has your order number and, once it ships, your tracking link — keep it and you have everything an account would have given you."
          />

          <div className={storeUi.actionRow}>
            <StoreLinkButton href={`${base}/products`} size="lg">
              Continue shopping
            </StoreLinkButton>
            <StoreLinkButton href={`${base}/cart`} variant="secondary" size="lg">
              View cart
            </StoreLinkButton>
          </div>
        </StoreContainer>
      </StoreBand>
    </StorefrontShell>
  );
}
