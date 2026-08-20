/**
 * A single custom page.
 *
 *   GET     /api/admin/pages/[slug]  - read the draft
 *   PUT     /api/admin/pages/[slug]  - update the draft
 *   DELETE  /api/admin/pages/[slug]  - delete the page and its published row
 *
 * The store comes from the session and never from the request, so a caller can
 * never name someone else's shop. That matters more here than on most routes:
 * pages are addressed by a merchant-chosen slug, and `about` exists on
 * thousands of stores.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { deletePage, getDraftPage, updatePage } from '@/lib/storefront-theme/pages.db';
import { updatePageBodySchema } from '@/lib/storefront-theme/pages';
import { normalizeSections } from '@/lib/storefront-theme/sections';

import {
  badRequest,
  resolveStoreId,
  unauthorized,
  zodFieldErrors,
} from '../../storefront-theme/auth';

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
 * Read a draft page.
 * @param request - Incoming request
 * @param context - Route params carrying the slug
 * @returns The draft page, or 404
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const store = await requireStore(request);
  if (typeof store !== 'string') return store;

  const { slug } = await context.params;

  try {
    const page = await getDraftPage(store, slug);
    if (!page) {
      return NextResponse.json({ success: false, error: 'Page not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { page } });
  } catch (error) {
    console.error('Failed to read store page:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load the page.' },
      { status: 500 },
    );
  }
}

/**
 * Update a draft page. Absent fields are left alone; the slug is not updatable.
 * @param request - Incoming request with a `{ title?, sections?, seo? }` body
 * @param context - Route params carrying the slug
 * @returns The updated draft
 */
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const store = await requireStore(request);
  if (typeof store !== 'string') return store;

  const { slug } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const parsed = updatePageBodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('The page is not valid.', zodFieldErrors(parsed.error));
  }

  // Sections are normalised rather than rejected, exactly as the home page's
  // save does: a stale editor build sending a section type this build does not
  // know must not lock the merchant out of saving their other edits.
  let sections = parsed.data.sections;
  let problems: string[] = [];
  if (sections !== undefined) {
    const normalized = normalizeSections(sections);
    sections = normalized.sections;
    problems = normalized.problems;
  }

  try {
    const page = await updatePage(store, slug, { ...parsed.data, sections });
    if (!page) {
      return NextResponse.json({ success: false, error: 'Page not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { page, problems } });
  } catch (error) {
    console.error('Failed to update store page:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save the page.' },
      { status: 500 },
    );
  }
}

/**
 * Delete a page entirely — its draft and its published row.
 *
 * Taking a page off the shop without throwing it away is a different action,
 * and it has its own endpoint (`DELETE .../publish`). Conflating the two would
 * lose copy a merchant wrote.
 *
 * @param request - Incoming request
 * @param context - Route params carrying the slug
 * @returns 200 on delete, 404 when the page is not this store's
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const store = await requireStore(request);
  if (typeof store !== 'string') return store;

  const { slug } = await context.params;

  try {
    const removed = await deletePage(store, slug);
    if (!removed) {
      return NextResponse.json({ success: false, error: 'Page not found.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { slug } });
  } catch (error) {
    console.error('Failed to delete store page:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete the page.' },
      { status: 500 },
    );
  }
}
