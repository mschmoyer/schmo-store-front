import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { PricingPage, pricingMetadata } from '../pricing/PricingPage';

describe('PricingPage', () => {
  it('renders one h1, carrying the approved headline', () => {
    render(<PricingPage />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent('One plan. $19.99 a month.');
  });

  it('states the intro offer and the standing price', () => {
    render(<PricingPage />);
    expect(
      screen.getByText('Your first three months cost $1 total. We never take a percentage of a sale.')
    ).toBeInTheDocument();
    expect(screen.getByText('then $19.99/mo')).toBeInTheDocument();
  });

  it('does not promise a pre-billing email we cannot send', () => {
    const { container } = render(<PricingPage />);
    expect(container.textContent).not.toContain('7 days before');
  });

  it('includes the refund question rather than leaving the absence to be read', () => {
    render(<PricingPage />);
    expect(screen.getByText('Do you offer refunds?')).toBeInTheDocument();
  });

  it('ships the "Where Shopify wins" fairness block', () => {
    render(<PricingPage />);
    expect(screen.getByText('Where Shopify wins.')).toBeInTheDocument();
  });

  it('cites the vendor pricing pages it quotes', () => {
    render(<PricingPage />);
    expect(screen.getByRole('link', { name: 'shopify.com/pricing' })).toHaveAttribute(
      'href',
      'https://www.shopify.com/pricing'
    );
    expect(screen.getByRole('link', { name: 'stripe.com/pricing' })).toHaveAttribute(
      'href',
      'https://stripe.com/pricing'
    );
  });

  it('shows the twelve-month arithmetic, corrected', () => {
    render(<PricingPage />);
    const table = screen.getByRole('region', {
      name: 'RebelShops compared with Shopify Basic',
    });
    expect(within(table).getByText('$180.91')).toBeInTheDocument();
  });

  it('exports metadata using the copy deck title tag', () => {
    expect(pricingMetadata.title).toBe('Pricing — $19.99/mo, No Transaction Fees | RebelShops');
  });
});
