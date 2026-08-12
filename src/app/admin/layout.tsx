'use client';

import React, { useEffect } from 'react';
import { AppShell } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { AdminProvider, useAdmin } from '@/contexts/AdminContext';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminShellSkeleton } from '@/components/admin/AdminSkeletons';
import { useRouter, usePathname } from 'next/navigation';
import styles from './admin.module.css';

interface AdminLayoutContentProps {
  children: React.ReactNode;
}

/** A route segment that is a record id rather than a word. */
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns `/admin/purchase-orders/create` into breadcrumb rows.
 *
 * A record id gets a readable label instead of being title-cased word by word.
 * The old rule split every segment on `-` and capitalised each piece, which
 * turned a product's uuid into the breadcrumb
 * `802b7e5e Aa47 4539 8d64 Fbf81a65cd95` — thirty-six characters of noise in
 * the one place on the screen that is supposed to say where you are. The page's
 * own `<h1>` already names the record; the crumb only has to say what kind of
 * thing it is.
 *
 * @param pathname - The current route.
 * @returns Ordered crumbs; the last one has no `href` and reads as the page.
 */
function buildBreadcrumbs(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Array<{ label: string; href?: string }> = [{ label: 'Dashboard', href: '/admin' }];

  /** Singularises the parent collection: `orders` -> `Order`. */
  const recordLabel = (parent: string | undefined) => {
    if (!parent) return 'Details';
    const words = parent
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return words.endsWith('s') ? words.slice(0, -1) : words;
  };

  let currentPath = '';
  for (let i = 1; i < segments.length; i += 1) {
    currentPath += `/${segments[i]}`;
    const label = UUID_SEGMENT.test(segments[i])
      ? recordLabel(segments[i - 1])
      : segments[i]
          .split('-')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    crumbs.push({
      label,
      href: i === segments.length - 1 ? undefined : `/admin${currentPath}`,
    });
  }

  return crumbs;
}

function AdminLayoutContent({ children }: AdminLayoutContentProps) {
  const [opened, { toggle }] = useDisclosure();
  const { user, isAuthenticated, isLoading } = useAdmin();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/login') {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  /*
   * §5: "skeletons matching final layout geometry. No centered spinners on full
   * pages." This used to be a `<Center h="100vh">` with a Loader in it, so the
   * whole admin flashed an empty page with a dot in the middle of it on every
   * cold load before the shell appeared.
   */
  if (isLoading) {
    return <AdminShellSkeleton />;
  }

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: { base: 240, lg: 260 },
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding={0}
    >
      <AppShell.Header>
        <AdminHeader
          user={user!}
          breadcrumbs={buildBreadcrumbs(pathname)}
          onMenuToggle={toggle}
          menuOpened={opened}
        />
      </AppShell.Header>

      <AppShell.Navbar>
        <AdminNav onNavClick={() => opened && toggle()} />
      </AppShell.Navbar>

      <AppShell.Main>
        <div className={styles.page}>{children}</div>
      </AppShell.Main>
    </AppShell>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminProvider>
  );
}
