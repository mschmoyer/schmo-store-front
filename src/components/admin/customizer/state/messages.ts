/**
 * The customizer half of the preview protocol (spec section 10).
 *
 * Kept as pure functions with no DOM dependency so the exact payload shape can
 * be asserted in a unit test — this is a contract with another track, and a
 * silent rename here would break their renderer with no compile error.
 *
 * Direction of travel:
 *
 *   parent -> iframe   `{ source: 'rebelshops-customizer', type: 'theme:update',    payload }`
 *                      `{ source: 'rebelshops-customizer', type: 'sections:update', payload }`
 *   iframe -> parent   `{ source: 'rebelshops-storefront', type: 'ready',         storeId }`
 *                      `{ source: 'rebelshops-storefront', type: 'section:click', id }`
 *
 * `event.origin` is checked on both sides. Ours is checked in
 * {@link parseStorefrontMessage}; the iframe's is checked in
 * `src/components/store/theme/PreviewBridge.tsx`.
 */

import type { Section, StorefrontThemeInput } from '@/lib/storefront-theme';

/** The `source` field we stamp on everything we send. */
export const CUSTOMIZER_SOURCE = 'rebelshops-customizer';

/** The `source` field the storefront stamps on everything it sends us. */
export const STOREFRONT_SOURCE = 'rebelshops-storefront';

export interface ThemeUpdateMessage {
  source: typeof CUSTOMIZER_SOURCE;
  type: 'theme:update';
  payload: StorefrontThemeInput;
}

export interface SectionsUpdateMessage {
  source: typeof CUSTOMIZER_SOURCE;
  type: 'sections:update';
  payload: Section[];
}

export type OutboundMessage = ThemeUpdateMessage | SectionsUpdateMessage;

export type InboundMessage =
  | { type: 'ready'; storeId?: string }
  | { type: 'section:click'; id: string };

/**
 * Build the `theme:update` message.
 * @param theme - The working draft theme patch
 * @returns A message ready for `postMessage`
 */
export function themeUpdateMessage(theme: StorefrontThemeInput): ThemeUpdateMessage {
  return { source: CUSTOMIZER_SOURCE, type: 'theme:update', payload: theme };
}

/**
 * Build the `sections:update` message.
 * @param sections - The working draft section list
 * @returns A message ready for `postMessage`
 */
export function sectionsUpdateMessage(sections: Section[]): SectionsUpdateMessage {
  return { source: CUSTOMIZER_SOURCE, type: 'sections:update', payload: sections };
}

/**
 * Validate and narrow a message that arrived from the preview iframe.
 *
 * Returns null for anything that is not a well-formed storefront message from
 * the expected origin — including messages from browser extensions, from other
 * embedded frames, and from a page that merely guessed our `type` strings.
 *
 * @param data - The raw `event.data`
 * @param origin - The raw `event.origin`
 * @param expectedOrigin - The origin the iframe is allowed to speak from
 * @returns The narrowed message, or null when it must be ignored
 */
export function parseStorefrontMessage(
  data: unknown,
  origin: string,
  expectedOrigin: string,
): InboundMessage | null {
  if (origin !== expectedOrigin) return null;
  if (typeof data !== 'object' || data === null) return null;

  const message = data as Record<string, unknown>;
  if (message.source !== STOREFRONT_SOURCE) return null;

  if (message.type === 'ready') {
    return {
      type: 'ready',
      ...(typeof message.storeId === 'string' ? { storeId: message.storeId } : {}),
    };
  }

  if (message.type === 'section:click' && typeof message.id === 'string' && message.id) {
    return { type: 'section:click', id: message.id };
  }

  return null;
}
