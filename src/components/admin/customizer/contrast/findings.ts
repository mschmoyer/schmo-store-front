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
  auditContrast,
  contrastRatio,
  deriveTokens,
  resolveTheme,
  type StorefrontThemeInput,
} from '@/lib/storefront-theme';

export type ContrastLevel = 'fail' | 'adjusted';

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
  /** Applying this patch resolves the finding. */
  fix?: { path: string; value: string };
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
 * Evaluate a working draft and describe everything a merchant should know
 * about its legibility.
 *
 * @param theme - The draft theme patch, exactly as it would be saved
 * @returns Findings ordered failures-first, ready to render inline
 */
export function contrastFindings(theme: StorefrontThemeInput): ContrastFinding[] {
  const resolved = resolveTheme(theme);
  const derived = deriveTokens(resolved);
  const findings: ContrastFinding[] = [];

  for (const row of auditContrast(resolved)) {
    if (row.passes) continue;
    const advice = PAIR_ADVICE[row.pair];
    if (!advice) continue;

    findings.push({
      id: `fail:${row.pair}`,
      level: 'fail',
      path: advice.path,
      title: advice.title,
      detail: advice.advise(row.ratio, row.required),
      ...(advice.path === 'brand.colorOnBrand'
        ? {
            from: resolved.brand.colorOnBrand,
            to: derived.onBrand,
            // Clearing the pin hands the choice back to the engine, which is
            // guaranteed to find a legible ink for any brand colour.
            fix: { path: 'brand.colorOnBrand', value: '' },
          }
        : {}),
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
