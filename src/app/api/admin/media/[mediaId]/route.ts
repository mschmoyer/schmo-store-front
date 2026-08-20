/**
 * One uploaded image: describe it, or remove it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { deleteMedia, setAltText } from '@/lib/media/store';

/**
 * PATCH /api/admin/media/[mediaId]
 *
 * Set the image's alt text, which follows the image rather than the product using it.
 *
 * @param request - The incoming request, with `{ alt_text }`.
 * @param context - Route parameters.
 * @returns The updated image.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ mediaId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const { mediaId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const altText = typeof body.alt_text === 'string' ? body.alt_text.trim() : null;

    const media = await setAltText(user.storeId, mediaId, altText || null);
    if (!media) throw new AdminApiError('Image not found', 404);

    return NextResponse.json({ success: true, media });
  } catch (error) {
    return adminErrorResponse(error, 'PATCH /api/admin/media/[mediaId]');
  }
}

/**
 * DELETE /api/admin/media/[mediaId]
 *
 * Remove the image and detach it from every product that used it, in one transaction.
 *
 * @param request - The incoming request.
 * @param context - Route parameters.
 * @returns How many products stopped referencing it.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ mediaId: string }> }
) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const { mediaId } = await context.params;
    const result = await deleteMedia(user.storeId, mediaId);
    if (!result) throw new AdminApiError('Image not found', 404);

    return NextResponse.json({
      success: true,
      detached_from_products: result.detached,
      message:
        result.detached > 0
          ? `Image deleted and removed from ${result.detached} product${result.detached === 1 ? '' : 's'}.`
          : 'Image deleted.'
    });
  } catch (error) {
    return adminErrorResponse(error, 'DELETE /api/admin/media/[mediaId]');
  }
}
