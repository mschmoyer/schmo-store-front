/**
 * Database-backed cart re-pricing and stock validation for storefront checkout (flow B).
 *
 * The browser sends product identities and quantities. Everything else - price, name, SKU, image,
 * category, shippability, stock - is read from the database here. A client-supplied `price` field
 * is ignored entirely; it never reaches {@link computeCartTotals}.
 */

import { renderableImageUrl } from '@/lib/images/renderable';
import type { PoolClient } from 'pg';
import { db } from '@/lib/database/connection';
import { computeCartTotals, normalizeQuantity } from './cart-pricing';
import { validateCouponForCart } from './coupons';
import { toCents } from './money';
import { resolveVariant, variantTitle, type ProductVariant } from '@/lib/catalog/variants';
import { getVariantsForProducts } from '@/lib/catalog/variants.db';
import type {
  ClientCartItem,
  PricedCart,
  PricedLineItem,
  RejectedLineItem,
} from './types';

/** A `products` row joined with its effective stock level. */
interface ProductRow extends Record<string, unknown> {
  id: string;
  sku: string;
  name: string;
  override_name: string | null;
  base_price: string | number;
  sale_price: string | number | null;
  override_price: string | number | null;
  featured_image_url: string | null;
  category_id: string | null;
  requires_shipping: boolean | null;
  is_active: boolean | null;
  track_inventory: boolean | null;
  allow_backorder: boolean | null;
  stock_quantity: number | null;
  shipstation_product_id: string | null;
  inventory_available: string | number | null;
}

/**
 * Effective selling price for a product, in cents.
 *
 * Precedence matches the storefront product API: merchant override, then sale price, then base
 * price.
 *
 * @param row - The product row.
 * @returns Unit price in cents.
 */
export function resolveUnitPriceCents(row: {
  override_price?: string | number | null;
  sale_price?: string | number | null;
  base_price?: string | number | null;
}): number {
  const override = toCents(row.override_price ?? null);
  if (override > 0) return override;

  const sale = toCents(row.sale_price ?? null);
  if (sale > 0) return sale;

  return toCents(row.base_price ?? null);
}

/**
 * Sellable stock for a product.
 *
 * The `inventory` table (synced from ShipStation) wins when it has rows for the SKU; otherwise the
 * denormalized `products.stock_quantity` is used.
 *
 * @param row - The product row, including the joined inventory sum.
 * @returns Available units.
 */
export function resolveAvailableStock(row: ProductRow): number {
  if (row.inventory_available !== null && row.inventory_available !== undefined) {
    const fromInventory = Number.parseInt(String(row.inventory_available), 10);
    if (Number.isFinite(fromInventory)) {
      return fromInventory;
    }
  }
  return row.stock_quantity ?? 0;
}

/**
 * Look up every requested product in one query.
 *
 * Cart entries may carry a `products.id` UUID, a SKU, or a ShipStation product id - the storefront
 * product API returns `shipstation_product_id || id` as `product_id` - so all three are matched.
 *
 * @param storeId - The store the cart belongs to.
 * @param identifiers - Raw identifiers from the client cart.
 * @returns Product rows for the store, with inventory summed per SKU.
 */
