'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Anchor, Breadcrumbs, Burger, Group, Select, Text } from '@mantine/core';
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

        <div className={styles.headerMeta}>
          <Select
            aria-label="Active store"
            value={user.store.name}
            data={[{ value: user.store.name, label: user.store.name }]}
            allowDeselect={false}
            size="xs"
            variant="unstyled"
            classNames={{ input: styles.storeSelect }}
          />

          {breadcrumbs.length > 0 && (
            <Breadcrumbs
              separator="/"
              separatorMargin={6}
              classNames={{ separator: styles.crumbSeparator }}
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
