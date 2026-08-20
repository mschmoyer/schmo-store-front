/**
 * Product options and variants.
 *
 *   GET  /api/admin/products/[productId]/variants  - read them
 *   PUT  /api/admin/products/[productId]/variants  - replace them
 *
 * Both require a session, and the store comes from that session rather than
 * from the request — a caller can never name somebody else's shop. The product
 * is checked to belong to that store inside `replaceProductVariants`, in the
 * same transaction as the write, so a product id from another tenant cannot
 * have variants attached to it.
 *
 * `PUT` replaces the whole set rather than accepting a patch. A variant grid is
 * edited as a grid — a merchant adds a size, renames a colour and deletes two
 * rows in one sitting — and reconstructing that as a patch stream is more ways
 * to be wrong for no benefit.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { saveVariantsBodySchema } from '@/lib/catalog/variant-schema';
import {
  getProductOptions,
  getProductVariants,
  replaceProductVariants,
} from '@/lib/catalog/variants.db';

import {
  badRequest,
  resolveStoreId,
  unauthorized,
  zodFieldErrors,
} from '../../../storefront-theme/auth';

export const dynamic = 'force-dynamic';

/**
 * Read a product's options and variants.
 *
 * Includes inactive variants: this is the editor's view, and a merchant who has
 * hidden a variant still needs to see it to bring it back.
 *
 * @param request - Incoming request
 * @param context - Route params carrying the product id
 * @returns The product's options and variants
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
): Promise<NextResponse> {
  let storeId: string;
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
  } catch {
    return unauthorized();
  }

  const { productId } = await context.params;

  try {
    const [options, variants] = await Promise.all([
      getProductOptions(storeId, productId),
      getProductVariants(storeId, productId, true),
    ]);
    return NextResponse.json({ success: true, data: { options, variants } });
  } catch (error) {
    console.error('Failed to read product variants:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load variants.' },
      { status: 500 },
    );
  }
}

/**
 * Replace a product's options and variants.
 *
 * @param request - Incoming request with a `{ options, variants }` body
 * @param context - Route params carrying the product id
 * @returns The stored options and variants
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
): Promise<NextResponse> {
  let storeId: string;
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
  } catch {
    return unauthorized();
  }

  const { productId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const parsed = saveVariantsBodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('These variants are not valid.', zodFieldErrors(parsed.error));
  }

  try {
    const saved = await replaceProductVariants(
      storeId,
      productId,
      parsed.data.options,
      parsed.data.variants,
    );
    return NextResponse.json({ success: true, data: saved });
  } catch (error) {
    // The product not belonging to this store is a 404, not a 500: it is an
    // ordinary outcome of a stale tab, and it must read the same as a product
    // that does not exist so this endpoint cannot be used to discover which
    // ids are real in other stores.
    if (error instanceof Error && error.message === 'Product not found in this store') {
      return NextResponse.json(
        { success: false, error: 'Product not found.' },
        { status: 404 },
      );
    }

    // A SKU colliding with one already used elsewhere in this store is the
    // merchant's mistake, so it gets a field error rather than a 500. The
    // in-payload duplicate case is caught by the schema; this is the
    // across-products case, which only the database knows about.
    if (
      error instanceof Error &&
      /product_variants_store_sku_key/.test(error.message)
    ) {
      return badRequest('One of these SKUs is already used by another product in this store.', {
        variants: ['A SKU here is already used elsewhere in your catalogue.'],
      });
    }

    console.error('Failed to save product variants:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save variants.' },
      { status: 500 },
    );
  }
}
