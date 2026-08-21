'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Burger, Group, Text } from '@mantine/core';
import styles from './PlatformChrome.module.css';

export interface PlatformHeaderProps {
  /** The signed-in operator's email. Shown so it is obvious whose session this is. */
  email: string;
  /** Opens and closes the mobile navigation drawer. */
  onMenuToggle?: () => void;
  /** Whether the drawer is open, for the burger's state. */
  menuOpened?: boolean;
}

/**
 * The console's top bar.
 *
 * Same mark, same white ground, same hairline as the merchant header — and then one word that
 * changes everything: an **Operator console** eyebrow sitting where the merchant bar puts the store
 * name. That is the whole differentiation strategy, and it is deliberate. Somebody who administers
 * their own store and the platform sees both bars in the same session; if the console looked like a
 * different product they would have to re-learn it, and if it looked identical they could act on
 * every tenant's data thinking they were in their own store. One eyebrow and a grey rail is the
 * smallest change that makes the second mistake impossible.
 *
 * @param props - {@link PlatformHeaderProps}
 * @returns The header row rendered inside `AppShell.Header`.
 */
export function PlatformHeader({
  email,
  onMenuToggle,
  menuOpened = false,
}: PlatformHeaderProps): React.ReactElement {
  return (
    <div className={styles.header}>
      <Group gap="md" wrap="nowrap" className={styles.headerLeft}>
        <Burger
          opened={menuOpened}
          onClick={onMenuToggle}
          hiddenFrom="sm"
          size="sm"
          aria-label="Toggle console navigation"
        />

        <Link href="/platform" className={styles.brand} aria-label="RebelShops operator console home">
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

        <span className={styles.consoleTag}>Operator console</span>
      </Group>

      <Text size="xs" c="dimmed" visibleFrom="md" className={styles.headerUser}>
        {email}
      </Text>
    </div>
  );
}
