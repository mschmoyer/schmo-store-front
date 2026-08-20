/**
 * Custom storefront pages — collection endpoint.
 *
 *   GET   /api/admin/pages  - list the authenticated store's pages
 *   POST  /api/admin/pages  - create a page
 *
 * Both require a session. Drafts are unpublished work and are never readable
 * without one, and the session is also the multi-tenant boundary: the store is
 * taken from the token, never from the request body, so a caller cannot name
 * somebody else's shop.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { countPages, createPage, listPageSummaries } from '@/lib/storefront-theme/pages.db';
import { createPageBodySchema, MAX_PAGES_PER_STORE } from '@/lib/storefront-theme/pages';
import { PAGE_TEMPLATE_LIST } from '@/lib/storefront-theme/page-templates';

import { badRequest, resolveStoreId, unauthorized, zodFieldErrors } from '../storefront-theme/auth';

export const dynamic = 'force-dynamic';

/**
 * List the authenticated store's pages, plus the starter templates the editor
 * offers when creating one.
 * @param request - Incoming request
 * @returns Page summaries and the template registry
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let storeId: string;
  // The admin needs the slug to link a published page to the live shop. It is
  // not on `AdminSession`, and the customizer already gets it the same way —
  // from the API response rather than from the token.
  let storeSlug = '';
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
    storeSlug = user.storeSlug ?? '';
  } catch {
    return unauthorized();
  }

  try {
    const pages = await listPageSummaries(storeId);
    return NextResponse.json({
      success: true,
      data: { pages, storeSlug, templates: PAGE_TEMPLATE_LIST, maxPages: MAX_PAGES_PER_STORE },
    });
  } catch (error) {
    console.error('Failed to list store pages:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load pages.' },
      { status: 500 },
    );
  }
}

/**
 * Create a draft page.
 *
 * A slug collision is a 409 rather than a 500 — it is an ordinary thing for a
 * merchant to do, and the editor turns it into a field error on the slug input.
 *
 * @param request - Incoming request with a `{ slug, title, sections?, seo? }` body
 * @returns The created draft page
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let storeId: string;
  try {
    const user = await requireAuth(request);
    const resolved = resolveStoreId(user);
    if (!resolved) return badRequest('This account is not linked to a store.');
    storeId = resolved;
  } catch {
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('Request body must be valid JSON.');
  }

  const parsed = createPageBodySchema.safeParse(body);
  if (!parsed.success) {
    return badRequest('The page is not valid.', zodFieldErrors(parsed.error));
  }

  try {
    // Checked before the insert rather than enforced by a constraint: the cap
    // is a product decision that may move, and a merchant hitting it deserves
    // the number in the message rather than a foreign-looking database error.
    const existing = await countPages(storeId);
    if (existing >= MAX_PAGES_PER_STORE) {
      return badRequest(
        `This store already has the maximum of ${MAX_PAGES_PER_STORE} pages. Delete one to add another.`,
      );
    }

    const page = await createPage(storeId, parsed.data);
    if (!page) {
      return NextResponse.json(
        {
          success: false,
          error: `A page with the URL "${parsed.data.slug}" already exists.`,
          fieldErrors: { slug: ['This URL is already used by another page.'] },
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data: { page } }, { status: 201 });
  } catch (error) {
    console.error('Failed to create store page:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create the page.' },
      { status: 500 },
    );
  }
}
