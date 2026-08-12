/**
 * POST /api/admin/storefront-theme/publish
 *
 * Copies the authenticated store's draft over its published row and invalidates
 * the published-theme cache, so the live shop repaints on the next request.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { publishDraft } from '@/lib/storefront-theme/db';
import { auditContrast } from '@/lib/storefront-theme/resolve';

import { badRequest, resolveStoreId, unauthorized } from '../auth';

export const dynamic = 'force-dynamic';

/**
 * Publish the current draft.
 * @param request - Incoming request
 * @returns The newly published theme, or 400 when there is nothing to publish
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

  try {
    const published = await publishDraft(storeId);
    if (!published) {
      return badRequest('There is no draft to publish yet.');
    }

    return NextResponse.json({
      success: true,
      data: {
        storeId,
        theme: published.raw,
        resolvedTheme: published.theme,
        sections: published.sections,
        version: published.version,
        publishedAt: published.publishedAt,
        contrast: auditContrast(published.theme),
      },
    });
  } catch (error) {
    console.error('Failed to publish storefront theme:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to publish the storefront theme.' },
      { status: 500 },
    );
  }
}
