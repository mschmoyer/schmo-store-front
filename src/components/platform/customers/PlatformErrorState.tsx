'use client';

/**
 * What a failed platform request looks like on screen.
 *
 * The four failures a console operator can hit are four different situations
 * and want four different screens. "Your session expired" is fixed by signing
 * in. "You are not a platform admin" is not — offering a sign-in link there
 * sends someone round a loop that cannot terminate, because signing in again as
 * the same person changes nothing. A 404 on a store id is a dead link and wants
 * a way back to the list. A 500 is worth retrying. Collapsing all four into one
 * red box, which is what this codebase did everywhere before, hands the reader
 * a dead end and no idea which of the four they are in.
 */

import React from 'react';
import Link from 'next/link';
import { IconAlertTriangle, IconArrowLeft, IconLock, IconRefresh } from '@tabler/icons-react';
import { Button, EmptyState } from '@/components/ui';
import type { PlatformFetchError } from './usePlatformFetch';
import styles from './platformErrorState.module.css';

export interface PlatformErrorStateProps {
  /** The typed failure from {@link usePlatformFetch}. */
  error: PlatformFetchError;
  /** What was being loaded, for the 404 copy. e.g. `merchant`. */
  subject?: string;
  /** Where "Back to all merchants" goes. Omitted on the list itself. */
  backHref?: string;
  /** Retry the request. Offered on server and network failures only. */
  onRetry?: () => void;
}

/**
 * Renders the right screen for a failed platform request.
 *
 * @param props - {@link PlatformErrorStateProps}
 * @returns A titled state with the one action that can actually help.
 */
export function PlatformErrorState({
  error,
  subject = 'record',
  backHref,
  onRetry,
}: PlatformErrorStateProps): React.ReactElement {
  const back = backHref ? (
    <Button component={Link} href={backHref} variant="secondary" leftIcon={<IconArrowLeft size={16} />}>
      Back to all merchants
    </Button>
  ) : undefined;

  if (error.kind === 'unauthenticated') {
    return (
      <EmptyState
        className={styles.root}
        illustration={<IconLock size={34} aria-hidden="true" />}
        title="Your session has expired"
        description="Sign in again to continue. The platform console does not keep a session open across a restart."
        action={
          <Button component={Link} href="/login">
            Sign in
          </Button>
        }
        secondaryAction={back}
      />
    );
  }

  if (error.kind === 'forbidden') {
    return (
      <EmptyState
        className={styles.root}
        illustration={<IconLock size={34} aria-hidden="true" />}
        title="This account is not a platform administrator"
        description="You are signed in, but the platform console is restricted to platform admins. Ask an existing admin to grant access, then reload this page."
        action={
          <Button component={Link} href="/admin" variant="secondary">
            Go to your store admin
          </Button>
        }
      />
    );
  }

  if (error.kind === 'not_found') {
    return (
      <EmptyState
        className={styles.root}
        title={`That ${subject} does not exist`}
        description={`Nothing on the platform matches this address. The ${subject} may have been deleted, or the link may be wrong.`}
        action={back}
      />
    );
  }

  return (
    <EmptyState
      className={styles.root}
      illustration={<IconAlertTriangle size={34} aria-hidden="true" />}
      title={error.kind === 'network' ? 'Could not reach the server' : 'The request failed'}
      description={error.message}
      action={
        onRetry ? (
          <Button onClick={onRetry} leftIcon={<IconRefresh size={16} />}>
            Try again
          </Button>
        ) : undefined
      }
      secondaryAction={back}
    />
  );
}
