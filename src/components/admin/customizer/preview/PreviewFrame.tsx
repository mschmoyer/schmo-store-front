'use client';

/**
 * The preview canvas.
 *
 * Mounts the merchant's real storefront at `/store/{slug}?preview={token}` and
 * talks to it over `postMessage` (spec section 10). Three properties matter:
 *
 * 1. **The `src` never changes while editing.** It is set once from the initial
 *    URL and held in a ref. React re-renders on every keystroke; if `src` were
 *    a prop the iframe would reload and white-flash constantly.
 * 2. **Updates are pushed, not reloaded.** `theme:update` makes the iframe
 *    rewrite its custom-property block — a repaint. The customizer never calls
 *    `location.reload()` on it for a theme change.
 * 3. **The viewport switcher gives the iframe the real device width**, then
 *    scales the whole element down to fit whatever canvas is left over. The
 *    iframe's *layout* viewport is still 1280 (or 834, or 390) CSS pixels, so
 *    the storefront's media queries fire exactly as they will for a visitor —
 *    a `transform` changes how big the result looks, not what the page thinks
 *    it is being rendered into.
 *
 *    This is the one thing worth explaining, because the obvious alternative is
 *    what used to be here: sizing the element to the available space and
 *    calling that "Desktop". At a 1440 window, with a 232 px admin sidebar and
 *    a 360 px rail, "Desktop" was a **738 px** frame — narrow enough that the
 *    storefront collapsed to a hamburger. Tablet, clamped by `max-width: 100%`,
 *    measured the same 738 px, so the two buttons rendered identically. A
 *    merchant designing in "Desktop" had never seen their own navigation. A
 *    scaled-down 1280 is smaller than life; a 738 px frame labelled "Desktop"
 *    is wrong, and wrong is worse.
 *
 * `event.origin` is validated on every inbound message before anything in it is
 * read, and every outbound message is addressed to our own origin explicitly
 * rather than to `'*'`.
 */

import * as React from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';

import { Spinner } from '@/components/ui';
import type { Section, StorefrontThemeInput } from '@/lib/storefront-theme';

import {
  parseStorefrontMessage,
  sectionsUpdateMessage,
  themeUpdateMessage,
} from '../state/messages';
import styles from '../Customizer.module.css';

export type ViewportId = 'desktop' | 'tablet' | 'mobile';

/**
 * Real device widths. The iframe is always given exactly these CSS pixels; when
 * the canvas is narrower, the whole element is scaled down to fit rather than
 * being squeezed into a smaller — and therefore differently laid out — width.
 *
 * `height: null` means "as tall as the canvas allows", which is right for
 * desktop: a desktop browser window has no fixed height, and pretending it does
 * would just add a meaningless scroll boundary.
 */
export const VIEWPORTS: Record<
  ViewportId,
  { label: string; width: number; height: number | null }
> = {
  desktop: { label: 'Desktop', width: 1280, height: null },
  tablet: { label: 'Tablet', width: 834, height: 1112 },
  mobile: { label: 'Mobile', width: 390, height: 844 },
};

/**
 * Smallest the preview is allowed to be drawn.
 *
 * At a 1024 window the canvas left over after the admin sidebar and the rail is
 * about 380 px, which would put a 1280 desktop preview at 29% — technically
 * accurate and completely unreadable. Below this the canvas scrolls sideways
 * instead.
 */
const MIN_SCALE = 0.45;

export interface PreviewFrameProps {
  /** `/store/{slug}?preview={token}`. Read once; later changes are ignored. */
  src: string;
  viewport: ViewportId;
  theme: StorefrontThemeInput;
  sections: Section[];
  /**
   * The merchant clicked a section inside the preview.
   * @param id - The clicked section's id
   */
  onSectionClick: (id: string) => void;
  /** Bumping this number forces one deliberate reload of the iframe. */
  reloadToken: number;
}

/**
 * The live storefront preview.
 * @param props - {@link PreviewFrameProps}
 * @returns An iframe wired to the preview protocol
 */
