import React from 'react';
import { render, screen } from '@testing-library/react';
import { PlanCard } from '../pricing/PlanCard';

describe('PlanCard', () => {
  it('states both prices plainly, on separate lines', () => {
    render(<PlanCard />);
    expect(screen.getByText('for your first 3 months')).toBeInTheDocument();
    expect(screen.getByText('then $19.99/mo')).toBeInTheDocument();
  });

  it('never renders a struck-through $19.99 next to the $1', () => {
    const { container } = render(<PlanCard />);
    const struck = container.querySelectorAll('s, del, [style*="line-through"]');
    expect(struck).toHaveLength(0);
  });

  it('shows the no-transaction-fees badge', () => {
    render(<PlanCard />);
    expect(screen.getByText('No transaction fees')).toBeInTheDocument();
  });

  it('accepts the pricing page badge and eyebrow', () => {
    render(<PlanCard eyebrow="Everything, one price" badge="0% transaction fees" />);
    expect(screen.getByText('Everything, one price')).toBeInTheDocument();
    expect(screen.getByText('0% transaction fees')).toBeInTheDocument();
  });

  it('renders the not-included list in full', () => {
    render(<PlanCard />);
    expect(screen.getByText('Not included — read this part')).toBeInTheDocument();
    expect(screen.getByText('Payment processing fees.')).toBeInTheDocument();
    expect(screen.getByText('A custom domain.')).toBeInTheDocument();
    expect(screen.getByText('Migration off a non-ShipStation system.')).toBeInTheDocument();
  });

  it('sends the CTA somewhere that does not take a card', () => {
    render(<PlanCard />);
    expect(screen.getByRole('link', { name: 'Start for $1' })).toHaveAttribute(
      'href',
      '/create-store'
    );
  });
});
