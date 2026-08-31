/**
 * Design-system mapping for Clerk's hosted `<SignIn />` and `<SignUp />`.
 *
 * Colours are **literal hexes, not `var(--token)`**: Clerk derives a whole ramp from each colour
 * scale by parsing it, and a CSS variable is opaque to that math. Hard-coding is safe precisely
 * because the product pins `data-theme="light"` on `<html>` (see the root layout) — there is one
 * palette to match and it cannot swap under the widget at runtime. Values are the light-theme
 * resolutions of the semantic aliases in `globals.css`.
 *
 * Font families stay as `var(--font-*)` because those are inherited, not parsed: the root layout
 * mounts them on `<html>`, so the widget picks up Inter without a second webfont request.
 *
 * Kept deliberately short. Theming Clerk's internals element-by-element is a losing fight; the bar
 * is legible and recognisably ours, not pixel-identical to a hand-built form.
 */
import type { ClerkAppearanceTheme } from '@clerk/shared/types';

/** `--text` / `--accent-solid`. The accent is the ink; the palette has no brand hue. */
const INK = '#111214';
/** `--text-muted`. */
const INK_MUTED = '#6b6f76';
/** `--border`. */
const HAIRLINE = '#e5e5e7';
/** `--surface-sunken`, for muted fills. */
const SUNKEN = '#fafafa';

/** The shared `appearance` object. Frozen: two surfaces render with this same instance. */
export const clerkAppearance: ClerkAppearanceTheme = Object.freeze({
  variables: {
    colorPrimary: INK,
    colorPrimaryForeground: '#ffffff',
    colorForeground: INK,
    colorMuted: SUNKEN,
    colorMutedForeground: INK_MUTED,
    colorBackground: '#ffffff',
    colorInput: '#ffffff',
    colorInputForeground: INK,
    colorBorder: HAIRLINE,
    colorRing: INK,
    colorDanger: '#b42318',
    colorSuccess: '#0f7b4a',
    colorWarning: '#b45309',
    fontFamily: 'var(--font-sans)',
    fontFamilyButtons: 'var(--font-sans)',
    fontFamilyMono: 'var(--font-mono)',
    // --radius-sm. Clerk scales its other radii off this one.
    borderRadius: '8px',
  },
  elements: {
    // The card chrome is ours (AuthScreen.module.css `.card`); two nested cards read as a bug.
    cardBox: { boxShadow: 'none', border: 'none' },
    card: { boxShadow: 'none', border: 'none', background: 'transparent' },
    footer: { background: 'transparent' },
    formButtonPrimary: { textTransform: 'none', fontWeight: 600 },
  },
});
