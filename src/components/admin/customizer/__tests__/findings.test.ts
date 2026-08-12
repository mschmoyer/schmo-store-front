/**
 * The contrast guardrail.
 *
 * These cover the three things the guardrail got wrong, each of which was
 * invisible to every other test in the repository because they are all about
 * what the merchant is *told*, not about what the engine computes:
 *
 *  1. a pale brand colour produced a legible label on an invisible button and
 *     raised no finding at all;
 *  2. the fix preview for a pinned `colorOnBrand` rendered `#FFFFFF → #FFFFFF`,
 *     showing no change for a fix that does change something;
 *  3. one pinned colour produced three findings, so the publish dialog said
 *     "One thing needs fixing" directly above a list of three.
 */

import { contrastRatio } from '@/lib/storefront-theme';

import { contrastFindings, hasBlockingFinding } from '../contrast/findings';

/** The pale yellow from the review: legible label, invisible button. */
const PALE_YELLOW = '#FFFDE7';

describe('brand on surface', () => {
  it('warns when the brand colour has no visible edge against the page', () => {
    const findings = contrastFindings({ brand: { color: PALE_YELLOW } });
    const warning = findings.find((finding) => finding.id === 'warn:brand on surface');

    expect(warning).toBeDefined();
    expect(warning?.level).toBe('warn');
    expect(warning?.path).toBe('brand.color');
    expect(warning?.detail).toMatch(/needs 3:1/);
  });

  it('measures the ratio rather than asserting one', () => {
    const findings = contrastFindings({ brand: { color: PALE_YELLOW, surface: '#ffffff' } });
    const warning = findings.find((finding) => finding.id === 'warn:brand on surface');
    const measured = Math.round(contrastRatio(PALE_YELLOW, '#ffffff') * 100) / 100;
    expect(warning?.detail).toContain(`${measured}:1`);
  });

  it('offers a darker shade of the same colour, and that shade actually passes', () => {
    const findings = contrastFindings({ brand: { color: PALE_YELLOW, surface: '#ffffff' } });
    const warning = findings.find((finding) => finding.id === 'warn:brand on surface');

    expect(warning?.to).toBeDefined();
    expect(warning?.to).not.toBe(PALE_YELLOW);
    expect(contrastRatio(warning!.to!, '#ffffff')).toBeGreaterThanOrEqual(3);
    expect(warning?.fix).toEqual({ path: 'brand.color', value: warning?.to });
  });

  it('clears once the suggested colour is adopted', () => {
    const first = contrastFindings({ brand: { color: PALE_YELLOW } });
    const suggested = first.find((finding) => finding.id === 'warn:brand on surface')!.to!;

    const second = contrastFindings({ brand: { color: suggested } });
    expect(second.some((finding) => finding.id === 'warn:brand on surface')).toBe(false);
  });

  it('does not warn about a brand colour that is already visible', () => {
    const findings = contrastFindings({ brand: { color: '#0000ff' } });
    expect(findings.some((finding) => finding.id === 'warn:brand on surface')).toBe(false);
  });

  it('is a warning, not a block — the brand colour is the merchant’s to choose', () => {
    const findings = contrastFindings({ brand: { color: PALE_YELLOW } });
    expect(findings.some((finding) => finding.level === 'warn')).toBe(true);
    expect(hasBlockingFinding(findings)).toBe(false);
  });

  it('handles a dark page by lightening rather than darkening', () => {
    // Near-black brand on a near-black page: the only way out is up.
    const findings = contrastFindings({
      brand: { color: '#0d0f12', surface: '#08090b', surfaceRaised: '#14161b', scheme: 'dark' },
    });
    const warning = findings.find((finding) => finding.id === 'warn:brand on surface');
    expect(warning).toBeDefined();
    expect(contrastRatio(warning!.to!, '#08090b')).toBeGreaterThanOrEqual(3);
  });
});

describe('a pinned, illegible button ink', () => {
  /** White text pinned onto a white brand: unreadable, and blocks publish. */
  const pinned = { brand: { color: '#ffffff', colorOnBrand: '#ffffff' } };

  it('blocks publish', () => {
    expect(hasBlockingFinding(contrastFindings(pinned))).toBe(true);
  });

  it('reports the problem once, not once per button state', () => {
    const failures = contrastFindings(pinned).filter(
      (finding) => finding.path === 'brand.colorOnBrand',
    );
    expect(failures).toHaveLength(1);
  });

  it('previews the colour the fix would actually produce', () => {
    const finding = contrastFindings(pinned).find(
      (entry) => entry.path === 'brand.colorOnBrand',
    );
    expect(finding?.from?.toLowerCase()).toBe('#ffffff');
    expect(finding?.to?.toLowerCase()).not.toBe('#ffffff');
    // And the previewed colour has to be one a merchant could actually read.
    expect(contrastRatio(finding!.to!, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });

  it('clears when the pin is removed, which is what its fix does', () => {
    const finding = contrastFindings(pinned).find(
      (entry) => entry.path === 'brand.colorOnBrand',
    );
    expect(finding?.fix).toEqual({ path: 'brand.colorOnBrand', value: null });

    const after = contrastFindings({ brand: { color: '#ffffff' } });
    expect(after.some((entry) => entry.path === 'brand.colorOnBrand')).toBe(false);
  });
});

describe('the default theme', () => {
  it('raises no failures', () => {
    expect(hasBlockingFinding(contrastFindings({}))).toBe(false);
  });
});
