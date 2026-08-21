/**
 * `GET /api/platform/customers/[storeId]/orders` — one merchant's orders, paged.
 *
 * The detail endpoint carries only the ten most recent orders; this is where an operator goes to
 * read the rest. It shares the detail route's two-way failure handling — 400 for a malformed id,
 * 404 for a store that does not exist — because "no orders" and "no such store" must not look the
 * same. An existing store with nothing to show returns an empty array beside honest pagination
 * numbers, which is a fact rather than an error.
 *
 * Both the count and the page are scoped by `store_id`; `status` is a bound parameter, never an
 * interpolated literal.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  recordAdminAction,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { validateUUID } from '@/lib/database/connection';
import {
  listCustomerOrders,
  normalizeCustomerOrdersParams,
  storeExists,
} from '@/lib/platform/customers';

/**
 * List one merchant's orders.
 *
 * @param request - The incoming request. `page`, `pageSize` and `status` are read from the query
 *                  string; `page` and `pageSize` are clamped, `status` narrows to one
 *                  `orders.status` value.
 * @param context - Route context whose `params` promise resolves to the `storeId` segment.
 * @returns `{ success: true, data: { orders, pagination } }` for a known store, 400 for a
 *          malformed id, 404 for an unknown one.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> }
): Promise<NextResponse> {
  try {
    const admin = await requirePlatformAdmin(request);
    const { storeId } = await context.params;

    if (!validateUUID(storeId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid store id' },
        { status: 400 }
      );
    }

    if (!(await storeExists(storeId))) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    const params = normalizeCustomerOrdersParams(request.nextUrl.searchParams);
    const data = await listCustomerOrders(storeId, params);

    await recordAdminAction(admin.userId, 'view_customer_orders', { type: 'store', id: storeId }, {
      page: params.page,
      pageSize: params.pageSize,
      status: params.status,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return platformErrorResponse(error, 'customer orders');
  }
}
