'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui';
import { ROUTES } from '../data/routes';
import { Wordmark } from './Wordmark';
import styles from './SiteHeader.module.css';

interface NavItem {
  href: string;
  label: string;
}

const NAV: readonly NavItem[] = [
  { href: ROUTES.features, label: 'Features' },
  { href: ROUTES.howItWorks, label: 'How it works' },
  { href: ROUTES.pricing, label: 'Pricing' },
  { href: ROUTES.demoStores, label: 'Demo stores' },
];

/** Selector matching everything inside the mobile panel that can take focus. */
const FOCUSABLE = 'a[href], button:not([disabled])';

/**
 * The marketing site header: sticky, condensing to a hairline bar once the page
 * scrolls, with a mobile panel that traps focus and closes on Escape.
 *
 * Every link points at a route that exists — see `../data/routes`.
 *
 * @returns The site header.
 */
export function SiteHeader(): React.JSX.Element {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const toggleRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    const onScroll = (): void => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Route changes should never leave the panel hanging open behind the new page.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return undefined;

    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab' || !panel) return;

      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

      <header className={`${styles.root} ${scrolled ? styles.scrolled : ''}`} data-scrolled={scrolled}>
        <div className={styles.bar}>
          <Link href={ROUTES.home} className={styles.brand} aria-label="RebelShops home">
            <Wordmark size={scrolled ? 26 : 30} />
          </Link>

          <nav className={styles.nav} aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
                aria-current={pathname === item.href ? 'page' : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.actions}>
            <Button as={Link} href={ROUTES.signIn} variant="ghost" size="sm">
              Sign in
            </Button>
            <Button as={Link} href={ROUTES.signUp} size="sm">
              Start for $1
            </Button>
          </div>

          <button
            ref={toggleRef}
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            <span className={`${styles.toggleBar} ${open ? styles.toggleBarTop : ''}`} />
            <span className={`${styles.toggleBar} ${open ? styles.toggleBarHidden : ''}`} />
            <span className={`${styles.toggleBar} ${open ? styles.toggleBarBottom : ''}`} />
          </button>
        </div>
      </header>

      {open ? (
        <div className={styles.scrim} onClick={() => setOpen(false)} aria-hidden="true" />
      ) : null}

      <div
        id="site-menu"
        ref={panelRef}
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
      >
        <nav className={styles.panelNav} aria-label="Mobile">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={styles.panelLink}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className={styles.panelActions}>
          <Button as={Link} href={ROUTES.signUp} size="lg" fullWidth>
            Start for $1
          </Button>
          <Button as={Link} href={ROUTES.signIn} variant="secondary" size="lg" fullWidth>
            Sign in
          </Button>
        </div>
        <p className={styles.panelNote}>
          $1 for 3 months, then $19.99/mo. No transaction fees. Cancel anytime.
        </p>
      </div>
    </>
  );
}

export default SiteHeader;
