'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { SignIn } from '@clerk/nextjs';
import { clerkAppearance } from './clerkAppearance';
import styles from './AuthScreen.module.css';

/**
 * `/login` when Clerk is configured.
 *
 * Hash routing on purpose: Clerk's path routing wants `/login/[[...rest]]` to exist for every
 * step it can navigate to (factor two, reset, SSO callback). Hash routing keeps all of that on
 * this one route, so the migration adds no catch-all segments and nothing else in the tree has to
 * know the sign-in flow has sub-steps.
 *
 * @returns The Clerk-backed sign-in screen.
 */
export default function ClerkSignInScreen(): React.ReactElement {
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
        <div className={styles.clerkWell}>
          <SignIn
            routing="hash"
            appearance={clerkAppearance}
            fallbackRedirectUrl="/admin"
            signUpUrl="/create-store"
          />
        </div>
      </main>
    </div>
  );
}
