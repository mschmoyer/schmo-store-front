/**
 * The store's image library: upload, and list what has been uploaded.
 *
 * `ImageGalleryManager` has offered a file picker since it was written and has never had anywhere
 * to send a file. Its handler made a `blob:` URL, wrote that into `gallery_images`, and reported
 * "Images uploaded successfully" — a string valid only inside the tab that produced it, gone on
 * reload, and meaningless to every other visitor. This is the route it should always have posted
 * to.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/session';
import { adminErrorResponse, AdminApiError } from '@/lib/api/adminError';
import { listMedia, storeMedia, MAX_UPLOAD_BYTES } from '@/lib/media/store';

/** Images are read from the request body, so this cannot be prerendered. */
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/media
 *
 * The store's uploaded images, newest first. Never selects the bytes.
 *
 * @param request - The incoming request.
 * @returns The library page and its total.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const { media, total } = await listMedia(user.storeId, limit, offset);
    return NextResponse.json({ success: true, media, total, limit, offset });
  } catch (error) {
    return adminErrorResponse(error, 'GET /api/admin/media');
  }
}

/**
 * POST /api/admin/media
 *
 * Upload one or more images as `multipart/form-data` under the field name `files`.
 *
 * Each file is reported on individually. A merchant dragging in twelve photographs, one of which
 * is a PDF, should get eleven images and a sentence about the twelfth — not a rejected batch, and
 * certainly not a green toast covering a partial write.
 *
 * @param request - The incoming request.
 * @returns Per-file outcomes, and the images that were stored.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) throw new AdminApiError('Store not found', 404);

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      throw new AdminApiError('Send the images as multipart/form-data under the field "files".', 415);
    }

    const form = await request.formData();
    const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      throw new AdminApiError('No files were included in the upload.', 400);
    }
    if (files.length > 20) {
      throw new AdminApiError('Upload at most 20 images at a time.', 400);
    }

    const stored: Awaited<ReturnType<typeof storeMedia>>['media'][] = [];
    const failed: { filename: string; reason: string }[] = [];
    let duplicates = 0;

    for (const file of files) {
      try {
        const { media, created } = await storeMedia(user.storeId, file, user.userId);
        stored.push(media);
        if (!created) duplicates += 1;
      } catch (error) {
        /* One bad file does not fail the batch, but it is named rather than silently dropped. */
        failed.push({
          filename: file.name || 'unnamed file',
          reason:
            error instanceof AdminApiError ? error.message : 'Could not be read as an image.'
        });
      }
    }

    return NextResponse.json(
      {
        /* False when nothing was written, whatever the HTTP status. A partial batch is a success
         * with a list of what did not make it; an empty one is not a success at all. */
        success: stored.length > 0,
        media: stored,
        stored: stored.length,
        duplicates,
        failed,
        max_bytes: MAX_UPLOAD_BYTES
      },
      { status: stored.length > 0 ? 201 : 400 }
    );
  } catch (error) {
    return adminErrorResponse(error, 'POST /api/admin/media');
  }
}
