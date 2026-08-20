import { NextRequest, NextResponse } from 'next/server';

import { getProductsForCart } from '@/app/store/_lib/queries';
import { isPurchasable, stockState } from '@/app/store/_lib/present';
import { resolveVariant } from '@/lib/catalog/variants';
import { getVariantsForProducts } from '@/lib/catalog/variants.db';

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

    const UUID = /^[0-9a-fA-F-]{36}$/;

    // Collapse duplicates and clamp quantities before touching the database.
    //
    // Keyed on product **and** variant, matching `cartLineKey` on the client: a
    // medium and a large of one shirt are two lines, and collapsing them onto
    // the product would clamp one size's quantity against the other's stock.
    const wanted = new Map<
      string,
      { productId: string; variantId: string | null; quantity: number }
    >();

    for (const entry of rawItems.slice(0, 100)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const item = entry as { product_id?: unknown; variant_id?: unknown; quantity?: unknown };
      const id = typeof item.product_id === 'string' ? item.product_id : '';
      if (!UUID.test(id)) continue;

      const variantId =
        typeof item.variant_id === 'string' && UUID.test(item.variant_id)
          ? item.variant_id
          : null;

      const key = `${id}::${variantId ?? ''}`;
      const quantity = Math.min(Math.max(Math.floor(Number(item.quantity) || 1), 1), 99);
      const existing = wanted.get(key);
      wanted.set(key, {
        productId: id,
        variantId,
        quantity: Math.min((existing?.quantity ?? 0) + quantity, 99),
      });
    }

    if (wanted.size === 0) {
      return NextResponse.json({ success: true, data: { items: [], removed: [] } });
    }

    const productIds = [...new Set([...wanted.values()].map((line) => line.productId))];
    const products = await getProductsForCart(storeId, productIds);
    const byId = new Map(products.map((product) => [product.id, product]));

    // Store-scoped, so a variant id from another merchant is simply absent and
    // its line is dropped below.
    const variantsByProduct = await getVariantsForProducts(storeId, productIds);

    const items: Record<string, unknown>[] = [];
    const removed: string[] = [];

    for (const [key, line] of wanted) {
      const product = byId.get(line.productId);
      if (!product || !isPurchasable(product)) {
        removed.push(key);
        continue;
      }

      const productVariants = variantsByProduct.get(product.id) ?? [];
      let resolved: ReturnType<typeof resolveVariant> | null = null;

      if (productVariants.length > 0) {
        const chosen = line.variantId
          ? productVariants.find((entry) => entry.id === line.variantId)
          : undefined;
        // The product has options. A line with no variant, or one naming a
        // variant that has since been deleted or hidden, cannot be priced --
        // guessing one would put something in the cart the shopper never chose.
        if (!chosen || !chosen.isActive) {
          removed.push(key);
          continue;
        }
        resolved = resolveVariant(chosen, {
          basePriceCents: Math.round(product.price * 100),
          salePriceCents: null,
          trackInventory: product.trackInventory,
          allowBackorder: product.allowBackorder,
        });
        if (!resolved.isActive) {
          removed.push(key);
          continue;
        }
      } else if (line.variantId) {
        // A variant id on a product that has none: stale storage.
        removed.push(key);
        continue;
      }

      const tracks = resolved ? resolved.stockQuantity !== null : product.trackInventory;
      const stock = resolved ? (resolved.stockQuantity ?? 0) : product.stockQuantity;
      const backorder = product.allowBackorder;

      // Never let a line exceed what is actually on the shelf.
      const cap = tracks && !backorder ? Math.max(stock, 0) : 99;
      const quantity = Math.max(1, Math.min(line.quantity, cap || 1));

      items.push({
        product_id: product.id,
        variant_id: resolved?.id ?? null,
        variant_title: resolved?.title || null,
        sku: resolved ? resolved.sku : product.sku,
        name: product.name,
        slug: product.slug,
        price: resolved ? resolved.priceCents / 100 : product.price,
        compare_at_price: resolved
          ? resolved.compareAtCents === null
            ? null
            : resolved.compareAtCents / 100
          : product.compareAtPrice,
        quantity,
        /** True when we had to reduce the line to match stock. */
        quantity_adjusted: quantity !== line.quantity,
        thumbnail_url: resolved?.imageUrl ?? product.featuredImageUrl ?? '',
        stock_state: resolved
          ? resolved.inStock
            ? 'in_stock'
            : 'out_of_stock'
          : stockState(product),
        stock_quantity: stock,
        max_quantity: cap || 1,
      });
    }

    return NextResponse.json({ success: true, data: { items, removed } });
  } catch (error) {
    console.error('[storefront] cart validation failed', error);
    return NextResponse.json(
      { success: false, error: 'Could not validate cart' },
      { status: 500 },
    );
  }
}
