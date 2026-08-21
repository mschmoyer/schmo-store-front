/**
 * `GET /api/platform/customers` — the cross-tenant merchant list.
 *
 * The handler is deliberately thin. Every predicate, every allowlist and every numeric coercion
 * lives in `src/lib/platform/customers.ts`, which is where it can be tested against a real
 * database; a route that builds its own SQL is a route whose SQL nobody reads. What is left here
 * is the three things a route is actually responsible for: proving the caller is a platform
 * operator, turning the query string into validated parameters, and recording that the read
 * happened.
 *
 * This is the one endpoint in the codebase that intentionally reads across tenants, so the guard
 * runs before anything else and a failure returns 401/403 rather than an empty list.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  platformErrorResponse,
  recordAdminAction,
  requirePlatformAdmin,
} from '@/lib/auth/platform-admin';
import { listCustomers, normalizeCustomerListParams } from '@/lib/platform/customers';

/**
 * List every merchant on the platform, paged, filtered and sorted.
 *
 * @param request - The incoming request. `page`, `pageSize`, `q`, `sort`, `dir` and `filter` are
 *                  read from the query string; unrecognised values fall back to their defaults.
 * @returns `{ success: true, data: { customers, pagination, totals } }`, where `totals` covers the
 *          whole filtered set rather than the returned page.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const admin = await requirePlatformAdmin(request);
    const params = normalizeCustomerListParams(request.nextUrl.searchParams);
    const data = await listCustomers(params);

    await recordAdminAction(admin.userId, 'view_customers', undefined, {
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      dir: params.dir,
      filter: params.filter,
      searched: params.q !== null,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return platformErrorResponse(error, 'customers');
  }
}
