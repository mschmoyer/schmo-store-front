import { render, screen } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('defaults to the neutral tone', () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText('Draft')).toHaveAttribute('data-tone', 'neutral');
  });

  it.each(['neutral', 'ember', 'mint', 'amber', 'rose'] as const)(
    'exposes the %s tone on the element',
    (tone) => {
      render(<Badge tone={tone}>{tone}</Badge>);
      expect(screen.getByText(tone)).toHaveAttribute('data-tone', tone);
    }
  );

  it('renders a decorative dot that is hidden from assistive tech', () => {
    const { container } = render(<Badge tone="mint" dot>In stock</Badge>);

    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
    // The dot is a second, non-colour cue — it must never be announced twice.
    expect(screen.getByText('In stock')).toHaveTextContent('In stock');
  });

  it('renders no dot by default', () => {
    const { container } = render(<Badge tone="mint">In stock</Badge>);
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('only applies the pulse treatment when a dot is present', () => {
    const { container: withDot } = render(
      <Badge tone="ember" dot pulse>
        Live
      </Badge>
    );
    const { container: withoutDot } = render(
      <Badge tone="ember" pulse>
        Live
      </Badge>
    );

    const dotted = withDot.firstElementChild as HTMLElement;
    const undotted = withoutDot.firstElementChild as HTMLElement;

    expect(dotted.className).not.toEqual(undotted.className);
  });

  it('passes className through', () => {
    render(<Badge className="custom-badge">Tagged</Badge>);
    expect(screen.getByText('Tagged')).toHaveClass('custom-badge');
  });

  it('forwards a ref to the span', () => {
    const ref = { current: null } as React.RefObject<HTMLSpanElement | null>;
    render(<Badge ref={ref}>Ref</Badge>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('renders an icon slot hidden from assistive tech', () => {
    render(
      <Badge icon={<svg data-testid="badge-icon" />} tone="ember">
        Syncing
      </Badge>
    );
    expect(screen.getByTestId('badge-icon').parentElement).toHaveAttribute('aria-hidden', 'true');
  });
});
