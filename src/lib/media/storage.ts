/**
 * Object storage for merchant image uploads.
 *
 * Until this existed, every image field on the platform was a URL text box and
 * the "Upload Images" button minted an in-browser `blob:` URL, showed a green
 * "uploaded successfully" toast, and persisted a pointer that existed only in
 * that one tab — which then 500'd the storefront when rendered. A merchant who
 * is not technical, and does not own an image CDN, had no way to get their own
 * photographs onto their shop.
 *
 * This is the storage boundary. It is an interface with one real adapter today
 * (Vercel Blob, the deployment target's zero-config store) reached over its REST
 * API so no SDK dependency is added. The load-bearing rule, per this codebase's
 * working rules, is that an unconfigured integration **degrades** rather than
 * crashing: `getStorage()` returns null when no store is configured, callers
 * return a labelled "not configured" state, and the URL box stays available so
 * today's behaviour is preserved exactly. Nothing here throws at import time,
 * which the `JWT_SECRET` incident in CLAUDE.md is a standing reminder to avoid.
 */

/** A stored object's public URL and the key it lives under. */
export interface StoredObject {
  url: string;
  key: string;
}

/** A pluggable object store. */
export interface StorageAdapter {
  /** Human name of the backing store, for status reporting. */
  readonly driver: string;
  /**
   * Store bytes under a key and return their public URL.
   * @param key - Path-like key, already namespaced by store
   * @param body - The file bytes
   * @param contentType - The validated content type
   */
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject>;
}

/**
 * Vercel Blob over its REST API.
 *
 * The SDK (`@vercel/blob`) is not a dependency; the PUT it performs is a single
 * authenticated request, so calling the API directly keeps the dependency
 * surface flat. Public access is requested so the storefront can render the
 * result through `next/image`.
 */
class VercelBlobAdapter implements StorageAdapter {
  readonly driver = 'vercel-blob';

  constructor(private readonly token: string) {}

  /**
   * @param key - Object key
   * @param body - File bytes
   * @param contentType - Validated content type
   * @returns The stored object's public URL and key
   */
  async put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject> {
    const response = await fetch(`https://blob.vercel-storage.com/${encodeURI(key)}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${this.token}`,
        'x-content-type': contentType,
        'x-add-random-suffix': '1',
        // The store is only ever handed content already validated by
        // `sniffImage`, so the content type is trustworthy here.
        'content-type': contentType,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Blob upload failed with ${response.status}`);
    }

    const result = (await response.json()) as { url?: string };
    if (!result.url) throw new Error('Blob upload returned no URL');
    return { url: result.url, key };
  }
}

/**
 * The configured storage adapter, or null when none is configured.
 *
 * Resolved per call rather than memoised so a test (or a deploy that sets the
 * token) does not have to reset a module-level cache.
 *
 * @returns An adapter, or null to signal "not configured"
 */
export function getStorage(): StorageAdapter | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token && token.length > 0) return new VercelBlobAdapter(token);
  return null;
}

/** Whether uploads are available, and which driver serves them. */
export interface StorageStatus {
  configured: boolean;
  driver: string | null;
}

/**
 * Report whether image uploads are configured, for the picker UI to render a
 * labelled state instead of offering a control that cannot work.
 * @returns The storage status
 */
export function storageStatus(): StorageStatus {
  const adapter = getStorage();
  return { configured: adapter !== null, driver: adapter?.driver ?? null };
}
