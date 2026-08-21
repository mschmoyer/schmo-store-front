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

const AdminContext = createContext<AdminContextType | null>(null);

/**
 * Ask the server whether the signed-in user is a platform operator.
 *
 * `/api/admin/auth/login` deliberately does not report this. The flag is a fresh `users.is_admin`
 * read that only `/api/admin/auth/verify` performs, so that granting or revoking platform access
 * takes effect inside the seven-day life of an already-signed session token rather than at the next
 * sign-in. That leaves a gap immediately after login — the user object the login route returns has
 * no `isAdmin` at all — which this closes by re-verifying with the token login just issued.
 *
 * A failure here is not fatal and must not undo a sign-in that succeeded: the flag only decides
 * whether the sidebar draws a link. Drawing the link is not access control — `/platform` and every
 * `/api/platform/*` route re-check `users.is_admin` server-side on every request.
 *
 * @param token - The session token to authenticate the verify call with.
 * @returns `true` when the server reports the user as a platform admin, `false` in every other case.
 */
async function fetchIsAdmin(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/admin/auth/verify', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

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

export function AdminProvider({ children }: AdminProviderProps) {
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
      localStorage.removeItem('admin_token');
      router.push('/login');
    };

    const verifySession = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        if (!token) {
          setIsLoading(false);
          return;
        }
        
        const response = await fetch('/api/admin/auth/verify', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
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
              sessionToken: token,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              createdAt: new Date()
            });
          }
        } else {
          localStorage.removeItem('admin_token');
          localForceLogout();
        }
      } catch (error) {
        console.error('Session verification failed:', error);
        localStorage.removeItem('admin_token');
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
      
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });
      
      const data = await response.json();
      
      if (data.success) {
        const sessionToken: string = data.data.session.sessionToken;
        setUser(data.data.user);
        setSession(data.data.session);
        localStorage.setItem('admin_token', sessionToken);

        // The login response carries no `isAdmin` — see `fetchIsAdmin`. Without this the sidebar
        // would be missing the platform door until the next full page load re-ran the mount verify.
        // It is merged rather than replacing the user wholesale because the login payload carries
        // store fields (description, theme) that verify does not return.
        const isAdmin = await fetchIsAdmin(sessionToken);
        setUser((current) => (current ? { ...current, isAdmin } : current));

        return true;
      } else {
        throw new Error(data.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };
  
  const logout = async () => {
    try {
      // Called unconditionally, and with the cookie attached: the session that has to be ended
      // lives in an httpOnly cookie, not in `admin_token`, so gating this on localStorage left the
      // real session alive whenever the token was already gone.
      const token = localStorage.getItem('admin_token');
      await fetch('/api/admin/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setUser(null);
      setSession(null);
      localStorage.removeItem('admin_token');
      router.push('/login');
    }
  };

  const forceLogout = () => {
    setUser(null);
    setSession(null);
    localStorage.removeItem('admin_token');
    router.push('/login');
  };
  
  const verify = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return false;
      
      const response = await fetch('/api/admin/auth/verify', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
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