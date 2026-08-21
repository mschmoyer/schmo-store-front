/**
 * `GET /api/platform/customers/[storeId]` — one merchant's operator view.
 *
 * Two failure modes matter here and they are different answers:
 *
 * - **A `storeId` that is not a UUID** never reaches the database. `stores.id` is `uuid`, so
 *   passing arbitrary text at it makes Postgres raise `invalid input syntax for type uuid`, which
 *   surfaces as a 500 — an internal fault reported for what is plainly a bad request.
 * - **A well-formed id for a store that does not exist** is a 404 with
 *   `{ success: false, error }`. It is emphatically *not* a 200 carrying an empty detail: a
 *   payload of zeroes reads as "this merchant has done nothing", which is a confident lie about a
 *   merchant who is not there at all.
 *
 * Everything else is delegated: the guard to `requirePlatformAdmin`, the queries to
 * `src/lib/platform/customers.ts`.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  recordAdminAction,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { validateUUID } from '@/lib/database/connection';
import { getCustomerDetail } from '@/lib/platform/customers';

/**
 * Fetch one merchant's full detail: store, owner, orders, catalogue, integrations,
 * customization, traffic and the onboarding checklist.
 *
 * @param request - The incoming request; carries the operator's session.
 * @param context - Route context whose `params` promise resolves to the `storeId` segment.
 * @returns `{ success: true, data }` for a known store, 400 for a malformed id, 404 for an
 *          unknown one.
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

    const data = await getCustomerDetail(storeId);
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Store not found' },
        { status: 404 }
      );
    }

    await recordAdminAction(admin.userId, 'view_customer', { type: 'store', id: storeId });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return platformErrorResponse(error, 'customer detail');
  }
}
