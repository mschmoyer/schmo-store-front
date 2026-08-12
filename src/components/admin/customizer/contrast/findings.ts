/**
 * The contrast guardrail.
 *
 * Two different things can go wrong with a merchant's palette, and they need
 * different words:
 *
 * 1. **A failure.** A pair the engine cannot rescue — in practice this means
 *    the merchant pinned `colorOnBrand` by hand to something illegible, since
 *    every other ink is auto-derived. Publishing this ships an unreadable shop,
 *    so it blocks publish and offers the accessible value as a one-click fix.
 *
 * 2. **An adjustment.** The merchant picked a colour, the engine lifted it to
 *    clear 4.5:1, and the shop therefore does *not* render the hex they typed.
 *    Nothing is broken, but silently ignoring someone's input is how a tool
 *    loses trust — so we say so, show both swatches, and offer to adopt it.
 *
 * All the maths lives in the engine (`auditContrast`, `deriveTokens`,
 * `contrastRatio`). This module only decides which control each result belongs
 * next to and how to phrase it.
 */

import {
  CONTRAST_UI,
  adjustLightness,
  auditContrast,
  contrastRatio,
  deriveTokens,
  isDark,
  resolveTheme,
  type StorefrontThemeInput,
} from '@/lib/storefront-theme';

/**
 * Severity of a finding.
 *
 * - `fail` — publishing this ships something unreadable. Blocks publish.
 * - `warn` — publishing this ships something legible but *invisible*: a pale
 *   brand on a pale page gives a button with a readable label and no findable
 *   edge. WCAG 1.4.11 (non-text contrast) is a real requirement, but a brand
 *   colour is the merchant's to choose, so this warns loudly and does not block.
 * - `adjusted` — the engine silently changed a value and is saying so.
 */
export type ContrastLevel = 'fail' | 'warn' | 'adjusted';

export interface ContrastFinding {
  /** Stable key for React and for tests. */
  id: string;
  level: ContrastLevel;
  /** Dotted theme path of the control this belongs beside. */
  path: string;
  /** One short line, shown on the collapsed control. */
  title: string;
  /** The explanation and the way out. Never a scold. */
  detail: string;
  /** The merchant's colour, when the finding is about one. */
  from?: string;
  /** The colour that would fix it. */
  to?: string;
  /**
   * Applying this patch resolves the finding. A `null` value means *remove*
   * the field, handing the choice back to the engine — `hexColorSchema` has no
   * representation for "unset", so it cannot be an empty string.
   */
  fix?: { path: string; value: string | null };
}

/** Which control each `auditContrast` pair belongs beside, and how to explain it. */
const PAIR_ADVICE: Record<
  string,
  { path: string; title: string; advise: (ratio: number, required: number) => string }
