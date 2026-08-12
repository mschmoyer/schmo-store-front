/**
 * Next.js instrumentation hook. Runs once, before any request is served.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

/**
 * Removes a non-functional `localStorage` global from the server runtime.
 *
 * Recent Node versions expose a Web Storage `localStorage` global. When it is
 * enabled without a backing file — which is what `--localstorage-file` with no
 * valid path produces, and what some Node builds do by default — the global
 * exists but its methods do not. Node also prints:
 *
 *     Warning: `--localstorage-file` was provided without a valid path
 *
 * That breaks the guard almost every library uses to detect a browser:
 *
 *     if (typeof localStorage !== 'undefined') localStorage.getItem(key)
 *
 * The `typeof` check now passes on the server, and `.getItem` is undefined, so
 * the call throws. Next.js's own dev overlay contains exactly that pattern
 * (`client/components/react-dev-overlay/.../preferences.js`), so on an affected
 * Node **every page 500s in development** with
 * `TypeError: localStorage.getItem is not a function` — including pages that
 * never touch storage themselves, which makes it look like an application bug.
 *
 * Deleting the broken global restores the assumption all that code is written
 * against: on the server, there is no `localStorage`. A real, working
 * implementation is left alone, so this cannot mask a functioning one.
 *
 * Server-side only. The browser's `localStorage` is untouched.
 *
 * @returns Nothing.
 */
function removeBrokenLocalStorageGlobal(): void {
  const candidate = (globalThis as { localStorage?: unknown }).localStorage;
  if (candidate === undefined || candidate === null) return;

  const usable =
    typeof (candidate as Storage).getItem === 'function'
    && typeof (candidate as Storage).setItem === 'function';
  if (usable) return;

  try {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  } catch {
    // Non-configurable on some runtimes; shadow it with an undefined value so
    // the `typeof` guard still reports "undefined".
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        value: undefined,
        configurable: true,
        writable: true,
      });
    } catch {
      // Nothing further we can do; the warning above explains the symptom.
    }
  }
}

/**
 * Called by Next.js once per server process, before handling requests.
 *
 * @returns A promise that resolves when startup work is done.
 */
export async function register(): Promise<void> {
  removeBrokenLocalStorageGlobal();
}
