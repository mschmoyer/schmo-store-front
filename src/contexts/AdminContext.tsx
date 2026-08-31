'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  AdminUser,
  AdminSession,
  AdminContext as AdminContextType,
  AdminLoginRequest,
  AdminVerifyResponse,
} from '@/lib/types/admin';
import { useRouter } from 'next/navigation';
import { useClerk } from '@clerk/nextjs';
import { useClerkAvailable } from '@/components/auth/ClerkAvailability';

const AdminContext = createContext<AdminContextType | null>(null);

/**
 * Every request here goes out with `credentials: 'include'` and **no `Authorization` header**.
 *
 * The session used to travel twice: an httpOnly cookie *and* a copy of the same JWT mirrored into
 * `localStorage.admin_token`, replayed as a Bearer header by roughly forty call sites. That copy
 * was readable by any script on the origin — one XSS and the session walked — and the two
 * transports could disagree, which is the bug class `platform-admin.ts` complains about in its
 * header. Same-origin `fetch` sends the cookie on its own; nothing needs to carry a token.
 */
const CREDENTIALS: RequestInit = { credentials: 'include' };

/**
 * Ask the server whether the signed-in user is a platform operator.
 *
 * `/api/admin/auth/login` deliberately does not report this. The flag is a fresh `users.is_admin`
 * read that only `/api/admin/auth/verify` performs, so that granting or revoking platform access
 * takes effect inside the life of an already-signed session rather than at the next sign-in. That
 * leaves a gap immediately after login — the user object the login route returns has no `isAdmin`
 * at all — which this closes by re-verifying.
 *
 * A failure here is not fatal and must not undo a sign-in that succeeded: the flag only decides
 * whether the sidebar draws a link. Drawing the link is not access control — `/platform` and every
 * `/api/platform/*` route re-check `users.is_admin` server-side on every request.
 *
 * @returns `true` when the server reports the user as a platform admin, `false` in every other case.
 */
async function fetchIsAdmin(): Promise<boolean> {
  try {
    const response = await fetch('/api/admin/auth/verify', CREDENTIALS);

    if (!response.ok) return false;

    const data: AdminVerifyResponse = await response.json();
    return data.success === true && data.data?.user.isAdmin === true;
  } catch (error) {
    console.error('Admin flag lookup failed:', error);
    return false;
  }
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
}

interface AdminProviderProps {
  children: React.ReactNode;
}

interface AdminProviderInnerProps extends AdminProviderProps {
  /** Ends the Clerk session too. Absent when no `<ClerkProvider>` is mounted. */
  clerkSignOut?: () => Promise<unknown>;
}

function AdminProviderInner({ children, clerkSignOut }: AdminProviderInnerProps) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [session, setSession] = useState<AdminSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user && !!session;

  // Verify session on mount
  useEffect(() => {
    const localForceLogout = () => {
      setUser(null);
      setSession(null);
      router.push('/login');
    };

    const verifySession = async () => {
      try {
        const response = await fetch('/api/admin/auth/verify', CREDENTIALS);

        if (response.ok) {
          // The verify payload is the one place `isAdmin` comes from, so it is stored whole rather
          // than field-by-field: whatever the server says about this user is what the shell holds.
          const data: AdminVerifyResponse = await response.json();
          if (data.success && data.data) {
            const verifiedUser = data.data.user;
            setUser(verifiedUser);
            setSession({
              id: verifiedUser.id,
              storeId: verifiedUser.storeId,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              createdAt: new Date()
            });
          }
        } else {
          localForceLogout();
        }
      } catch (error) {
        console.error('Session verification failed:', error);
        localForceLogout();
      } finally {
        setIsLoading(false);
      }
    };

    verifySession();
  }, [router]);

  const login = async (credentials: AdminLoginRequest) => {
    try {
      setIsLoading(true);

      // `/api/auth/login`, not its `/api/admin/auth/login` twin: only this one sets the `session`
      // cookie. The admin route returns a token in JSON and nothing else, which authenticated
      // nothing the moment the localStorage copy went away — it would have reported a successful
      // sign-in that established no session at all.
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (response.ok && data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email,
          storeId: data.store?.id ?? '',
          store: data.store ?? { id: '', name: '', slug: '', theme_id: '' },
        });
        setSession({
          id: data.user.id,
          storeId: data.store?.id ?? '',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        });

        // The login response carries no `isAdmin` — see `fetchIsAdmin`. Without this the sidebar
        // would be missing the platform door until the next full page load re-ran the mount verify.
        // It is merged rather than replacing the user wholesale because the login payload carries
        // store fields (description, theme) that verify does not return.
        const isAdmin = await fetchIsAdmin();
        setUser((current) => (current ? { ...current, isAdmin } : current));

        return true;
      } else {
        throw new Error(data.message || data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    // Both sessions have to end, and either may be the live one during the migration window: ours is
    // the httpOnly cookie this route clears, Clerk's is Clerk's own. Signing out of one and leaving
    // the other is how a "logged out" merchant walks straight back into /admin — so both are always
    // attempted even if the first fails (a chained `await` would skip the second on a throw).
    const results = await Promise.allSettled([
      fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'include' }),
      clerkSignOut?.() ?? Promise.resolve(),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') console.error('Logout: a sign-out step failed:', result.reason);
    }
    setUser(null);
    setSession(null);
    router.push('/login');
  };

  const forceLogout = () => {
    setUser(null);
    setSession(null);
    router.push('/login');
  };

  const verify = async () => {
    try {
      const response = await fetch('/api/admin/auth/verify', CREDENTIALS);

      if (response.ok) {
        const data = await response.json();
        return data.success;
      }

      return false;
    } catch (error) {
      console.error('Session verification failed:', error);
      return false;
    }
  };

  const value: AdminContextType = {
    user,
    session,
    isAuthenticated,
    isLoading,
    login,
    logout,
    verify,
    forceLogout
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

/**
 * The provider, with Clerk's sign-out wired in.
 *
 * Split out because `useClerk` **throws** outside a `<ClerkProvider>`, and the root layout mounts
 * one only when a publishable key exists. A conditional hook call is not an option, so the
 * condition moves up a component instead.
 *
 * @param props.children - The admin tree.
 * @returns The provider.
 */
function ClerkAwareAdminProvider({ children }: AdminProviderProps) {
  const { signOut } = useClerk();
  return <AdminProviderInner clerkSignOut={() => signOut()}>{children}</AdminProviderInner>;
}

/**
 * Merchant admin session context.
 *
 * The branch is on whether the root layout actually mounted a `<ClerkProvider>` — a value fixed
 * for the life of the process, so the two subtrees can never swap at runtime and hook order is
 * stable. Asking the publishable key directly would be wrong: it is set on a deployment missing
 * `CLERK_SECRET_KEY` too, and there the layout mounts no provider, so `useClerk` would throw.
 *
 * @param props.children - The admin tree.
 * @returns The provider appropriate to this environment's configuration.
 */
export function AdminProvider({ children }: AdminProviderProps) {
  return useClerkAvailable() ? (
    <ClerkAwareAdminProvider>{children}</ClerkAwareAdminProvider>
  ) : (
    <AdminProviderInner>{children}</AdminProviderInner>
  );
}
