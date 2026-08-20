/**
 * Merchant media library.
 *
 *   GET  /api/admin/media           - list this store's uploaded images
 *   POST /api/admin/media  (multipart, field `file`)  - upload one image
 *
 * This is the door the "Upload Images" button should always have gone through.
 * Before it existed, that button minted an in-browser `blob:` URL and reported
 * success while writing a pointer that existed only in one tab. Uploads now go
 * to real object storage and are recorded per store.
 *
 * Two rules hold the multi-tenant and honesty lines:
 *  - The store comes from the session, never the request, so one merchant can
 *    neither read nor write another's library.
 *  - When no object store is configured the route returns a labelled state
 *    (200 with `configured: false` on GET, 503 on POST) rather than a 500 or a
 *    fake success. The URL box stays usable, so nothing that worked before
 *    breaks.
 */

import { NextRequest, NextResponse } from 'next/server';

import { requireAuth } from '@/lib/auth/session';
import { db } from '@/lib/database';
import { getStorage, storageStatus } from '@/lib/media/storage';
import { sniffImage, MAX_IMAGE_BYTES } from '@/lib/media/image-validation';

import { badRequest, resolveStoreId, unauthorized } from '../storefront-theme/auth';

export const dynamic = 'force-dynamic';

/** How many library items one list request returns. */
const PAGE_SIZE = 60;

interface MediaRow extends Record<string, unknown> {
  id: string;
  url: string;
  filename: string;
  content_type: string;
  bytes: string;
  alt: string | null;
  created_at: string;
}

/**
 * List the authenticated store's uploaded images.
 * @param request - Incoming request
 * @returns The store's media, newest first, plus whether uploads are configured
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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
    const result = await db.query<MediaRow>(
      `SELECT id, url, filename, content_type, bytes, alt, created_at
         FROM store_media
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [storeId, PAGE_SIZE],
    );

    return NextResponse.json({
      success: true,
      data: {
        ...storageStatus(),
        assets: result.rows.map((row) => ({
          id: row.id,
          url: row.url,
          filename: row.filename,
          contentType: row.content_type,
          bytes: Number(row.bytes),
          alt: row.alt,
          createdAt: row.created_at,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to list media:', error);
    return NextResponse.json(
      { success: false, error: 'Could not load your media library.' },
      { status: 500 },
    );
  }
}

/**
 * Upload one image to the authenticated store's library.
 * @param request - Multipart request carrying a `file` field
 * @returns The stored image's URL and metadata
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

  const storage = getStorage();
  if (!storage) {
    // Degrade, do not crash: the merchant can still paste a URL.
    return NextResponse.json(
      {
        success: false,
        error:
          'Image uploads are not configured on this store. Ask your administrator to set BLOB_READ_WRITE_TOKEN, or paste an image URL instead.',
        data: { configured: false },
      },
      { status: 503 },
    );
  }

  let file: File;
  try {
    const form = await request.formData();
    const candidate = form.get('file');
    if (!(candidate instanceof File)) {
      return badRequest('Attach an image in the "file" field.');
    }
    file = candidate;
  } catch {
    return badRequest('Could not read the uploaded file.');
  }

  if (file.size === 0) return badRequest('That file is empty.');
  if (file.size > MAX_IMAGE_BYTES) {
    return badRequest(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Identify by content, not by the client's Content-Type or file name: an
  // upload endpoint that trusts either will store an HTML file as an image.
  const kind = sniffImage(bytes.subarray(0, 16));
  if (!kind) {
    return badRequest('That file is not a supported image (JPEG, PNG, GIF, WebP or AVIF).');
  }

  const key = `stores/${storeId}/${Date.now()}-${randomId()}.${kind.extension}`;

  let stored;
  try {
    stored = await storage.put(key, bytes, kind.contentType);
  } catch (error) {
    console.error('Failed to store uploaded image:', error);
    return NextResponse.json(
      { success: false, error: 'The image could not be uploaded. Try again.' },
      { status: 502 },
    );
  }

  try {
    const inserted = await db.query<{ id: string; created_at: string }>(
      `INSERT INTO store_media (store_id, storage_key, url, filename, content_type, bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [storeId, stored.key, stored.url, safeFilename(file.name), kind.contentType, bytes.length],
    );

    return NextResponse.json({
      success: true,
      data: {
        id: inserted.rows[0].id,
        url: stored.url,
        filename: safeFilename(file.name),
        contentType: kind.contentType,
        bytes: bytes.length,
        createdAt: inserted.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('Stored image but failed to record it:', error);
    return NextResponse.json(
      { success: false, error: 'The image uploaded but could not be saved to your library.' },
      { status: 500 },
    );
  }
}

/**
 * A short random id for an object key, without pulling in a uuid dependency.
 * @returns 12 hex characters
 */
function randomId(): string {
  const raw = new Uint8Array(6);
  globalThis.crypto.getRandomValues(raw);
  return Array.from(raw, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Reduce a client-supplied file name to something safe to store and display.
 * @param name - The original file name
 * @returns A trimmed, control-character-free, capped name
 */
function safeFilename(name: string): string {
  const cleaned = (name || 'image').replace(/[\x00-\x1f]/g, '').trim();
  return cleaned.slice(0, 200) || 'image';
}