export function PreviewFrame({
  src,
  viewport,
  theme,
  sections,
  onSectionClick,
  reloadToken,
}: PreviewFrameProps): React.ReactElement {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = React.useState(false);
  const [handshakeTimedOut, setHandshakeTimedOut] = React.useState(false);

  // Pinned so a re-render can never swap the iframe's document.
  const initialSrc = React.useRef(src);

  // Read by the message listener without making it a dependency, so the
  // listener is installed once per mount rather than once per keystroke.
  const latest = React.useRef({ theme, sections });
  latest.current = { theme, sections };

  const onSectionClickRef = React.useRef(onSectionClick);
  onSectionClickRef.current = onSectionClick;

  /**
   * Send a message to the preview, addressed to our own origin.
   * @param message - A customizer protocol message
   */
  const post = React.useCallback((message: object): void => {
    const frame = frameRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(message, window.location.origin);
  }, []);

  React.useEffect(() => {
    const expectedOrigin = window.location.origin;

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const message = parseStorefrontMessage(event.data, event.origin, expectedOrigin);
      if (!message) return;

      if (message.type === 'ready') {
        setReady(true);
        setHandshakeTimedOut(false);
        // The storefront rendered the *saved* draft. Push whatever the merchant
        // has changed since, so a reload never shows stale work.
        post(themeUpdateMessage(latest.current.theme));
        post(sectionsUpdateMessage(latest.current.sections));
        return;
      }

      onSectionClickRef.current(message.id);
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [post]);

  // Reset the handshake when the frame is deliberately reloaded.
  React.useEffect(() => {
    if (reloadToken === 0) return;
    setReady(false);
    const frame = frameRef.current;
    if (frame) frame.src = initialSrc.current;
  }, [reloadToken]);

  // If the renderer never answers, say so rather than showing a dead spinner.
  React.useEffect(() => {
    if (ready) return undefined;
    const timer = window.setTimeout(() => setHandshakeTimedOut(true), 8000);
    return () => window.clearTimeout(timer);
  }, [ready, reloadToken]);

  // The visual push: immediate, on every change, with no debounce. Persistence
  // is debounced separately by the shell.
  React.useEffect(() => {
    if (!ready) return;
    post(themeUpdateMessage(theme));
  }, [theme, ready, post]);

  React.useEffect(() => {
    if (!ready) return;
    post(sectionsUpdateMessage(sections));
  }, [sections, ready, post]);

  /* ---- Fitting the device width into the canvas ------------------------ */

  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [available, setAvailable] = React.useState<{ width: number; height: number } | null>(null);

  React.useEffect(() => {
    const element = wrapRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setAvailable({ width: box.width, height: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const size = VIEWPORTS[viewport];
  // Never scale *up*: a 390 px phone shown at 3× would be a lie in the other
  // direction, and the merchant would be judging type sizes that do not exist.
  // And never below MIN_SCALE — past that the preview is unreadable, and a
  // horizontal scroll over a legible render beats a legible label over an
  // illegible one.
  const scale =
    available && available.width > 0
      ? Math.max(MIN_SCALE, Math.min(1, available.width / size.width))
      : 1;
  const frameHeight =
    size.height ?? (available && available.height > 0 ? Math.round(available.height / scale) : 900);
  const percent = Math.round(scale * 100);

  return (
    <div className={styles.canvas}>
      <div className={styles.frameWrap} ref={wrapRef}>
        <div
          className={styles.frameScaler}
          style={{ width: size.width * scale, height: frameHeight * scale }}
        >
          <div
            className={styles.frameShell}
            style={{
              width: `${size.width}px`,
              height: `${frameHeight}px`,
              transform: scale === 1 ? undefined : `scale(${scale})`,
            }}
            data-viewport={viewport}
            data-viewport-width={size.width}
            data-viewport-scale={scale}
          >
            <iframe
              ref={frameRef}
              className={styles.frame}
              src={initialSrc.current}
              title="Storefront preview"
              // The preview must run same-origin: the protocol is postMessage
              // between two windows of this app, and the token in the URL is what
              // authorises the draft.
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          </div>

          {/* Overlay and notice live in the scaler, not the shell: they cover
              exactly the frame's on-screen footprint, but they are outside the
              transform, so their own type stays at full size however far the
              storefront itself is zoomed out. */}
          {!ready ? (
            <div className={styles.frameOverlay}>
              <Spinner size="md" />
              <span>Loading your storefront…</span>
            </div>
          ) : null}

          {handshakeTimedOut && !ready ? (
            <div className={styles.frameNotice} role="status">
              <IconAlertTriangle
                size={15}
                aria-hidden="true"
                style={{ flex: 'none', marginTop: 1 }}
              />
              <span>
                The storefront has not answered the preview handshake. Your changes are still being
                saved to the draft — the preview will catch up once the renderer is available.
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Say what is actually being rendered. A preview that is 57% of life
          size is fine; a preview that quietly is not the width it claims is
          how a merchant ends up designing for a breakpoint that does not
          exist. */}
      <p className={styles.viewportBadge} aria-live="polite" data-testid="viewport-badge">
        {size.label} · {size.width}px wide
        {percent < 100 ? <span> · shown at {percent}% to fit</span> : null}
      </p>
    </div>
  );
}
