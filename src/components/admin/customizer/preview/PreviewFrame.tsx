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
 * 3. **The viewport switcher resizes the element**, in real CSS pixels, rather
 *    than scaling it with a transform, so the storefront's own media queries
 *    fire exactly as they will for a visitor.
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

/** Real device widths. The iframe is set to these, not scaled to them. */
export const VIEWPORTS: Record<ViewportId, { label: string; width: number | null; height: number | null }> =
  {
    desktop: { label: 'Desktop', width: null, height: null },
    tablet: { label: 'Tablet', width: 834, height: 1112 },
    mobile: { label: 'Mobile', width: 390, height: 844 },
  };

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

  const size = VIEWPORTS[viewport];

  return (
    <div className={styles.canvas}>
      <div className={styles.frameWrap}>
        <div
          className={styles.frameShell}
          style={{
            width: size.width ? `${size.width}px` : '100%',
            height: size.height ? `min(${size.height}px, 100%)` : '100%',
            maxWidth: '100%',
          }}
        >
          {!ready ? (
            <div className={styles.frameOverlay}>
              <Spinner size="md" />
              <span>Loading your storefront…</span>
            </div>
          ) : null}

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

          {handshakeTimedOut && !ready ? (
            <div className={styles.frameNotice} role="status">
              <IconAlertTriangle size={15} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
              <span>
                The storefront has not answered the preview handshake. Your changes are still being
                saved to the draft — the preview will catch up once the renderer is available.
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
