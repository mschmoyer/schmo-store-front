import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../Button';

describe('Button', () => {
  it('renders its label and defaults to type="button"', () => {
    render(<Button>Create store</Button>);

    const button = screen.getByRole('button', { name: 'Create store' });
    expect(button).toBeInTheDocument();
    // Defaulting to "button" stops a Button inside a form submitting by accident.
    expect(button).toHaveAttribute('type', 'button');
  });

  it('exposes the variant and size it was rendered with', () => {
    render(
      <Button variant="destructive" size="lg">
        Delete
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveAttribute('data-variant', 'destructive');
    expect(button).toHaveAttribute('data-size', 'lg');
  });

  it('keeps the label mounted while loading so the width does not change', () => {
    const { rerender } = render(<Button>Import products</Button>);
    const resting = screen.getByRole('button').innerHTML;

    rerender(<Button loading>Import products</Button>);
    const loading = screen.getByRole('button');

    // The label text is still in the DOM (hidden by opacity, not unmounted),
    // which is what holds the button at its resting width.
    expect(loading).toHaveTextContent('Import products');
    expect(resting).toContain('Import products');
    expect(loading).toHaveAttribute('aria-busy', 'true');
  });

  it('is disabled and non-clickable while loading', async () => {
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>
    );

    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('fires onClick when enabled', async () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Sync</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Sync' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Sync
      </Button>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Sync' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders as an anchor via `as`, using aria-disabled instead of the disabled attribute', () => {
    render(
      <Button as="a" href="/pricing" disabled>
        Pricing
      </Button>
    );

    const link = screen.getByRole('link', { name: 'Pricing' });
    expect(link).toHaveAttribute('href', '/pricing');
    // Anchors have no `disabled` attribute, so the inert state must be ARIA.
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).not.toHaveAttribute('type');
  });

  it('hides decorative icons from assistive tech', () => {
    render(
      <Button leftIcon={<svg data-testid="icon" />} rightIcon={<svg data-testid="icon-2" />}>
        Export
      </Button>
    );

    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('icon-2').parentElement).toHaveAttribute('aria-hidden', 'true');
  });

  it('passes className through alongside its own classes', () => {
    render(<Button className="custom-class">Go</Button>);

    const button = screen.getByRole('button', { name: 'Go' });
    expect(button).toHaveClass('custom-class');
    expect(button.className.split(' ').length).toBeGreaterThan(1);
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement | null>;
    render(<Button ref={ref}>Focus me</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
