'use client';

import * as React from 'react';
import Link from 'next/link';
import { IconMenu2, IconSearch, IconX } from '@tabler/icons-react';

import { StoreButton, storeUi } from '../ui';
import styles from './Chrome.module.css';

export interface NavItem {
  label: string;
  href: string;
}

export interface MobileNavProps {
  storeName: string;
  items: NavItem[];
  searchAction: string;
}

/** Selector matching everything that can hold keyboard focus inside the drawer. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The small-screen navigation drawer.
 *
 * Implements the three things a modal dialog owes a keyboard user, none of
 * which come for free: focus moves into the drawer on open and returns to the
 * trigger on close, Tab is trapped inside it, and Escape dismisses it. The
 * background is also locked so the page behind cannot scroll away underneath.
 *
 * @param props - {@link MobileNavProps}
 * @returns A menu button plus its drawer
 */
export function MobileNav({ storeName, items, searchAction }: MobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;

    const drawer = drawerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus in, so the first Tab lands inside the dialog rather than
    // somewhere behind it.
    const first = drawer?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !drawer) return;

      const focusable = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.offsetParent !== null,
      );
      if (focusable.length === 0) return;

      const firstNode = focusable[0];
      const lastNode = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && active === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // Returning focus is what stops a keyboard user from being dumped at the
      // top of the document every time they close the menu.
      (previouslyFocused ?? triggerRef.current)?.focus?.();
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.iconButton} ${styles.menuButton}`}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <IconMenu2 size={22} aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className={styles.scrim}
            aria-label="Close menu"
            tabIndex={-1}
            onClick={close}
          />
          <div
            ref={drawerRef}
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label={`${storeName} menu`}
          >
            <div className={styles.drawerHead}>
              <span className={styles.brandName}>{storeName}</span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={close}
                aria-label="Close menu"
              >
                <IconX size={22} aria-hidden="true" />
              </button>
            </div>

            <form
              action={searchAction}
              role="search"
              className={`${styles.searchForm} ${styles.drawerSearch}`}
            >
              <span className={styles.searchIcon}>
                <IconSearch size={17} aria-hidden="true" />
              </span>
              <label htmlFor="mobile-store-search" className={storeUi.srOnly}>
                Search products
              </label>
              <input
                id="mobile-store-search"
                className={styles.searchInput}
                type="search"
                name="q"
                placeholder="Search products"
              />
            </form>

            <nav className={styles.drawerNav} aria-label="Store">
              {items.map((item) => (
                <Link key={item.href} href={item.href} className={styles.drawerLink} onClick={close}>
                  {item.label}
                </Link>
              ))}
            </nav>

            <StoreButton onClick={close} variant="secondary" block>
              Close
            </StoreButton>
          </div>
        </>
      ) : null}
    </>
  );
}
