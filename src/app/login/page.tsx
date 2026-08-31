import type { Metadata } from 'next';
import { isClerkConfigured, isNativeLoginEnabled } from '@/lib/auth/clerk-config';
import ClerkSignInScreen from '@/components/auth/ClerkSignInScreen';
import SignInUnavailable from '@/components/auth/SignInUnavailable';

export const metadata: Metadata = {
  title: 'Sign in · RebelShops',
  description: 'Sign in to your RebelShops store.',
};

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

  return <SignInUnavailable nativeLoginEnabled={isNativeLoginEnabled()} />;
}
