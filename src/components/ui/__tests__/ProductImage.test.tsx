import { render, screen } from '@testing-library/react';
import { ProductImage, getProductMark } from '../ProductImage';
import { fallbackGradients } from '@/lib/design/tokens';

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

  it('always picks a gradient from the palette', () => {
    const known = new Set<string>(fallbackGradients.map((entry) => entry.from));

    for (let i = 0; i < 200; i += 1) {
      const mark = getProductMark({ sku: `SKU-${i}`, name: `Product ${i}` });
      const from = mark.gradient.match(/#[0-9A-Fa-f]{6}/)?.[0];
      expect(known.has(from ?? '')).toBe(true);
    }
  });

  it('derives two initials from a multi-word name', () => {
    expect(getProductMark({ sku: 'X', name: 'Cast Iron Kettlebell' }).initials).toBe('CI');
  });

  it('takes the first two letters of a single-word name', () => {
    expect(getProductMark({ sku: 'X', name: 'Kettlebell' }).initials).toBe('KE');
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
