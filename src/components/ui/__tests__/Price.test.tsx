import { render, screen } from '@testing-library/react';
import { Price } from '../Price';

/** The visible amount, reassembled from the split symbol/integer/fraction spans. */
const visibleText = (container: HTMLElement): string =>
  container.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Price', () => {
  it('renders a plain amount with cents', () => {
    const { container } = render(<Price value={149.99} />);
    expect(visibleText(container)).toContain('$149.99');
  });

  it('groups thousands', () => {
    const { container } = render(<Price value={1249} />);
    expect(visibleText(container)).toContain('$1,249.00');
  });

  it('labels the amount for screen readers', () => {
    render(<Price value={24.5} />);
    expect(screen.getByLabelText('$24.50')).toBeInTheDocument();
  });

  it('shows the compare-at price and a savings badge when on sale', () => {
    const { container } = render(<Price value={799.99} compareAt={899.99} />);
    const text = visibleText(container);

    expect(text).toContain('$899.99');
    expect(text).toContain('$799.99');
    // 899.99 - 799.99 is a whole dollar amount, so the cents are dropped.
    expect(text).toContain('Save $100');
  });

  it('can express the saving as a percentage', () => {
    const { container } = render(<Price value={90} compareAt={120} savingsAsPercent />);
    expect(visibleText(container)).toContain('Save 25%');
  });

  it('drops the cents from whole-dollar savings figures', () => {
    const { container } = render(<Price value={100} compareAt={150} />);
    expect(visibleText(container)).toContain('Save $50');
    expect(visibleText(container)).not.toContain('Save $50.00');
  });

  it('describes the reduction in the accessible label', () => {
    render(<Price value={799.99} compareAt={899.99} />);
    expect(
      screen.getByLabelText('$799.99, reduced from $899.99')
    ).toBeInTheDocument();
  });

  it('omits the savings badge when showSavings is false', () => {
    const { container } = render(<Price value={80} compareAt={100} showSavings={false} />);
    const text = visibleText(container);

    expect(text).toContain('$100');
    expect(text).not.toContain('Save');
  });

  it('never shows a savings badge when compareAt is not higher than the price', () => {
    const { container } = render(<Price value={100} compareAt={100} />);
    expect(visibleText(container)).not.toContain('Save');
  });

  it('renders zero as "Free" only when asked', () => {
    const { container: withFlag } = render(<Price value={0} freeWhenZero />);
    expect(visibleText(withFlag)).toBe('Free');
    expect(screen.getByLabelText('Free')).toBeInTheDocument();

    const { container: withoutFlag } = render(<Price value={0} />);
    expect(visibleText(withoutFlag)).toContain('$0.00');
  });

  it('respects an alternative currency and locale', () => {
    const { container } = render(<Price value={42} currency="EUR" locale="de-DE" />);
    const text = visibleText(container);

    expect(text).toContain('42');
    expect(text).toContain('€');
  });
});
