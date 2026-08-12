import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SiteHeader } from '../chrome/SiteHeader';
import { SiteFooter } from '../chrome/SiteFooter';
import { ROUTES } from '../data/routes';

/**
 * Every route the marketing chrome is allowed to point at, derived from the
 * filesystem rather than hand-maintained.
 *
 * A literal allowlist here defeats the test's own purpose. It went stale the
 * moment `/pricing` was mounted: the chrome correctly started linking to the
 * real pricing route and this guard failed, reporting a defect in the code when
 * the defect was in the list. Reading `src/app` means a new page is trusted the
 * moment it exists, and a link to a page that does NOT exist still fails, which
 * is the only thing this test was ever meant to catch.
 */
const APP_DIR = path.join(process.cwd(), 'src', 'app');

/**
 * Walks the App Router tree and collects every statically routable path.
 *
 * @param dir - Directory to walk.
 * @param prefix - Route prefix accumulated so far.
 * @returns Every static route found beneath `dir`.
 */
function collectRoutes(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) found.push(prefix || '/');
      continue;
    }
    // Skip private folders (_foo), API routes, and dynamic segments — a link to
    // a dynamic route is checked by its concrete instances in the seed data.
    if (entry.name.startsWith('_') || entry.name === 'api') continue;
    if (entry.name.startsWith('[')) continue;
    // Route groups (foo) do not contribute a path segment.
    const segment = entry.name.startsWith('(') ? '' : `/${entry.name}`;
    found.push(...collectRoutes(path.join(dir, entry.name), prefix + segment));
  }
  return found;
}

const EXISTING_ROUTES = new Set<string>([
  ...collectRoutes(APP_DIR),
  // Concrete instances of the dynamic /store/[storeSlug] route, from the demo seed.
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
  it('points pricing at the real route, not a homepage anchor', () => {
    // This used to assert '/#pricing'. That anchor scrolled 7,533px down the
    // homepage while a full /pricing route sat orphaned, and it is a large part
    // of why the homepage had to carry a duplicate pricing block at all.
    expect(ROUTES.pricing).toBe('/pricing');
  });

  it('never points at a homepage anchor for a page that exists', () => {
    for (const [name, href] of Object.entries(ROUTES)) {
      if (typeof href !== 'string') continue;
      expect(`${name}=${href}`).not.toMatch(/^[a-z]+=\/#/);
    }
  });
});
