/**
 * Storing and reading product images.
 *
 * Every function here takes a store id and puts it in the `WHERE` clause. Media is the kind of
 * thing that feels like it does not need tenancy — it is "just a file" — which is exactly how an
 * enumerable id ends up serving one merchant's product photography to another's admin.
 *
 * Reads come in two shapes deliberately. `readMedia` fetches the bytes and is used by exactly one
 * route; everything else uses `listMedia`, which never selects the `bytes` column. Postgres keeps
 * a large value out of line, so a listing that does not name the column does not read it — but a
 * `SELECT *` would, and a library page pulling every image's bytes to render thumbnails is the
 * failure this separation exists to prevent.
 */

import { createHash } from 'crypto';
import { db } from '@/lib/database/connection';
import { AdminApiError } from '@/lib/api/AdminApiError';
import { probeImage, type ImageFormat } from './image';

/**
 * The largest file accepted, in bytes.
 *
 * Ten megabytes is generous for a catalogue image and small enough that a request body sits
 * comfortably inside a serverless function's memory. A merchant uploading a 40 MB camera original
 * gets told the limit rather than a timeout.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * The largest edge accepted, in pixels.
 *
 * A decompression bomb is a small file that claims enormous dimensions; nothing downstream here
 * decodes the image, but the storefront and the merchant's browser will.
 */
export const MAX_DIMENSION = 8000;

/** A stored image, without its bytes. */
export interface MediaRecord {
  /* The driver's row type is constrained to `Record<string, unknown>`. */
  [key: string]: unknown;
  id: string;
  url: string;
  content_type: ImageFormat;
  byte_size: number;
  width: number | null;
  height: number | null;
  filename: string | null;
  alt_text: string | null;
  created_at: string;
}

/** A stored image with its bytes, for serving. */
export interface MediaBytes {
  [key: string]: unknown;
  bytes: Buffer;
  content_type: ImageFormat;
  checksum: string;
}

/**
 * The public URL for a stored image.
 *
 * Content-addressed, so the URL for a given id never points at different bytes — which is what
 * makes the serving route's immutable cache header true rather than hopeful.
 *
 * @param id - The media row's id.
 * @returns A path the storefront and the admin can both render.
 */
export function mediaUrl(id: string): string {
  return `/api/media/${id}`;
}

/**
 * Store an uploaded image, or return the existing row when this store has uploaded it before.
 *
 * @param storeId - The owning store.
 * @param file - The uploaded file.
 * @param uploadedBy - The user id to attribute it to, when known.
 * @returns The stored image, and whether this call created it.
 * @throws {AdminApiError} When the file is too large, is not an image this platform accepts, or
 *   claims dimensions beyond {@link MAX_DIMENSION}.
 */
export async function storeMedia(
  storeId: string,
  file: File,
  uploadedBy?: string
): Promise<{ media: MediaRecord; created: boolean }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AdminApiError(
      `${file.name || 'That file'} is ${formatSize(file.size)}. The limit is ${formatSize(MAX_UPLOAD_BYTES)}.`,
      413
    );
  }
  if (file.size === 0) {
    throw new AdminApiError(`${file.name || 'That file'} is empty.`, 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  /* Checked against the bytes we actually received rather than the size the client declared: a
   * `Content-Length` is as much a claim as a `Content-Type`. */
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new AdminApiError(
      `${file.name || 'That file'} is ${formatSize(bytes.length)}. The limit is ${formatSize(MAX_UPLOAD_BYTES)}.`,
      413
    );
  }

  const probe = probeImage(bytes);
  if (!probe) {
    throw new AdminApiError(
      `${file.name || 'That file'} is not a JPEG, PNG, GIF or WebP image. ` +
        'SVG files are not accepted because they can carry scripts.',
      415
    );
  }
  if (probe.width > MAX_DIMENSION || probe.height > MAX_DIMENSION) {
    throw new AdminApiError(
      `${file.name || 'That image'} is ${probe.width}×${probe.height}. ` +
        `The limit is ${MAX_DIMENSION} pixels on either edge.`,
      413
    );
  }

  const checksum = createHash('sha256').update(bytes).digest('hex');

  /*
   * `DO UPDATE` on a no-op rather than `DO NOTHING`, so re-uploading a file the merchant already
   * has returns its row instead of an empty result the caller has to go and fetch. `xmax = 0` is
   * how Postgres tells us which branch ran: it is zero only for a row this statement inserted.
   */
  const result = await db.query<MediaRecord & { created: boolean }>(
    `INSERT INTO product_media
       (store_id, checksum, content_type, byte_size, width, height, filename, bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (store_id, checksum) DO UPDATE
       SET filename = COALESCE(product_media.filename, EXCLUDED.filename)
     RETURNING id, content_type, byte_size, width, height, filename, alt_text, created_at,
               (xmax = 0) AS created`,
    [
      storeId,
      checksum,
      probe.format,
      bytes.length,
      probe.width,
      probe.height,
      (file.name || '').slice(0, 255) || null,
      bytes,
      uploadedBy ?? null
    ]
  );

  const { created, ...row } = result.rows[0];
  return { media: { ...row, url: mediaUrl(row.id as string) }, created };
}

