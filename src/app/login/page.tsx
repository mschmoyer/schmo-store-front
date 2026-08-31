import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isClerkConfigured, isNativeLoginEnabled } from '@/lib/auth/clerk-config';
import ClerkSignInScreen from '@/components/auth/ClerkSignInScreen';
import SignInUnavailable from '@/components/auth/SignInUnavailable';

export const metadata: Metadata = {
  title: 'Sign in · RebelShops',
  description: 'Sign in to your RebelShops store.',
};

/**
 * Read per request. Both the Clerk-vs-native branch and the `CLERK_SECRET_KEY` half of
 * `isClerkConfigured()` are runtime facts, and `ENABLE_NATIVE_LOGIN` is a rollback lever that must
 * take effect without a redeploy — a statically prerendered `/login` would freeze all three at
 * build time and serve the wrong door (or a stale "not configured" card) at runtime.
 */
export const dynamic = 'force-dynamic';

/**
 * `/login` — the front door.
 *
 * A server component so the branch is decided where `CLERK_SECRET_KEY` is actually readable: a
 * client component would only ever see the publishable half and would render a widget no route
 * can verify a session from. Both branches are static markup with no environment access at module
 * scope, which is what keeps the keyless production build green.
 *
 * The legacy password form is not here. It lives at `/native-login`, behind `ENABLE_NATIVE_LOGIN`,
 * so that "the sign-in page" always means Clerk and the escape hatch has to be chosen on purpose.
 *
 * @returns The sign-in page.
 */
export default function LoginPage() {
  if (isClerkConfigured()) {
    return <ClerkSignInScreen />;
  }

  // Clerk is off. If the native escape hatch is open it is the *working* door, so send people
  // straight to it rather than showing a "sign-in is not configured" card with a secondary link
  // buried under it — every logout, expiry and unauthenticated bounce lands on `/login`, and in a
  // Clerk-off deployment that card is the only thing they would see. The bleak "nothing to sign in
  // to" state is reserved for when native login is also disabled and there genuinely is no door.
  if (isNativeLoginEnabled()) {
    redirect('/native-login');
  }

  return <SignInUnavailable nativeLoginEnabled={false} />;
}
