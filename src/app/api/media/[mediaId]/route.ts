/**
 * Serving an uploaded product image.
 *
 * Public, because these URLs are rendered on storefronts where there is no session — the id is an
 * unguessable v4 UUID and the row holds nothing but a picture the merchant chose to publish.
 *
 * Three headers here are load-bearing rather than decorative:
 *
 *   * `Content-Type` comes from the format read out of the file's own bytes at upload, never from
 *     what the uploader claimed.
 *   * `X-Content-Type-Options: nosniff` stops a browser from deciding for itself that a file we
 *     call an image is something executable.
 *   * `Cache-Control: immutable` is true rather than hopeful. Rows are content-addressed, so an id
 *     cannot come to point at different bytes; changing an image means uploading one and getting a
 *     new id.
 */

import { NextRequest, NextResponse } from 'next/server';
import { readMedia } from '@/lib/media/store';

/**
 * GET /api/media/[mediaId]
 *
 * @param request - The incoming request.
 * @param context - Route parameters. The id may carry a file extension, which is ignored — it is
 *   there so a URL pasted into another system looks like the image it is.
 * @returns The image bytes, or 404.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await context.params;
  const id = mediaId.replace(/\.(jpe?g|png|gif|webp)$/i, '');

  /* Checked before the query so a malformed id is a 404 rather than a 22P02 from Postgres. */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const media = await readMedia(id);
  if (!media) {
    return new NextResponse('Not found', { status: 404 });
  }

  /* The checksum is already a strong validator, so a returning browser revalidates with one
   * round trip and no body. */
  const etag = `"${media.checksum}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(media.bytes), {
    status: 200,
    headers: {
      'Content-Type': media.content_type,
      'Content-Length': String(media.bytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      ETag: etag
    }
  });
}