async function loadProducts(storeId: string, identifiers: string[]): Promise<ProductRow[]> {
  if (identifiers.length === 0) {
    return [];
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const uuids = identifiers.filter((value) => uuidPattern.test(value));
  const others = identifiers.filter((value) => !uuidPattern.test(value));

  const result = await db.query<ProductRow>(
    `SELECT p.id, p.sku, p.name, p.override_name, p.base_price, p.sale_price, p.override_price,
            p.featured_image_url, p.category_id, p.requires_shipping, p.is_active,
            p.track_inventory, p.allow_backorder, p.stock_quantity, p.shipstation_product_id,
            inv.total_available AS inventory_available
       FROM products p
       LEFT JOIN (
            SELECT store_id, sku, SUM(available)::int AS total_available
              FROM inventory
             GROUP BY store_id, sku
       ) inv ON inv.store_id = p.store_id AND inv.sku = p.sku
      WHERE p.store_id = $1
        AND (
             ($2::uuid[] IS NOT NULL AND p.id = ANY($2::uuid[]))
          OR ($3::text[] IS NOT NULL AND p.sku = ANY($3::text[]))
          OR ($3::text[] IS NOT NULL AND p.shipstation_product_id = ANY($3::text[]))
        )`,
    [storeId, uuids.length > 0 ? uuids : null, others.length > 0 ? others : null]
  );

  return result.rows;
}

/** Options for {@link repriceCart}. */
export interface RepriceCartOptions {
  readonly storeId: string;
  readonly items: readonly ClientCartItem[];
  readonly couponCode?: string | null;
  readonly shippingMethod?: string | null;
  readonly destination?: { state?: string; postalCode?: string; country?: string };
  readonly currency?: string;
}

/**
 * Re-price a cart from the database and compute every total.
 *
 * @param options - Store, client cart, optional coupon code, shipping method and destination.
 * @returns A {@link PricedCart}. Lines that cannot be honoured appear in `rejected`, not `items`.
 */
export async function repriceCart(options: RepriceCartOptions): Promise<PricedCart> {
  const identifiers = options.items.map((item) => String(item.product_id));
  const products = await loadProducts(options.storeId, identifiers);

  const byIdentifier = new Map<string, ProductRow>();
  for (const row of products) {
    byIdentifier.set(row.id.toLowerCase(), row);
    byIdentifier.set(row.sku.toLowerCase(), row);
    if (row.shipstation_product_id) {
      byIdentifier.set(row.shipstation_product_id.toLowerCase(), row);
    }
  }

  // Variants for every product in the cart, in one query rather than per line.
  // Store-scoped, so a variant id from another merchant's catalogue simply is
  // not in this map and the line is rejected below.
  const variantsByProduct = await getVariantsForProducts(
    options.storeId,
    products.map((row) => row.id),
  );
  const variantsById = new Map<string, ProductVariant & { productId: string }>();
  for (const [productId, list] of variantsByProduct) {
    for (const variant of list) variantsById.set(variant.id, { ...variant, productId });
  }

  const items: PricedLineItem[] = [];
  const rejected: RejectedLineItem[] = [];
  // Collapse duplicate cart lines before checking stock.
  //
  // Keyed on product **and** variant: two lines for the same shirt in
  // different sizes are two lines, and collapsing them onto the product would
  // check one size's stock against the other's quantity. A product with no
  // options keys on an empty variant, so its behaviour is unchanged.
  const quantities = new Map<string, { productId: string; variantId: string | null; quantity: number }>();

  for (const clientItem of options.items) {
    const requestedId = String(clientItem.product_id);
    const quantity = normalizeQuantity(clientItem.quantity);

    if (quantity === 0) {
      rejected.push({
        requestedId,
        reason: 'invalid_quantity',
        message: 'Quantity must be a whole number of at least 1.',
      });
      continue;
    }

    const row = byIdentifier.get(requestedId.toLowerCase());
    if (!row) {
      rejected.push({
        requestedId,
        reason: 'not_found',
        message: 'This item is no longer available in this store.',
      });
      continue;
    }

    if (row.is_active === false) {
      rejected.push({
        requestedId,
        reason: 'inactive',
        message: `${row.name} is no longer for sale.`,
      });
      continue;
    }

    // Resolve the chosen variant, if any.
    const requestedVariantId = clientItem.variant_id ? String(clientItem.variant_id) : null;
    let variant: (ProductVariant & { productId: string }) | null = null;

    if (requestedVariantId) {
      const found = variantsById.get(requestedVariantId);
      // The variant must exist, belong to this store (it is not in the map
      // otherwise) *and* belong to the product on this line. Without the last
      // check a shopper could pair a cheap variant id with an expensive
      // product and the line would price at the variant.
      if (!found || found.productId !== row.id) {
        rejected.push({
          requestedId,
          reason: 'not_found',
          message: `That option of ${row.name} is no longer available.`,
        });
        continue;
      }
      if (!found.isActive) {
        rejected.push({
          requestedId,
          reason: 'inactive',
          message: `That option of ${row.name} is no longer for sale.`,
        });
        continue;
      }
      variant = found;
    } else if ((variantsByProduct.get(row.id)?.length ?? 0) > 0) {
      // The product has options and the client did not choose one. Guessing a
      // variant would charge for something the shopper did not pick.
      rejected.push({
        requestedId,
        reason: 'not_found',
        message: `Choose an option for ${row.name} before checking out.`,
      });
      continue;
    }

    const key = `${row.id}:${variant?.id ?? ''}`;
    const existing = quantities.get(key);
    quantities.set(key, {
      productId: row.id,
      variantId: variant?.id ?? null,
      quantity: (existing?.quantity ?? 0) + quantity,
    });
  }

  for (const [, line] of quantities) {
    const { productId, variantId, quantity } = line;
    const row = products.find((product) => product.id === productId);
    if (!row) continue;

    const variant = variantId ? variantsById.get(variantId) ?? null : null;

    // A variant's nullable fields inherit the product's, which is what
    // `resolveVariant` exists to settle. Doing it here rather than inline keeps
    // the storefront's displayed price and the checkout's charged price on the
    // same code path -- the two disagreeing is the defect this guards against.
    const resolved = variant
      ? resolveVariant(variant, {
          basePriceCents: resolveUnitPriceCents(row),
          salePriceCents: null,
          trackInventory: row.track_inventory !== false,
          allowBackorder: row.allow_backorder === true,
        })
      : null;

    const tracksInventory = variant
      ? (variant.trackInventory ?? row.track_inventory !== false)
      : row.track_inventory !== false;
    const allowsBackorder = variant
      ? (variant.allowBackorder ?? row.allow_backorder === true)
      : row.allow_backorder === true;
    // A variant carries its own stock. The `inventory` table is keyed on the
    // product SKU and knows nothing about variants, so it is not consulted for
    // a variant line.
    const available = variant ? variant.stockQuantity : resolveAvailableStock(row);

    if (tracksInventory && !allowsBackorder) {
      if (available <= 0) {
        rejected.push({
          requestedId: productId,
          reason: 'out_of_stock',
          message: `${row.name} is out of stock.`,
          available: 0,
        });
        continue;
      }
      if (quantity > available) {
        rejected.push({
          requestedId: productId,
          reason: 'insufficient_stock',
          message: `Only ${available} of ${row.name} left in stock.`,
          available,
        });
        continue;
      }
    }

    // Zero is a legitimate price. `products.base_price` is `NOT NULL`, so a value of 0 is a
    // deliberate "this is free", not a missing price, and a giveaway must reach checkout like any
    // other line. Only a negative price is nonsense, and that is what this rejects.
    const unitPriceCents = resolved ? resolved.priceCents : resolveUnitPriceCents(row);
    if (unitPriceCents < 0) {
      rejected.push({
        requestedId: productId,
        reason: 'inactive',
        message: `${row.name} is not priced for sale.`,
      });
      continue;
    }

    const title = variant ? variantTitle(variant.options) : null;

    items.push({
      productId: row.id,
      variantId: variant?.id ?? null,
      variantTitle: title && title.length > 0 ? title : null,
      // The warehouse picks by the variant's SKU when there is one.
      sku: variant ? variant.sku : row.sku,
      name: row.override_name || row.name,
      unitPriceCents,
      quantity,
      lineTotalCents: unitPriceCents * quantity,
      imageUrl: renderableImageUrl(variant?.imageUrl ?? row.featured_image_url),
      categoryId: row.category_id,
      requiresShipping: row.requires_shipping !== false,
    });
  }

  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);

  let coupon = null as PricedCart['coupon'];
  if (options.couponCode && items.length > 0) {
    const validation = await validateCouponForCart(
      options.storeId,
      options.couponCode,
      items,
      subtotalCents
    );
    if (validation.valid) {
      coupon = validation.coupon;
    }
  }

  const totals = computeCartTotals({
    items,
    coupon,
    shippingMethod: options.shippingMethod,
    destination: options.destination,
  });

  return {
    items,
    rejected,
    totals,
    coupon,
    shippingMethod: options.shippingMethod ?? 'standard',
    currency: (options.currency ?? 'USD').toUpperCase(),
  };
}

