/**
 * Publishing one custom page.
 *
 *   POST    /api/admin/pages/[slug]/publish  - copy the draft over the published row
 *   DELETE  /api/admin/pages/[slug]/publish  - unpublish, keeping the draft
 *
 * Unpublishing is deliberately **not** deletion. Taking a page off the shop and
 * throwing it away are different decisions, and conflating them loses copy a
 * merchant wrote. Deleting has its own endpoint one level up.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { publishPage, unpublishPage } from '@/lib/storefront-theme/pages.db';

import {
  badRequest,
  resolveStoreId,
  unauthorized,
} from '../../../storefront-theme/auth';

export const dynamic = 'force-dynamic';

/**
 * Resolve the authenticated store, or the response to send instead.
 * @param request - Incoming request
 * @returns The store id, or a response
 */
async function requireStore(request: NextRequest): Promise<string | NextResponse> {
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    return resolved;
  } catch {
    return unauthorized();
  }
}

/**
 * Publish a page.
 * @param request - Incoming request
 * @param context - Route params carrying the slug
 * @returns The published page, or 404 when there is no draft to publish
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const store = await requireStore(request);
  if (typeof store !== 'string') return store;

  const { slug } = await context.params;

  try {
    const page = await publishPage(store, slug);
    if (!page) {
      return NextResponse.json({ success: false, error: 'Page not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { page } });
  } catch (error) {
    console.error('Failed to publish store page:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to publish the page.' },
      { status: 500 },
    );
  }
}

/**
 * Unpublish a page, keeping its draft.
 * @param request - Incoming request
 * @param context - Route params carrying the slug
 * @returns 200 when a published row was removed, 404 when there was none
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const store = await requireStore(request);
  if (typeof store !== 'string') return store;

  const { slug } = await context.params;

  try {
    const removed = await unpublishPage(store, slug);
    if (!removed) {
      return NextResponse.json(
        { success: false, error: 'That page is not published.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: { slug } });
  } catch (error) {
    console.error('Failed to unpublish store page:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to unpublish the page.' },
      { status: 500 },
    );
  }
}
