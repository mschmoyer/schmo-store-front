/**
 * Downloading an authenticated file from the admin.
 *
 * The admin authenticates with a bearer token held in memory, not a cookie, so the obvious
 * approach — pointing `window.location` at the export URL — arrives unauthenticated and 401s. The
 * other obvious approach is putting the token in the query string, which writes a live credential
 * into browser history, the referrer, and every access log between here and the server. Neither is
 * acceptable for a file a merchant downloads several times a day.
 *
 * So the request is a normal authenticated `fetch` and the response becomes an object URL. The
 * server still streams — that is what keeps a serverless function from assembling a large
 * catalogue in memory — and the browser holds the finished file, which it is well suited to.
 */

/**
 * Fetch a file with the session token and hand it to the browser as a download.
 *
 * @param url - The endpoint to download from.
 * @param token - The session token.
 * @param fallbackFilename - Used when the response carries no `Content-Disposition`.
 * @throws Error with a message suitable for showing the merchant.
 */
export async function downloadWithAuth(
  url: string,
  token: string | undefined,
  fallbackFilename: string
): Promise<void> {
  if (!token) {
    throw new Error('Your session has expired. Sign in again.');
  }

  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

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
