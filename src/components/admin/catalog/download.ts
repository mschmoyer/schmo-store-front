/**
 * Downloading an authenticated file from the admin.
 *
 * Pointing `window.location` at the export URL would in fact authenticate — the session is an
 * httpOnly cookie the browser sends on a top-level navigation too — but it gives up every failure
 * mode: a 401 or a 500 replaces the merchant's page with a JSON error document, and there is no
 * hook left to show a notification or keep them where they were.
 *
 * So the request is a normal `fetch` and the response becomes an object URL. The server still
 * streams — that is what keeps a serverless function from assembling a large catalogue in memory —
 * and the browser holds the finished file, which it is well suited to.
 */

/**
 * Fetch a file as the signed-in merchant and hand it to the browser as a download.
 *
 * @param url - The endpoint to download from.
 * @param fallbackFilename - Used when the response carries no `Content-Disposition`.
 * @throws Error with a message suitable for showing the merchant.
 */
export async function downloadWithAuth(url: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    /* The error body is JSON even though the success body is a file, so a failure reads as a
     * sentence rather than as a downloaded file containing an error object — which is what a naive
     * implementation hands the merchant. */
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? `Download failed (${response.status})`);
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  /* Revoked on the next tick rather than immediately: revoking synchronously after `click()` can
   * race the browser's own read of the URL, and the download silently produces an empty file. */
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
