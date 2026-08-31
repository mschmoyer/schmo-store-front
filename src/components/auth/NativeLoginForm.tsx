'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { validateEmail } from '@/components/onboarding/lib/password';
import styles from './AuthScreen.module.css';

/** Warning triangle for the failure alert. */
function AlertMark(): React.ReactElement {
  return (
    <svg className={styles.alertIcon} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.9 15 14.3H1L8 1.9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.3v3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11.7" r="0.85" fill="currentColor" />
    </svg>
  );
}

export interface NativeLoginFormProps {
  /** Rendered above the fields. Used by `/native-login` to label the legacy path. */
  banner?: React.ReactNode;
}

/**
 * The email/password sign-in screen served by `/api/auth/login`.
 *
 * Deliberately says the same thing whether the email is unknown or the password
 * is wrong: **"That email and password don't match."** Anything more specific
 * turns this form into an account-enumeration oracle. The server already returns
 * one message for both cases; this screen does not undo that by rendering
 * different copy per status code.
 *
 * @param props.banner - Optional notice rendered above the fields.
 * @returns The native sign-in screen.
 */
export default function NativeLoginForm({ banner }: NativeLoginFormProps): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [touched, setTouched] = React.useState<{ email?: boolean; password?: boolean }>({});
  const [failure, setFailure] = React.useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = React.useState(false);

  const emailError = validateEmail(email);
  const passwordError = password ? null : 'This field is required';
  const isValid = !emailError && !passwordError;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched({ email: true, password: true });
    if (!isValid || busy) return;

    setBusy(true);
    setFailure(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!response.ok) {
        // 401 and 404 are the same message on purpose: never confirm whether an
        // address has an account here.
        setFailure(
          response.status === 401 || response.status === 400 || response.status === 404
            ? {
                title: 'That didn’t work',
                body: 'That email and password don’t match. Check both and try again.',
              }
            : {
                title: 'Something broke on our end',
                body: 'We’ve been notified. Try again in a moment.',
              }
        );
        // Clear the password but un-touch the field: showing "This field is
        // required" under an empty box we just emptied ourselves is noise on top
        // of the real message.
        setPassword('');
        setTouched((current) => ({ ...current, password: false }));
        return;
      }

      // The route still returns `token`, and nothing here keeps it: the session
      // rides in the httpOnly cookie the same response sets. Mirroring it into
      // localStorage was the XSS-steals-a-session hole the Clerk migration
      // closes, and every admin screen now sends the cookie instead.
      const result = (await response.json()) as { storeSlug?: string };
      router.push(result.storeSlug ? `/admin?store=${result.storeSlug}` : '/create-store');
    } catch {
      setFailure({
        title: 'We couldn’t reach the server',
        body: 'Check your connection and try again.',
      });
    } finally {
      setBusy(false);
    }
  };

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
        <form className={styles.card} onSubmit={handleSubmit} noValidate>
          <span className={styles.eyebrow}>Welcome back</span>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.subtitle}>Your store, your catalog and your orders.</p>

          {banner}

          {failure ? (
            <div className={styles.alert} role="alert" aria-live="assertive">
              <AlertMark />
              <div className={styles.alertBody}>
                <p className={styles.alertTitle}>{failure.title}</p>
                <p className={styles.alertText}>{failure.body}</p>
              </div>
            </div>
          ) : null}

          <div className={styles.fields}>
            <Input
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              autoFocus
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFailure(null);
              }}
              onBlur={() => setTouched((current) => ({ ...current, email: true }))}
              error={touched.email ? (emailError ?? undefined) : undefined}
            />

            {/* Still no "Forgot password?" link. Reset exists now, but it is
                Clerk's, on the Clerk-backed /login; this form is the legacy
                escape hatch and has no reset flow of its own to point at. */}
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFailure(null);
              }}
              onBlur={() => setTouched((current) => ({ ...current, password: true }))}
              error={touched.password ? (passwordError ?? undefined) : undefined}
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            className={styles.submit}
            loading={busy}
            disabled={!isValid}
          >
            Sign in
          </Button>

          <p className={styles.footer}>
            No store yet? <Link href="/create-store">Start for $1</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