/**
 * Read one image's bytes for serving.
 *
 * Not store-scoped, and that is the one deliberate exception in this file: the URL is rendered on
 * a public storefront, where there is no session to scope by. The id is a version-4 UUID, so it is
 * unguessable, and the row carries nothing but the picture the merchant chose to publish.
 *
 * @param id - The media row's id.
 * @returns The bytes and their type, or null when there is no such row.
 */
export async function readMedia(id: string): Promise<MediaBytes | null> {
  const result = await db.query<MediaBytes>(
    'SELECT bytes, content_type, checksum FROM product_media WHERE id = $1',
    [id]
  );
  return result.rows[0] ?? null;
}

/**
 * The store's uploaded images, newest first.
 *
 * @param storeId - The owning store.
 * @param limit - How many to return.
 * @param offset - How many to skip.
 * @returns The images, without their bytes, and the total.
 */
export async function listMedia(
  storeId: string,
  limit = 50,
  offset = 0
): Promise<{ media: MediaRecord[]; total: number }> {
  const [rows, count] = await Promise.all([
    db.query<MediaRecord>(
      `SELECT id, content_type, byte_size, width, height, filename, alt_text, created_at
         FROM product_media
        WHERE store_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [storeId, limit, offset]
    ),
    db.query<{ total: string }>('SELECT COUNT(*) AS total FROM product_media WHERE store_id = $1', [
      storeId
    ])
  ]);

  return {
    media: rows.rows.map((row) => ({ ...row, url: mediaUrl(row.id) })),
    total: Number(count.rows[0]?.total ?? 0)
  };
}

/**
 * Delete one of the store's images, and take its URL out of every product that used it.
 *
 * Doing both in one transaction is the point. Deleting only the row leaves products pointing at a
 * URL that now 404s, and a broken image on a storefront is worse than the image the merchant
 * meant to replace.
 *
 * @param storeId - The owning store.
 * @param id - The media row's id.
 * @returns How many products referenced it, or null when there is no such image in this store.
 */
export async function deleteMedia(storeId: string, id: string): Promise<{ detached: number } | null> {
  return db.transaction(async (client) => {
    const found = await client.query('SELECT id FROM product_media WHERE id = $1 AND store_id = $2', [
      id,
      storeId
    ]);
    if (found.rows.length === 0) return null;

    const url = mediaUrl(id);
    const detached = await client.query(
      `UPDATE products
          SET gallery_images = array_remove(gallery_images, $1),
              featured_image_url = CASE WHEN featured_image_url = $1 THEN NULL
                                        ELSE featured_image_url END,
              updated_at = NOW()
        WHERE store_id = $2
          AND ($1 = ANY(COALESCE(gallery_images, ARRAY[]::text[])) OR featured_image_url = $1)`,
      [url, storeId]
    );

    await client.query('DELETE FROM product_media WHERE id = $1 AND store_id = $2', [id, storeId]);
    return { detached: detached.rowCount ?? 0 };
  });
}

/**
 * Set an image's alt text.
 *
 * @param storeId - The owning store.
 * @param id - The media row's id.
 * @param altText - The description, or null to clear it.
 * @returns The updated image, or null when there is no such image in this store.
 */
export async function setAltText(
  storeId: string,
  id: string,
  altText: string | null
): Promise<MediaRecord | null> {
  const result = await db.query<MediaRecord>(
    `UPDATE product_media SET alt_text = $3
      WHERE id = $1 AND store_id = $2
      RETURNING id, content_type, byte_size, width, height, filename, alt_text, created_at`,
    [id, storeId, altText?.slice(0, 500) || null]
  );
  const row = result.rows[0];
  return row ? { ...row, url: mediaUrl(row.id) } : null;
}

/**
 * A byte count as a person would say it.
 *
 * @param bytes - The count.
 * @returns A short label such as "1.4 MB".
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
