import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isClerkConfigured, isNativeLoginEnabled } from '@/lib/auth/clerk-config';
import NativeLoginForm from '@/components/auth/NativeLoginForm';
import styles from '@/components/auth/AuthScreen.module.css';

export const metadata: Metadata = {
  title: 'Legacy sign-in · RebelShops',
  description: 'Email and password sign-in for RebelShops stores that predate Clerk.',
};

/**
 * Read per request: the flag is a rollback lever, so flipping it must not need a redeploy.
 */
export const dynamic = 'force-dynamic';

/**
 * `/native-login` — the legacy email/password form.
 *
 * 404s rather than 403s when `ENABLE_NATIVE_LOGIN` is off, matching the API routes behind it: a
 * page that says "this exists but is closed" is a free hint about which door to keep knocking on.
 *
 * @returns The legacy sign-in page.
 */
export default function NativeLoginPage() {
  if (!isNativeLoginEnabled()) {
    notFound();
  }

  return (
    <NativeLoginForm
      banner={
        <div className={styles.legacyBanner} role="note">
          <div>
            <p className={styles.legacyBannerTitle}>Legacy sign-in</p>
            <p className={styles.legacyBannerText}>
              Email and password only, with no password reset.{' '}
              {isClerkConfigured() ? (
                <>
                  Reset, Google and two-factor are on the{' '}
                  <Link href="/login">main sign-in page</Link>.
                </>
              ) : (
                'It is the fallback door, kept open while sign-in moves to an identity provider.'
              )}
            </p>
          </div>
        </div>
      }
    />
  );
}
