import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isClerkConfigured, isNativeLoginEnabled } from '@/lib/auth/clerk-config';
import NativeLoginForm from '@/components/auth/NativeLoginForm';
import styles from '@/components/auth/AuthScreen.module.css';

export const metadata: Metadata = {
  title: 'Sign in · RebelShops',
  description: 'Sign in to your RebelShops store.',
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

  // The "legacy / fallback" framing only makes sense when Clerk is the primary door and this is the
  // secondary one — then the banner earns its place by pointing at reset/Google/2FA on `/login`.
  // When Clerk is off, this page *is* the sign-in page (every deployment without Clerk keys, and
  // every rollback), so it must not disown itself as deprecated and half-broken. No banner then.
  const banner = isClerkConfigured() ? (
    <div className={styles.legacyBanner} role="note">
      <div>
        <p className={styles.legacyBannerTitle}>Legacy sign-in</p>
        <p className={styles.legacyBannerText}>
          Email and password only, with no password reset. Reset, Google and two-factor are on the{' '}
          <Link href="/login">main sign-in page</Link>.
        </p>
      </div>
    </div>
  ) : undefined;

  return <NativeLoginForm banner={banner} />;
}