> = {
  'text on surface': {
    path: 'brand.text',
    title: 'Body text is hard to read',
    advise: (ratio) =>
      `Your text colour is ${ratio}:1 against your page background — it needs 4.5:1. Try a darker text colour or a lighter page background.`,
  },
  'text on raised surface': {
    path: 'brand.surfaceRaised',
    title: 'Text on cards is hard to read',
    advise: (ratio) =>
      `Text sits at ${ratio}:1 on your card background — it needs 4.5:1. Nudge the card background further from your text colour.`,
  },
  'muted text on surface': {
    path: 'brand.textMuted',
    title: 'Muted text is hard to read',
    advise: (ratio) =>
      `Your muted text is ${ratio}:1 against the page — it needs 4.5:1. Muted should be quieter than body text, not fainter than the eye can follow.`,
  },
  'on-brand on brand': {
    path: 'brand.colorOnBrand',
    title: 'Button text is hard to read',
    advise: (ratio) =>
      `Your button text is ${ratio}:1 against your brand colour — it needs 4.5:1. Try a darker brand colour, or lighter text on it.`,
  },
  'on-brand on brand hover': {
    path: 'brand.colorOnBrand',
    title: 'Button text fails on hover',
    advise: (ratio) =>
      `When a button is hovered your label drops to ${ratio}:1. Buttons are read most closely at the moment someone is about to click them.`,
  },
  'on-brand on brand active': {
    path: 'brand.colorOnBrand',
    title: 'Button text fails while pressed',
    advise: (ratio) => `While pressed your button label is only ${ratio}:1 against its fill.`,
  },
  'strong border on surface': {
    path: 'brand.border',
    title: 'Borders are nearly invisible',
    advise: (ratio) =>
      `Your border colour is ${ratio}:1 against the page — non-text UI needs 3:1 so the edges of inputs and cards are findable.`,
  },
  'success on surface': {
    path: 'brand.success',
    title: 'Success colour is too faint',
    advise: (ratio) => `Your success colour is ${ratio}:1 against the page; it needs 3:1.`,
  },
  'warning on surface': {
    path: 'brand.warning',
    title: 'Warning colour is too faint',
    advise: (ratio) => `Your warning colour is ${ratio}:1 against the page; it needs 3:1.`,
  },
  'danger on surface': {
    path: 'brand.danger',
    title: 'Error colour is too faint',
    advise: (ratio) => `Your error colour is ${ratio}:1 against the page; it needs 3:1.`,
  },
};

/** Merchant-set colours the engine may quietly lift, and what to call them. */
const ADJUSTABLE: Array<{
  path: string;
  token: 'text' | 'textMuted' | 'success' | 'warning' | 'danger' | 'borderStrong';
  label: string;
  required: number;
}> = [
  { path: 'brand.text', token: 'text', label: 'body text', required: 4.5 },
  { path: 'brand.textMuted', token: 'textMuted', label: 'muted text', required: 4.5 },
  { path: 'brand.success', token: 'success', label: 'success colour', required: 3 },
  { path: 'brand.warning', token: 'warning', label: 'warning colour', required: 3 },
  { path: 'brand.danger', token: 'danger', label: 'error colour', required: 3 },
];

/**
 * Normalise a hex for comparison. Case and shorthand should not read as a change.
 * @param hex - A hex colour
 * @returns A lowercase 6- or 8-digit hex
 */
function normalizeHex(hex: string): string {
  const value = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return value;
}

/**
 * Walk a colour towards the far end of the lightness range until it clears a
 * contrast floor against a background.
 *
 * Deliberately a *nudge*, not a recolour: it moves lightness in 2% steps and
 * leaves hue and chroma alone, so the suggestion still reads as the merchant's
 * colour. Against a light page it darkens; against a dark one it lightens.
 *
 * @param color - The colour to adjust
 * @param background - What it has to be visible against
 * @param required - The contrast floor to clear
 * @returns The nearest shade that clears the floor, or the darkest/lightest
 *          shade tried when nothing does
 */
function darkenToContrast(color: string, background: string, required: number): string {
  const direction = isDark(background) ? 1 : -1;
  let candidate = color;
  for (let step = 0; step < 50; step += 1) {
    if (contrastRatio(candidate, background) >= required) return candidate;
    candidate = adjustLightness(candidate, direction * 0.02);
  }
  return candidate;
}

/**
 * Evaluate a working draft and describe everything a merchant should know
 * about its legibility.
 *
 * @param theme - The draft theme patch, exactly as it would be saved
 * @returns Findings ordered failures-first, ready to render inline
 */
