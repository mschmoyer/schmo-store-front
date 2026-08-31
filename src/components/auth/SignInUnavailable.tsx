import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button, EmptyState } from '@/components/ui';
import styles from './AuthScreen.module.css';

export interface SignInUnavailableProps {
  /** Draws the escape hatch to `/native-login`. Only true when that route exists. */
  nativeLoginEnabled: boolean;
}

/**
 * `/login` with no Clerk keys.
 *
 * Says so, rather than rendering a form that cannot work or throwing. Auth still fails closed —
 * "not configured" means nobody signs in here, never that everybody does.
 *
 * @param props.nativeLoginEnabled - Whether to offer the legacy password sign-in.
 * @returns The labelled unconfigured state.
 */
export default function SignInUnavailable({
  nativeLoginEnabled,
}: SignInUnavailableProps): React.ReactElement {
  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <Link href="/" className={styles.brand} aria-label="RebelShops home">
          <Image
            src="/brand/logo-horizontal.svg"
            alt="RebelShops"
            width={134}
            height={22}
            priority
            className={styles.brandMark}
          />
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.notice}>
          <EmptyState
            titleAs="h1"
            title="Sign-in is not configured for this environment"
            description="This deployment has no identity provider keys, so there is nothing to sign in to. A production store is unaffected."
            action={
              nativeLoginEnabled ? (
                // `as="a"`, not `as={Link}`: this is a server component, and a component passed
                // across the RSC boundary is a function React cannot serialize — it throws, and
                // takes the whole page down. A tag name is a string, so it survives the boundary.
                <Button as="a" href="/native-login" variant="secondary">
                  Use legacy sign-in
                </Button>
              ) : undefined
            }
          />
        </div>
      </main>
    </div>
  );
}
