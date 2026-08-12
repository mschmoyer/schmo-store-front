import { NextRequest, NextResponse } from 'next/server';

import { getProductsForCart } from '@/app/store/_lib/queries';
import { isPurchasable, stockState } from '@/app/store/_lib/present';

/**
 * `POST /api/stores/[storeId]/cart/validate`
 *
 * Re-price a cart from the database.
 *
 * The storefront cart lives in `localStorage`, which means every number in it
 * is attacker-controlled: a shopper can open devtools and set `price` to `0.01`
 * before checking out. This endpoint is the answer. The client sends only
 * product ids and quantities — the two things it is allowed to have an opinion
 * about — and gets back the authoritative name, price, image and stock for
 * each, which is what the cart then renders and totals.
 *
 * It is deliberately unauthenticated and read-only: it exposes nothing a
 * shopper cannot already see on the product page, and checkout re-quotes
 * independently before taking any money.
 *
 * @param request - Carries `{ items: [{ product_id, quantity }] }`
 * @param context - Route params holding the store id
 * @returns Live line data, plus ids that are no longer purchasable
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    const { storeId } = await context.params;

    if (!/^[0-9a-fA-F-]{36}$/.test(storeId)) {
      return NextResponse.json({ success: false, error: 'Invalid store' }, { status: 400 });
    }

    const body: unknown = await request.json().catch(() => null);
    const rawItems =
      body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)
        ? ((body as { items: unknown[] }).items as unknown[])
        : [];

    // Collapse duplicates and clamp quantities before touching the database.
    const wanted = new Map<string, number>();
    for (const entry of rawItems.slice(0, 100)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const item = entry as { product_id?: unknown; quantity?: unknown };
      const id = typeof item.product_id === 'string' ? item.product_id : '';
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) continue;
      const quantity = Math.min(Math.max(Math.floor(Number(item.quantity) || 1), 1), 99);
      wanted.set(id, Math.min((wanted.get(id) ?? 0) + quantity, 99));
    }

    if (wanted.size === 0) {
      return NextResponse.json({ success: true, data: { items: [], removed: [] } });
    }

    const products = await getProductsForCart(storeId, [...wanted.keys()]);
    const found = new Set(products.map((product) => product.id));

    const items = products
      .filter(isPurchasable)
      .map((product) => {
        const requested = wanted.get(product.id) ?? 1;
        // Never let a line exceed what is actually on the shelf.
        const cap =
          product.trackInventory && !product.allowBackorder
            ? Math.max(product.stockQuantity, 0)
            : 99;
        const quantity = Math.max(1, Math.min(requested, cap || 1));

        return {
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          slug: product.slug,
          price: product.price,
          compare_at_price: product.compareAtPrice,
          quantity,
          /** True when we had to reduce the line to match stock. */
          quantity_adjusted: quantity !== requested,
          thumbnail_url: product.featuredImageUrl ?? '',
          stock_state: stockState(product),
          stock_quantity: product.stockQuantity,
          max_quantity: cap || 1,
        };
      });

    const purchasable = new Set(items.map((item) => item.product_id));
    const removed = [...wanted.keys()].filter(
      (id) => !found.has(id) || !purchasable.has(id),
    );

    return NextResponse.json({ success: true, data: { items, removed } });
  } catch (error) {
    console.error('[storefront] cart validation failed', error);
    return NextResponse.json(
      { success: false, error: 'Could not validate cart' },
      { status: 500 },
    );
  }
}