export function contrastFindings(theme: StorefrontThemeInput): ContrastFinding[] {
  const resolved = resolveTheme(theme);
  const derived = deriveTokens(resolved);

  /*
   * What the engine *would* pick if the merchant's pin were gone.
   *
   * `derived.onBrand` above is computed from a theme that still contains the
   * pin, so using it as the "after" swatch renders `#FFFFFF → #FFFFFF` — a fix
   * preview showing no change, for a fix that does change something. Resolving
   * a second time without the pin is the only way to know the real answer.
   */
  const withoutPin = { ...resolved, brand: { ...resolved.brand, colorOnBrand: '' } };
  const accessibleOnBrand = deriveTokens(withoutPin).onBrand;

  const findings: ContrastFinding[] = [];
  const seenPaths = new Set<string>();

  for (const row of auditContrast(resolved)) {
    if (row.passes) continue;
    const advice = PAIR_ADVICE[row.pair];
    if (!advice) continue;

    // One pinned `colorOnBrand` fails against the resting, hover and pressed
    // fills and produced three near-identical findings, so the publish dialog
    // said "One thing needs fixing" above a list of three. It is one mistake
    // with one fix: report it once, against the state WCAG actually judges.
    if (advice.path === 'brand.colorOnBrand') {
      if (seenPaths.has(advice.path)) continue;
      seenPaths.add(advice.path);
    }

    findings.push({
      id: `fail:${row.pair}`,
      level: 'fail',
      path: advice.path,
      title: advice.title,
      detail: advice.advise(row.ratio, row.required),
      ...(advice.path === 'brand.colorOnBrand'
        ? {
            from: resolved.brand.colorOnBrand,
            to: accessibleOnBrand,
            // Clearing the pin hands the choice back to the engine, which is
            // guaranteed to find a legible ink for any brand colour.
            fix: { path: 'brand.colorOnBrand', value: null },
          }
        : {}),
    });
  }

  /*
   * The pair `auditContrast` does not check, and the one the brief names.
   *
   * Auto-contrast guarantees the *label* on a brand button is legible. It says
   * nothing about the button itself. A pale-yellow brand on a near-white page
   * gives a perfectly readable label floating on an invisible shape: "Quick
   * add" buttons, "Sale" badges and brand-filled bands all disappear, and the
   * old guardrail raised nothing at all.
   *
   * The floor is WCAG 1.4.11's 3:1 for non-text UI, measured against the page
   * the buttons sit on.
   */
  const brandOnSurface = Math.round(contrastRatio(derived.brand, derived.surface) * 100) / 100;
  if (brandOnSurface < CONTRAST_UI) {
    findings.push({
      id: 'warn:brand on surface',
      level: 'warn',
      path: 'brand.color',
      title: 'Buttons in this colour have no visible edge',
      detail:
        `Your brand colour is ${brandOnSurface}:1 against the page — non-text UI needs 3:1. ` +
        'The text on a button stays readable, but the button itself will not be findable: ' +
        'the same is true of badges, price tags and any band filled with this colour.',
      from: derived.brand,
      to: darkenToContrast(derived.brand, derived.surface, CONTRAST_UI),
      fix: {
        path: 'brand.color',
        value: darkenToContrast(derived.brand, derived.surface, CONTRAST_UI),
      },
    });
  }

  for (const entry of ADJUSTABLE) {
    const chosen = normalizeHex(resolved.brand[entry.token as keyof typeof resolved.brand] as string);
    const used = normalizeHex(derived[entry.token]);
    if (chosen === used) continue;

    const ratio = Math.round(contrastRatio(chosen, resolved.brand.surface) * 100) / 100;
    findings.push({
      id: `adjusted:${entry.path}`,
      level: 'adjusted',
      path: entry.path,
      title: 'Adjusted for readability',
      detail: `Your ${entry.label} was ${ratio}:1 against the page background, under the ${entry.required}:1 minimum, so your shop renders ${used} instead. Adopt it to keep what you see here and what visitors see identical.`,
      from: chosen,
      to: used,
      fix: { path: entry.path, value: used },
    });
  }

  return findings;
}

/**
 * Filter findings down to the ones belonging beside one control.
 * @param findings - All findings
 * @param path - Dotted theme path of the control
 * @returns The findings for that control
 */
export function findingsForPath(
  findings: ContrastFinding[],
  path: string,
): ContrastFinding[] {
  return findings.filter((finding) => finding.path === path);
}

/** True when publishing should be blocked. */
export const hasBlockingFinding = (findings: ContrastFinding[]): boolean =>
  findings.some((finding) => finding.level === 'fail');
