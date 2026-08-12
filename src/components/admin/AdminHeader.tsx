'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Anchor, Breadcrumbs, Burger, Group, Text } from '@mantine/core';
import { AdminBreadcrumb } from '@/lib/types/admin';
import styles from './AdminChrome.module.css';

interface AdminHeaderProps {
  user: {
    email: string;
    store: {
      name: string;
      slug: string;
    };
  };
  breadcrumbs?: AdminBreadcrumb[];
  onMenuToggle?: () => void;
  menuOpened?: boolean;
  onLogout?: () => Promise<void>;
}

/**
 * The admin top bar.
 *
 * Rebuilt onto the design system. What it used to be, and why each part is
 * gone:
 *
 * - A `linear-gradient(135deg, #4a4a4a, #3a3a3a, #2a2a2a)` slab. That single
 *   declaration is most of what the owner saw as "black background throughout":
 *   the tallest, widest element on every admin screen was near-black on a
 *   product whose ground is `#FFFFFF`. §2 permits exactly one inverted block in
 *   the product, and it is the marketing pricing section — not app chrome.
 * - A hand-drawn red shopping-cart SVG (`RebelShopLogo`, hard-coded `#dc2626`).
 *   The mark is now `public/brand/logo-horizontal.svg`, the real one.
 * - The name "RebelShop" and the tagline "Take Back Your Margins". The product
 *   is **RebelShops**; the tagline is retired.
 *
 * @param props - {@link AdminHeaderProps}
 * @returns The header row rendered inside `AppShell.Header`.
 */
export function AdminHeader({
  user,
  breadcrumbs = [],
  onMenuToggle,
  menuOpened = false,
  onLogout, // eslint-disable-line @typescript-eslint/no-unused-vars
}: AdminHeaderProps) {
  return (
    <div className={styles.header}>
      <Group gap="md" wrap="nowrap" className={styles.headerLeft}>
        <Burger
          opened={menuOpened}
          onClick={onMenuToggle}
          hiddenFrom="sm"
          size="sm"
          aria-label="Toggle navigation"
        />

        <Link href="/admin" className={styles.brand} aria-label="RebelShops admin home">
          <Image
            src="/brand/logo-horizontal.svg"
            alt="RebelShops"
            width={158}
            height={26}
            priority
            className={styles.brandMark}
          />
        </Link>

        <span className={styles.headerRule} aria-hidden="true" />

        {/*
          A `<Select>` used to sit here listing exactly one option — the store
          you are already in. A control that cannot change anything is a lie
          about what is possible, and Mantine drew it as a 40px bordered field,
          which made the busiest thing in the top bar a dropdown that does
          nothing. Multi-store switching does not exist yet; when it does, this
          becomes a real control.
        */}
        <div className={styles.headerMeta}>
          <span className={styles.storeName}>{user.store.name}</span>

          {breadcrumbs.length > 1 && (
            <Breadcrumbs
              separator="/"
              separatorMargin={6}
              classNames={{ root: styles.crumbs, separator: styles.crumbSeparator }}
            >
              {breadcrumbs.map((breadcrumb, index) => (
                <Anchor
                  key={index}
                  href={breadcrumb.href}
                  size="xs"
                  className={breadcrumb.href ? styles.crumbLink : styles.crumbCurrent}
                  aria-current={breadcrumb.href ? undefined : 'page'}
                >
                  {breadcrumb.label}
                </Anchor>
              ))}
            </Breadcrumbs>
          )}
        </div>
      </Group>

      <Text size="xs" c="dimmed" visibleFrom="md" className={styles.headerUser}>
        {user.email}
      </Text>
    </div>
  );
}
