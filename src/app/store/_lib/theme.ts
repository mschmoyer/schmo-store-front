import {
  isPreviewAuthorized,
  presetSections,
  resolveTheme,
  themeFromLegacyName,
  type ResolvedTheme,
  type Section,
} from '@/lib/storefront-theme';
import { getThemeForRender } from '@/lib/storefront-theme/db';

import type { StoreRecord } from './types';
import type { StoreNavigation } from '@/lib/storefront-theme';

/**
 * Deciding which theme a storefront request renders.
 *
 * Three sources, in order:
 *
 *  1. A **draft**, but only when the request carries a valid preview token
 *     scoped to this exact store (spec section 10). Drafts are otherwise
 *     unreachable.
 *  2. The store's **published** theme row.
 *  3. The legacy `stores.theme_name`, mapped onto a modern preset by the engine
 *     (spec section 9), so the ten old color swatches keep working and every
 *     existing shop still looks deliberate on first render.
 *
 * All of this happens server-side inside the store layout, so the resolved
 * custom-property block ships with the first byte and there is no flash.
 */

export interface StorefrontRenderTheme {
  theme: ResolvedTheme;
  sections: Section[];
  /**
   * The merchant's header and footer menus.
   *
   * An **absent** menu means "derive one from the categories", which is what
   * every store did before navigation was editable; an **empty** menu is a
   * merchant deliberately turning theirs off. `navigation.ts` keeps the two
   * apart, and so must every layer between here and the header.
   */
  navigation: StoreNavigation;
  /** True when the draft is being rendered behind a valid preview token. */
  isPreview: boolean;
  /** Where the theme came from. Useful in tests and for the preview badge. */
  source: 'draft' | 'published' | 'legacy';
}

/**
 * Resolve the theme and section list for one storefront request.
 *
 * Never throws: a broken or missing theme row falls back to the legacy mapping
 * and then to the shipped defaults, because a theming problem must degrade to a
 * plain-looking shop, never to a blank page.
 *
 * @param store - The store being rendered
 * @param previewToken - The raw `?preview=` query value, if any
 * @returns The resolved theme, the ordered sections, and where they came from
 */
export async function getStorefrontTheme(
  store: StoreRecord,
  previewToken?: string | null,
): Promise<StorefrontRenderTheme> {
  const wantsDraft = previewToken ? await isPreviewAuthorized(store.id, previewToken) : false;

  try {
    const record = await getThemeForRender(store.id, wantsDraft);
    if (record) {
      return {
        theme: record.theme,
        navigation: record.navigation,
        // A row with no sections falls back to the *preset's* page, not to one
        // generic list: the composition is part of the look the merchant chose.
        sections:
          record.sections.length > 0 ? record.sections : presetSections(record.theme.preset),
        isPreview: wantsDraft,
        source: wantsDraft ? 'draft' : 'published',
      };
    }
  } catch (error) {
    // A missing table or an unreadable row must not take the shop down.
    console.error('[storefront] theme lookup failed, falling back to legacy mapping', error);
  }

  const legacy = themeFromLegacyName(store.themeName);
  return {
    theme: resolveTheme(legacy),
    // No stored row, so no stored menu either: the header derives one.
    navigation: {},
    sections: presetSections(legacy.preset),
    isPreview: wantsDraft,
    source: 'legacy',
  };
}

/**
 * Read the `?preview=` parameter out of a route's resolved search params.
 * @param searchParams - The route's search params object
 * @returns The token string, or null
 */
export function readPreviewToken(
  searchParams: Record<string, string | string[] | undefined> | undefined,
): string | null {
  const raw = searchParams?.preview;
  const token = Array.isArray(raw) ? raw[0] : raw;
  return typeof token === 'string' && token.length > 0 ? token : null;
}
