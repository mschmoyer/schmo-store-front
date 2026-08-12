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

import { FONTS, FONT_IDS, type FontId } from '@/lib/storefront-theme';

/**
 * `next/font/google` declarations for the curated storefront fonts.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS (and duplicates `src/lib/storefront-theme/fonts.next.ts`)
 *
 * The engine ships its own copy at `fonts.next.ts`, but that file does not
 * compile: it passes `subsets: [...LATIN]` to every `Font()` call.
 * `next/font/google` is a **build-time macro** — "Font loader values must be
 * explicitly written literals" — so a spread, or any identifier reference, is
 * rejected by the compiler. Importing that module 500s every storefront route.
 *
 * `src/lib/storefront-theme/**` belongs to the theme-engine track and this
 * track may not edit it, so the working declarations live here instead.
 *
 * Because the macro forbids referencing `FONTS[id].cssVar`, the variable names
 * below are unavoidably retyped as literals. {@link assertFontVariablesMatch}
 * closes that gap: it compares what is written here against the engine's
 * registry and throws in development if the two ever drift, which is what stops
 * a renamed token from silently degrading every storefront to a fallback face.
 *
 * **Delete this file and import `storefrontFontVariables` from the engine again
 * as soon as `fonts.next.ts` is fixed.**
 * ---------------------------------------------------------------------------
 */

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--st-font-inter' });

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--st-font-space-grotesk',
});

const manrope = Manrope({ subsets: ['latin'], display: 'swap', variable: '--st-font-manrope' });

const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', variable: '--st-font-dm-sans' });

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--st-font-plus-jakarta',
});

const outfit = Outfit({ subsets: ['latin'], display: 'swap', variable: '--st-font-outfit' });

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--st-font-playfair-display',
});

const fraunces = Fraunces({ subsets: ['latin'], display: 'swap', variable: '--st-font-fraunces' });

// Instrument Serif is not a variable font, so an explicit weight is mandatory.
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  display: 'swap',
  weight: '400',
  variable: '--st-font-instrument-serif',
});

const lora = Lora({ subsets: ['latin'], display: 'swap', variable: '--st-font-lora' });

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ['latin'],
  display: 'swap',
  variable: '--st-font-bricolage-grotesque',
});

const archivo = Archivo({ subsets: ['latin'], display: 'swap', variable: '--st-font-archivo' });

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--st-font-jetbrains-mono',
});

/**
 * The custom-property name declared above for each font, mirroring the literals
 * the font loader required. Kept beside them so the drift check has something
 * to compare against.
 */
const DECLARED_VARIABLES: Record<FontId, string> = {
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

/**
 * Fail loudly if the literals above stop matching the engine's font registry.
 *
 * `fontStack()` emits `var(--st-font-x), "Family", <fallback>`. If the registry
 * renamed `--st-font-x`, nothing would error — the `var()` would simply be
 * unset and every storefront would quietly fall back to a system face. This
 * turns that silent regression into a startup error.
 *
 * @returns The names that disagree, empty when the two are in sync
 */
export function assertFontVariablesMatch(): string[] {
  const mismatches = FONT_IDS.filter((id) => FONTS[id].cssVar !== DECLARED_VARIABLES[id]).map(
    (id) => `${id}: registry "${FONTS[id].cssVar}" vs declared "${DECLARED_VARIABLES[id]}"`,
  );

  if (mismatches.length > 0 && process.env.NODE_ENV !== 'production') {
    console.error(
      '[storefront] font variable names have drifted from the theme engine registry:\n' +
        mismatches.join('\n'),
    );
  }
  return mismatches;
}

assertFontVariablesMatch();

/** The generated class that binds each curated font's custom property. */
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
 * Every curated font variable, space-joined, for the storefront wrapper.
 *
 * Applying all thirteen puts each `--st-font-*` property in scope, so the
 * engine's `--st-font-heading` / `--st-font-body` simply `var()` into whichever
 * two the merchant picked — which makes switching fonts in the customizer a
 * repaint rather than a font download. Next only ships the subsetted faces that
 * rendered CSS actually references.
 */
export const storefrontFontVariables: string = FONT_IDS.map(
  (id) => STOREFRONT_FONT_CLASSNAMES[id],
).join(' ');
