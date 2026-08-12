/**
 * `/admin/design` — the storefront customizer.
 *
 * A server component whose only job is to bring the curated storefront font
 * faces into scope before handing over to the client shell. `next/font/google`
 * is a build-time macro, so `storefrontFontVariables` can only be read from the
 * server; without it the font picker would preview thirteen families in the
 * same fallback face.
 *
 * The class it produces is passed down as a *prop* and applied only to the font
 * sample text, never to the page. The customizer's chrome reads RebelShops
 * tokens; the merchant's `--st-*` tokens stay behind the preview iframe, which
 * is the boundary the spec asks for.
 */

import type { Metadata } from 'next';

import { Customizer } from '@/components/admin/customizer';
import { storefrontFontVariables } from '@/lib/storefront-theme/fonts.next';

export const metadata: Metadata = {
  title: 'Design your storefront',
  description: 'Change how your shop looks and see it live before you publish.',
};

/**
 * The customizer route.
 * @returns The two-panel storefront customizer
 */
export default function DesignPage() {
  return <Customizer fontScopeClassName={storefrontFontVariables} />;
}
