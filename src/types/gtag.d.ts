/**
 * Ambient declaration for the Google Analytics `gtag` function.
 *
 * `gtag` is installed on `window` by the Google Analytics snippet, so it is
 * absent until that script loads and every call site must check for it first.
 */
declare global {
  interface Window {
    gtag?: (command: string, eventName: string, params?: Record<string, unknown>) => void;
  }
}

export {};
