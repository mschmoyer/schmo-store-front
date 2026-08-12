/**
 * Static `next/font/google` declarations for the curated storefront fonts.
 *
 * `next/font/google` is a build-time macro: the family, subsets and weights must
 * be literal arguments to a top-level call. A dynamic `Font(...)` per request
 * does not compile and does not self-host anything. So every curated family is
 * instantiated once, statically, here — Next then subsets and self-hosts all of
 * them and emits one `@font-face` set for the whole app.
 *
 * The storefront layout applies {@link storefrontFontVariables} to its wrapper
 * element; that puts every `--st-font-*` custom property in scope, and the
 * theme engine's `--st-font-heading` / `--st-font-body` simply `var()` into
 * whichever two the merchant picked. Switching fonts in the customizer is then
 * a repaint, not a network request.
 *
 * Keep this file in sync with `fonts.ts` — `assertFontRegistryIsComplete()` and
 * the unit tests enforce that.
 */

import {
  Archivo,
  Bricolage_Grotesque,
  DM_Sans,
  Fraunces,
  Instrument_Serif,
  Inter,
  JetBrains_Mono,
  Lora,
  Manrope,
  Outfit,
  Playfair_Display,
  Plus_Jakarta_Sans,
  Space_Grotesk,
} from 'next/font/google';

import { FONTS } from './fonts';
import { FONT_IDS, type FontId } from './types';

const LATIN = ['latin'] as const;

const inter = Inter({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-inter',
});

const spaceGrotesk = Space_Grotesk({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-space-grotesk',
});

const manrope = Manrope({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-manrope',
});

const dmSans = DM_Sans({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-dm-sans',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-plus-jakarta',
});

const outfit = Outfit({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-outfit',
});

const playfairDisplay = Playfair_Display({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-playfair-display',
});

const fraunces = Fraunces({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-fraunces',
});

const instrumentSerif = Instrument_Serif({
  subsets: [...LATIN],
  display: 'swap',
  weight: '400',
  variable: '--st-font-instrument-serif',
});

const lora = Lora({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-lora',
});

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-bricolage-grotesque',
});

const archivo = Archivo({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-archivo',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: [...LATIN],
  display: 'swap',
  variable: '--st-font-jetbrains-mono',
});

/**
 * The `variable:` values above MUST be written as literals — `next/font/google`
 * is a build-time macro and rejects any computed expression with "Font loader
 * values must be explicitly written literals." Passing `FONTS[id].cssVar` there
 * fails the whole app's compilation, not just this module.
 *
 * That means the literals are duplicated from the `FONTS` registry in
 * `fonts.ts`, so this guard exists to make the duplication safe: if the two ever
 * disagree, the test suite fails instead of the storefront silently rendering in
 * a fallback face. Exported so `__tests__/fonts.test.ts` can assert on it.
 */
export const DECLARED_FONT_CSS_VARS: Record<FontId, string> = {
  inter: '--st-font-inter',
  'space-grotesk': '--st-font-space-grotesk',
  manrope: '--st-font-manrope',
  'dm-sans': '--st-font-dm-sans',
  'plus-jakarta': '--st-font-plus-jakarta',
  outfit: '--st-font-outfit',
  'playfair-display': '--st-font-playfair-display',
  fraunces: '--st-font-fraunces',
  'instrument-serif': '--st-font-instrument-serif',
  lora: '--st-font-lora',
  'bricolage-grotesque': '--st-font-bricolage-grotesque',
  archivo: '--st-font-archivo',
  'jetbrains-mono': '--st-font-jetbrains-mono',
};

/** The class name that binds each curated font's custom property. */
export const STOREFRONT_FONT_CLASSNAMES: Record<FontId, string> = {
  inter: inter.variable,
  'space-grotesk': spaceGrotesk.variable,
  manrope: manrope.variable,
  'dm-sans': dmSans.variable,
  'plus-jakarta': plusJakarta.variable,
  outfit: outfit.variable,
  'playfair-display': playfairDisplay.variable,
  fraunces: fraunces.variable,
  'instrument-serif': instrumentSerif.variable,
  lora: lora.variable,
  'bricolage-grotesque': bricolageGrotesque.variable,
  archivo: archivo.variable,
  'jetbrains-mono': jetbrainsMono.variable,
};

/**
 * Every curated font variable, space-joined.
 *
 * Apply this to the storefront wrapper element:
 * `<div className={`storefront ${storefrontFontVariables}`}>`.
 *
 * All thirteen are declared because the customizer must be able to switch fonts
 * without a reload; Next only ships the subsetted faces that are actually
 * referenced by rendered CSS, so the cost of declaring them all is a handful of
 * `@font-face` rules, not thirteen downloads.
 */
export const storefrontFontVariables: string = FONT_IDS.map(
  (id) => STOREFRONT_FONT_CLASSNAMES[id],
).join(' ');

/**
 * Look up the font variable class for a single font id.
 * @param id - Curated font id
 * @returns The generated class name, or an empty string for unknown ids
 */
export function fontClassName(id: string): string {
  return Object.prototype.hasOwnProperty.call(STOREFRONT_FONT_CLASSNAMES, id)
    ? STOREFRONT_FONT_CLASSNAMES[id as FontId]
    : '';
}
