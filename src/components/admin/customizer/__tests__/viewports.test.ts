/**
 * The viewport switcher's contract.
 *
 * "Desktop" used to have no width of its own: the frame took whatever the
 * canvas had left, which at a 1440 window was 738 px — narrow enough that the
 * storefront collapsed to a hamburger, so a merchant designing in Desktop mode
 * had never seen their own navigation. Tablet, clamped to the same maximum,
 * rendered identically to Desktop, which made one of the three buttons purely
 * decorative.
 *
 * These are the invariants that stops that coming back. The rendering itself is
 * covered end-to-end, where the iframe's real `innerWidth` can be measured.
 */

import { VIEWPORTS } from '../preview/PreviewFrame';

describe('VIEWPORTS', () => {
  it('gives every viewport a real device width', () => {
    for (const [id, size] of Object.entries(VIEWPORTS)) {
      expect(typeof size.width).toBe('number');
      expect(size.width).toBeGreaterThan(0);
      expect(size.label).toBeTruthy();
      expect(id).toBeTruthy();
    }
  });

  it('makes desktop wide enough for a full navigation bar', () => {
    // The storefront's own nav collapses below ~1024. A "Desktop" preview
    // narrower than that is not previewing a desktop.
    expect(VIEWPORTS.desktop.width).toBeGreaterThanOrEqual(1024);
  });

  it('keeps the three widths genuinely distinct', () => {
    const widths = Object.values(VIEWPORTS).map((size) => size.width);
    expect(new Set(widths).size).toBe(widths.length);
  });

  it('orders them desktop > tablet > mobile', () => {
    expect(VIEWPORTS.desktop.width).toBeGreaterThan(VIEWPORTS.tablet.width);
    expect(VIEWPORTS.tablet.width).toBeGreaterThan(VIEWPORTS.mobile.width);
  });

  it('uses real device widths for tablet and mobile', () => {
    expect(VIEWPORTS.tablet.width).toBe(834);
    expect(VIEWPORTS.mobile.width).toBe(390);
  });

  it('lets desktop take the canvas height, since a desktop window has no fixed one', () => {
    expect(VIEWPORTS.desktop.height).toBeNull();
    expect(VIEWPORTS.tablet.height).toBe(1112);
    expect(VIEWPORTS.mobile.height).toBe(844);
  });
});
