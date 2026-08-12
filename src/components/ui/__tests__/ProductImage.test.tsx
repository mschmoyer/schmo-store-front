import { render, screen } from '@testing-library/react';
import { ProductImage, getProductMark } from '../ProductImage';
import {
  MARK_HUE_ARC,
  MARK_INK_RAMP,
  MARK_MIN_CONTRAST,
  contrastWithWhite,
} from '@/lib/design/tokens';

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    className,
  }: {
    alt: string;
    src: string;
    className?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} className={className} />
  ),
}));


/** Hue in degrees of a #rrggbb string, for the brand-arc assertions. */
function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('getProductMark', () => {
  it('is deterministic for the same SKU', () => {
    const a = getProductMark({ sku: 'FIT-KETTLE-24', name: 'Cast Iron Kettlebell 24kg' });
    const b = getProductMark({ sku: 'FIT-KETTLE-24', name: 'Cast Iron Kettlebell 24kg' });

    expect(a).toEqual(b);
  });

  it('seeds from the SKU, not the name, so a renamed product keeps its mark', () => {
    const before = getProductMark({ sku: 'PHONE-001', name: 'Latest Smartphone Pro' });
    const after = getProductMark({ sku: 'PHONE-001', name: 'Smartphone Pro (2026)' });

    expect(after.gradient).toBe(before.gradient);
    expect(after.foreground).toBe(before.foreground);
    expect(after.glow).toEqual(before.glow);
  });

  it('ignores SKU casing and surrounding whitespace', () => {
    const a = getProductMark({ sku: '  phone-001 ', name: 'Phone' });
    const b = getProductMark({ sku: 'PHONE-001', name: 'Phone' });

    expect(a.gradient).toBe(b.gradient);
  });

  it('gives different SKUs different marks', () => {
    const gradients = new Set(
      ['PHONE-001', 'JEWELRY-001', 'FIT-KETTLE-24', 'LAPTOP-ULTRA', 'MUG-STONE-01'].map(
        (sku) => getProductMark({ sku, name: sku }).gradient
      )
    );

    // Collisions are possible in principle, but not across this handful.
    expect(gradients.size).toBeGreaterThan(1);
  });

  /**
   * §1's anti-goal is "do not look like a generic purple/blue SaaS template".
   * The old implementation picked from a fixed list that contained violet,
   * teal and blue entries, so 25% of a catalogue rendered off-brand. Hue is
   * now confined to the ember→amber arc, and this asserts it stays there.
   */
  it('keeps every generated hue inside the ember-to-amber brand arc', () => {
    const offBrand: string[] = [];

    for (let i = 0; i < 600; i += 1) {
      const mark = getProductMark({ sku: `SKU-${i}`, name: `Product ${i}` });
      const stops = mark.gradient.match(/#[0-9A-Fa-f]{6}/g) ?? [];

      // The graphite tiles are the deliberate ink off-ramp, not a hue.
      const inkRamp: string[] = [MARK_INK_RAMP.from, MARK_INK_RAMP.to];
      if (stops.every((stop) => inkRamp.includes(stop.toUpperCase()))) continue;

      for (const stop of stops) {
        const hue = hueOf(stop);
        if (hue < MARK_HUE_ARC.min - 2 || hue > MARK_HUE_ARC.max + 2) {
          offBrand.push(`${stop} (hue ${hue.toFixed(1)})`);
        }
      }
    }

    expect(offBrand).toEqual([]);
  });

  it('never emits the purple, violet or teal the old palette shipped', () => {
    const banned = ['#7C3AED', '#4C1D95', '#14B8A6', '#2563EB', '#1E40AF'];
    const seen = new Set<string>();

    for (let i = 0; i < 600; i += 1) {
      for (const stop of getProductMark({ sku: `SKU-${i}` }).gradient.match(/#[0-9A-Fa-f]{6}/g) ?? []) {
        seen.add(stop.toUpperCase());
      }
    }

    for (const hex of banned) expect(seen.has(hex)).toBe(false);
  });

  it('keeps white legible on the lighter gradient stop of every tile', () => {
    const failures: string[] = [];

    for (let i = 0; i < 600; i += 1) {
      const mark = getProductMark({ sku: `SKU-${i}`, name: `Product ${i}` });
      const lighter = (mark.gradient.match(/#[0-9A-Fa-f]{6}/g) ?? [])[0];
      const ratio = contrastWithWhite(lighter);
      if (ratio < MARK_MIN_CONTRAST) failures.push(`${lighter} @ ${ratio.toFixed(2)}:1`);
    }

    expect(failures).toEqual([]);
  });

  it('derives two initials from a multi-word name', () => {
    expect(getProductMark({ sku: 'X', name: 'Cast Iron Kettlebell' }).initials).toBe('CI');
  });

  it('takes the first two letters of a single-word name', () => {
    expect(getProductMark({ sku: 'X', name: 'Kettlebell' }).initials).toBe('KE');
  });

  it.each([
    ['3M Command Hooks', 'CH'],
    ['24kg Cast Iron Kettlebell', 'CI'],
    ['#1 Best Seller Mug', 'BS'],
    ['iPhone 15 Pro Max Case', 'IP'],
    ['5-Pack', 'PA'],
  ])('skips numeric leading words in %s', (name, expected) => {
    // A digit initial reads as noise; commerce names lead with them constantly.
    expect(getProductMark({ sku: 'X', name }).initials).toBe(expected);
  });

  it('falls back to digits only when the name has no letters at all', () => {
    expect(getProductMark({ sku: 'X', name: '2024 500' }).initials).toBe('25');
  });

  it('returns a single glyph for a short single word and flags it', () => {
    const mark = getProductMark({ sku: 'X', name: 'A' });
    expect(mark.initials).toBe('A');
    expect(mark.single).toBe(true);
  });

  it('flags non-Latin initials so the tile can switch typeface', () => {
    // Space Grotesk is loaded latin-only; an unflagged CJK tile would silently
    // fall back to a system face mid-grid.
    expect(getProductMark({ sku: 'X', name: '马克杯' }).nonLatin).toBe(true);
    expect(getProductMark({ sku: 'X', name: 'Stoneware Mug' }).nonLatin).toBe(false);
  });

  it('falls back to the SKU when the name has no letters', () => {
    expect(getProductMark({ sku: 'zx-900', name: '—' }).initials).toBe('ZX');
  });

  it('never produces an empty mark', () => {
    const mark = getProductMark({});
    expect(mark.initials).toBeTruthy();
    expect(mark.gradient).toContain('linear-gradient');
    expect(mark.blurDataURL.startsWith('data:image/svg+xml')).toBe(true);
  });
});

describe('ProductImage', () => {
  it('renders the photograph when a src is supplied', () => {
    render(<ProductImage src="/images/kettlebell.jpg" name="Kettlebell" sku="FIT-KETTLE-24" />);

    const image = screen.getByRole('img', { name: 'Kettlebell' });
    expect(image.tagName).toBe('IMG');
  });

  it('renders the generated mark when there is no src', () => {
    render(<ProductImage name="Cast Iron Kettlebell" sku="FIT-KETTLE-24" />);

    const mark = screen.getByRole('img', { name: /no product image/i });
    expect(mark.tagName).not.toBe('IMG');
    expect(mark).toHaveTextContent('CI');
    expect(mark).toHaveTextContent('FIT-KETTLE-24');
  });

  it('paints the mark with the deterministic gradient custom properties', () => {
    const expected = getProductMark({ sku: 'FIT-KETTLE-24', name: 'Cast Iron Kettlebell' });
    render(<ProductImage name="Cast Iron Kettlebell" sku="FIT-KETTLE-24" />);

    const mark = screen.getByRole('img', { name: /no product image/i });
    expect(mark.getAttribute('style')?.toLowerCase()).toContain(
      expected.foreground.toLowerCase()
    );
    expect(mark.getAttribute('style')).toContain('--mark-gradient');
  });

  it('renders the same mark across independent mounts', () => {
    const { unmount } = render(<ProductImage name="Stoneware Mug" sku="MUG-STONE-01" />);
    const first = screen.getByRole('img', { name: /no product image/i }).getAttribute('style');
    unmount();

    render(<ProductImage name="Stoneware Mug" sku="MUG-STONE-01" />);
    const second = screen.getByRole('img', { name: /no product image/i }).getAttribute('style');

    expect(second).toBe(first);
  });

  it('applies the requested aspect ratio to the frame', () => {
    const { container } = render(<ProductImage name="Mug" sku="MUG-01" ratio="4 / 3" />);
    expect(container.firstElementChild).toHaveStyle({ aspectRatio: '4 / 3' });
  });
});
