'use client';

import React, { useEffect } from 'react';
import { AppShell } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useRouter } from 'next/navigation';
import { IconRefresh, IconShieldLock } from '@tabler/icons-react';
import { Button } from '@/components/ui';
import {
  PlatformHeader,
  PlatformNav,
  PlatformShellSkeleton,
  usePlatformAccess,
} from '@/components/platform';
import styles from './platform.module.css';

/**
 * The operator console's shell.
 *
 * ## The client check is a courtesy, not the gate
 *
 * This layout asks `/api/admin/auth/verify` whether the current session belongs to a platform
 * operator, and renders a refusal when it does not. **That check authorises nothing.** It exists so
 * a merchant who follows a stale link reads one clear sentence instead of a console full of failed
 * requests, and so an operator is not shown chrome around data that will never arrive.
 *
 * Every figure this console displays is fetched from `/api/platform/*`, and every one of those
 * routes calls `requirePlatformAdmin(request)`, which re-reads `users.is_admin` from the database
 * on each request. A visitor who edits this component's state in a devtools console, or who removes
 * the check entirely from a local bundle, gets the sidebar and six 403s. Do not add a figure to this
 * console that is computed anywhere but behind that server-side check.
 *
 * ## Why 401 and 403 are handled differently
 *
 * They are different problems with different remedies. A 401 means the session expired or never
 * existed — the answer is `/login`, and redirecting is right because there is nothing to read. A
 * 403 means a real, valid session that is simply not an operator's — redirecting that person to a
 * login screen would tell them to sign in again as themselves and hit the same wall, so they get a
 * sentence and a door back to their own store instead.
 *
 * A failure of the verify call itself is a third thing again, and it is neither of the above: the
 * console says so and offers a retry rather than guessing that the viewer is signed out.
 *
 * ## Why this is not the layout itself
 *
 * A file that opens with `'use client'` cannot export `metadata`, and the console needs a page
 * title of its own — an operator with fifteen tabs open should be able to tell this one from a
 * merchant's admin. `layout.tsx` is a server component that owns the title and renders this.
 *
 * @param props.children - The routed console page.
 * @returns The console shell, or the state that stands in for it.
 */
export function PlatformConsoleShell({ children }: { children: React.ReactNode }) {
  const [opened, { toggle }] = useDisclosure();
  const { status, user, recheck } = usePlatformAccess();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signed-out') {
      router.replace('/login');
    }
  }, [status, router]);

  /* §5: skeletons matching final geometry. Never a spinner in the middle of a blank page. */
  if (status === 'checking' || status === 'signed-out') {
    return <PlatformShellSkeleton />;
  }

  if (status === 'not-operator') {
    return (
      <div className={styles.gate}>
        <div className={styles.gateCard} role="alert">
          <span className={styles.gateMark} aria-hidden="true">
            <IconShieldLock size={20} stroke={1.6} />
          </span>
          <h1 className={styles.gateTitle}>Not a platform operator</h1>
          <p className={styles.gateBody}>
            You are signed in as {user?.email ?? 'this account'}, which does not have platform
            operator access. The console reads every merchant&rsquo;s data, so it is granted
            deliberately rather than by default.
          </p>
          <p className={styles.gateBody}>
            If you believe this is wrong, ask an existing operator to grant your account access.
          </p>
          <div className={styles.gateActions}>
            <Button href="/admin">Back to my store</Button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={styles.gate}>
        <div className={styles.gateCard} role="alert">
          <span className={styles.gateMark} aria-hidden="true">
            <IconShieldLock size={20} stroke={1.6} />
          </span>
          <h1 className={styles.gateTitle}>Could not verify your session</h1>
          <p className={styles.gateBody}>
            The console could not reach the session service, so it does not know whether you are an
            operator. It will not guess — nothing is shown until the check succeeds.
          </p>
          <div className={styles.gateActions}>
            <Button onClick={recheck} leftIcon={<IconRefresh size={16} />}>
              Try again
            </Button>
            <Button variant="secondary" href="/admin">
              Back to my store
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: { base: 240, lg: 264 },
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding={0}
    >
      <AppShell.Header>
        <PlatformHeader
          email={user?.email ?? ''}
          onMenuToggle={toggle}
          menuOpened={opened}
        />
      </AppShell.Header>

      <AppShell.Navbar>
        <PlatformNav onNavClick={() => opened && toggle()} />
      </AppShell.Navbar>

      <AppShell.Main>
        <div className={styles.page}>{children}</div>
      </AppShell.Main>
    </AppShell>
  );
}
