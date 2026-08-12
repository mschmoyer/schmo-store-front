import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SiteHeader } from '../chrome/SiteHeader';
import { SiteFooter } from '../chrome/SiteFooter';
import { ROUTES } from '../data/routes';

/** Every route the marketing chrome is allowed to point at. */
const EXISTING_ROUTES = new Set<string>([
  '/',
  '/features',
  '/how-it-works',
  '/demo-stores',
  '/create-store',
  '/login',
  '/store',
  '/store/demo-electronics',
  '/store/artisan-craft',
  '/store/fitness-pro',
]);

/**
 * Accepts a link target if it is a same-page anchor or a route that exists in
 * `src/app`. A 404 reached from the chrome is a defect.
 *
 * @param href - The link target.
 * @returns Whether the target resolves to something real.
 */
function isRealTarget(href: string): boolean {
  if (href.startsWith('#')) return true;
  if (href.startsWith('http')) return true;
  const [pathname] = href.split('#');
  return pathname === '' || EXISTING_ROUTES.has(pathname);
}

describe('SiteHeader', () => {
  it('renders the primary nav and both account actions', () => {
    render(<SiteHeader />);
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(nav).getByText('Features')).toBeInTheDocument();
    expect(within(nav).getByText('How it works')).toBeInTheDocument();
    expect(within(nav).getByText('Demo stores')).toBeInTheDocument();
    expect(screen.getAllByText('Start for $1').length).toBeGreaterThan(0);
  });

  it('only links to routes that exist', () => {
    const { container } = render(<SiteHeader />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href')!);
    expect(hrefs.length).toBeGreaterThan(0);
    hrefs.forEach((href) => expect(isRealTarget(href)).toBe(true));
  });

  it('opens the mobile panel and reflects state on the toggle', () => {
    render(<SiteHeader />);
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'site-menu');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('dialog', { name: 'Site menu' })).toBeInTheDocument();
  });

  it('closes the mobile panel on Escape', () => {
    render(<SiteHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('offers a skip link as the first focusable element', () => {
    const { container } = render(<SiteHeader />);
    const first = container.querySelector('a');
    expect(first).toHaveTextContent('Skip to content');
    expect(first).toHaveAttribute('href', '#main');
  });
});

describe('SiteFooter', () => {
  it('only links to routes that exist', () => {
    const { container } = render(<SiteFooter />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href')!);
    expect(hrefs.length).toBeGreaterThan(0);
    hrefs.forEach((href) => expect(isRealTarget(href)).toBe(true));
  });

  it('never links to a page that has not been built', () => {
    const { container } = render(<SiteFooter />);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href')!);
    for (const dead of ['/about', '/contact', '/changelog', '/status', '/terms']) {
      expect(hrefs).not.toContain(dead);
    }
  });

  it('carries the copyright line in the approved form', () => {
    render(<SiteFooter />);
    expect(screen.getByText('© 2026 RebelShops')).toBeInTheDocument();
  });
});

describe('routes', () => {
  it('points pricing at the homepage block until /pricing is mounted', () => {
    expect(ROUTES.pricing).toBe('/#pricing');
  });
});
