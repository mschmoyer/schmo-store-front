'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import {
  normalizeSections,
  resolveTheme,
  storefrontScope,
  themeToCss,
  type Section,
  type StorefrontThemeInput,
} from '@/lib/storefront-theme';

import { THEME_BLOCK_SENTINEL, rendererVars, themeDataAttributes } from './vars';

interface PreviewBridgeProps {
  /** The store being previewed. Scopes both the token block and the token check. */
  storeId: string;
}

/** The only `source` value we will act on. Anything else is not the customizer. */
const CUSTOMIZER_SOURCE = 'rebelshops-customizer';

/** Messages the customizer may send us (spec section 10). */
type InboundMessage =
  | { source: string; type: 'theme:update'; payload: StorefrontThemeInput }
  | { source: string; type: 'sections:update'; payload: Section[] };

/**
 * The iframe half of the customizer preview protocol (spec section 10).
 *
 * Mounted only when the request carried a valid, store-scoped preview token —
 * the server has already made that decision, so this component's presence in
 * the tree *is* the authorisation. It never fetches a draft itself.
 *
 * **Theme updates are a repaint, not a re-render.** On `theme:update` we
 * recompute the custom-property block with the same engine the server used and
 * swap the text of the existing `<style>` element. The browser restyles; React
 * never runs; there is no network round-trip and no scroll jump. That is what
 * makes dragging a color picker feel instant.
 *
 * **Section updates need structure**, which only the server can produce with
 * real product data. Reordering and hiding are applied immediately by moving
 * DOM nodes, so the common edits still feel live, and a refresh then reconciles
 * content changes against the saved draft.
 *
 * Every inbound message is checked for same-origin and for having actually come
 * from our parent frame before any of it is trusted.
 *
 * @param props.storeId - The store being previewed
 * @returns Nothing; this component is all side effects
 */
export function PreviewBridge({ storeId }: PreviewBridgeProps) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;

    const scope = storefrontScope(storeId);
    const parentWindow = window.parent;
    const selfOrigin = window.location.origin;

    /**
     * Replace the theme-derived half of the storefront style block.
     *
     * The block is laid out as `tokens · renderer vars · SENTINEL · base rules ·
     * merchant CSS`, so rewriting everything up to the sentinel swaps the whole
     * theme while leaving the static rules and the merchant's own CSS intact.
     *
     * @param input - The draft theme pushed by the customizer
     */
    const repaint = (input: StorefrontThemeInput): void => {
      const styleEl = document.getElementById('storefront-theme');
      if (!(styleEl instanceof HTMLStyleElement)) return;

      const theme = resolveTheme(input);
      const head = `${themeToCss(theme, scope)}\n${rendererVars(theme, scope)}\n`;
      const current = styleEl.textContent ?? '';
      const at = current.indexOf(THEME_BLOCK_SENTINEL);
      styleEl.textContent = at === -1 ? head : head + current.slice(at);

      // Attributes drive the rules a custom property cannot select — hover
      // effect, card alignment, header layout.
      const root = document.querySelector<HTMLElement>(`.storefront[data-store-id]`);
      if (root) {
        for (const [name, value] of Object.entries(themeDataAttributes(theme))) {
          root.setAttribute(name, value);
        }
      }
    };

    /**
     * Apply order and visibility from a pushed section list without a reload.
     * @param sections - The draft section list
     * @returns True when the DOM already had every section, so no refresh is needed
     */
    const reorder = (sections: Section[]): boolean => {
      const host = document.querySelector('[data-sections-root]');
      if (!host) return false;

      let complete = true;
      for (const section of sections) {
        const node = host.querySelector<HTMLElement>(
          `[data-section-id="${CSS.escape(section.id)}"]`,
        );
        if (!node) {
          complete = false;
          continue;
        }
        node.hidden = !section.enabled;
        host.appendChild(node);
      }
      return complete;
    };

    const onMessage = (event: MessageEvent): void => {
      // Origin and frame identity, before anything in the payload is read.
      if (event.origin !== selfOrigin) return;
      if (event.source !== parentWindow) return;

      const data = event.data as InboundMessage | null;
      if (!data || typeof data !== 'object' || data.source !== CUSTOMIZER_SOURCE) return;

      if (data.type === 'theme:update') {
        repaint(data.payload);
        return;
      }

      if (data.type === 'sections:update') {
        const { sections } = normalizeSections(data.payload);
        const handled = reorder(sections);
        if (!handled) router.refresh();
      }
    };

    /**
     * Let the customizer select a section by clicking it in the preview.
     * @param event - The originating click
     */
    const onClick = (event: MouseEvent): void => {
      const target = event.target as Element | null;
      const section = target?.closest?.('[data-section-id]');
      if (!(section instanceof HTMLElement)) return;

      parentWindow.postMessage(
        { source: 'rebelshops-storefront', type: 'section:click', id: section.dataset.sectionId },
        selfOrigin,
      );
    };

    window.addEventListener('message', onMessage);
    document.addEventListener('click', onClick);

    parentWindow.postMessage(
      { source: 'rebelshops-storefront', type: 'ready', storeId },
      selfOrigin,
    );

    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('click', onClick);
    };
  }, [storeId, router]);

  return null;
}