/**
 * Re-check stock for a priced cart inside an open transaction, locking the product rows.
 *
 * Called from the webhook immediately before the order is written, so two shoppers racing for the
 * last unit cannot both succeed.
 *
 * @param client - An open transaction client.
 * @param storeId - The store the cart belongs to.
 * @param items - The server-priced line items.
 * @returns Rejections for any line that can no longer be fulfilled; empty when all lines are fine.
 */
export async function assertStockAvailable(
  client: PoolClient,
  storeId: string,
  items: readonly PricedLineItem[]
): Promise<RejectedLineItem[]> {
  const rejections: RejectedLineItem[] = [];

  for (const item of items) {
    const result = await client.query<{
      name: string;
      stock_quantity: number | null;
      track_inventory: boolean | null;
      allow_backorder: boolean | null;
      inventory_available: string | null;
    }>(
      `SELECT p.name, p.stock_quantity, p.track_inventory, p.allow_backorder,
              (SELECT SUM(available)::int FROM inventory i
                WHERE i.store_id = p.store_id AND i.sku = p.sku) AS inventory_available
         FROM products p
        WHERE p.id = $1 AND p.store_id = $2
        FOR UPDATE OF p`,
      [item.productId, storeId]
    );

    const row = result.rows[0];
    if (!row) {
      rejections.push({
        requestedId: item.productId,
        reason: 'not_found',
        message: `${item.name} no longer exists.`,
      });
      continue;
    }

    if (row.track_inventory === false || row.allow_backorder === true) {
      continue;
    }

    const available =
      row.inventory_available !== null && row.inventory_available !== undefined
        ? Number.parseInt(String(row.inventory_available), 10)
        : (row.stock_quantity ?? 0);

    if (item.quantity > available) {
      rejections.push({
        requestedId: item.productId,
        reason: 'insufficient_stock',
        message: `Only ${available} of ${row.name} left in stock.`,
        available,
      });
    }
  }

  return rejections;
}
