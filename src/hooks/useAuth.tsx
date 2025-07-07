'use client';

import { useState, useEffect, useContext, createContext } from 'react';
import { useRouter } from 'next/navigation';
import { 
  User, 
  AuthSession, 
  AuthContextType, 
  LoginCredentials, 
  RegisterCredentials, 
  AuthResponse 
} from '@/types/auth';

// Auth Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Provider Component
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Check if user is authenticated
  const isAuthenticated = !!user && !!session;

  // Load user session on mount
  useEffect(() => {
    loadSession();
  }, []);

  // Load session from API
  const loadSession = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setUser(data.user);
          setSession(data.session);
        }
      }
    } catch (error) {
      console.error('Failed to load session:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Sign in user
  const signIn = async (credentials: LoginCredentials): Promise<AuthResponse> => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success && data.user) {
        setUser(data.user);
        setSession({
          user: data.user,
          token: data.token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
        return data;
      }

      return data;
    } catch (error) {
      console.error('Sign in error:', error);
      return {
        success: false,
        error: 'An error occurred during sign in',
      };
    } finally {
      setIsLoading(false);
    }
  };

  // Sign up user
  const signUp = async (credentials: RegisterCredentials): Promise<AuthResponse> => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success && data.user) {
        setUser(data.user);
        setSession({
          user: data.user,
          token: data.token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
        return data;
      }

      return data;
    } catch (error) {
      console.error('Sign up error:', error);
      return {
        success: false,
        error: 'An error occurred during sign up',
      };
    } finally {
      setIsLoading(false);
    }
  };

  // Sign out user
  const signOut = async (): Promise<void> => {
    try {
      setIsLoading(true);
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      setUser(null);
      setSession(null);
      setIsLoading(false);
      router.push('/store-home');
    }
  };

  // Refresh session
  const refreshSession = async (): Promise<void> => {
    await loadSession();
  };

  const value: AuthContextType = {
    user,
    session,
    isLoading,
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    refreshSession,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Use Auth Hook
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Protected Route Hook
export function useProtectedRoute(redirectTo: string = '/store-home') {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo]);

  return { isAuthenticated, isLoading };
}

// Require Auth Hook
export function useRequireAuth(redirectTo: string = '/auth/signin') {
  const { isAuthenticated, isLoading, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo]);

  return { isAuthenticated, isLoading, user };
}

// Guest Only Hook (redirect if authenticated)
export function useGuestOnly(redirectTo: string = '/admin') {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push(redirectTo);
    }
  }, [isAuthenticated, isLoading, router, redirectTo]);

  return { isAuthenticated, isLoading };
}

// Auth State Hook
export function useAuthState() {
  const { user, session, isLoading, isAuthenticated } = useAuth();

  return {
    user,
    session,
    isLoading,
    isAuthenticated,
    userId: user?.id,
    userEmail: user?.email,
    isEmailVerified: user?.emailVerified,
  };
}

// Login Hook
export function useLogin() {
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (credentials: LoginCredentials): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn(credentials);
      if (result.success) {
        return true;
      } else {
        setError(result.error || 'Login failed');
        return false;
      }
    } catch {
      setError('An unexpected error occurred');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return { login, isLoading, error, clearError: () => setError(null) };
}

// Register Hook
export function useRegister() {
  const { signUp } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = async (credentials: RegisterCredentials): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await signUp(credentials);
      if (result.success) {
        return true;
      } else {
        setError(result.error || 'Registration failed');
        return false;
      }
    } catch {
      setError('An unexpected error occurred');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return { register, isLoading, error, clearError: () => setError(null) };
}

// Logout Hook
export function useLogout() {
  const { signOut } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      await signOut();
    } finally {
      setIsLoading(false);
    }
  };

  return { logout, isLoading };
}

// Session Hook
export function useSession() {
  const { session, refreshSession } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      await refreshSession();
    } finally {
      setIsRefreshing(false);
    }
  };

  return {
    session,
    refresh,
    isRefreshing,
    isExpired: session ? session.expiresAt <= new Date() : false,
    expiresAt: session?.expiresAt,
    timeUntilExpiry: session
      ? Math.max(0, session.expiresAt.getTime() - Date.now())
      : 0,
  };
}

// Auth Status Hook
export function useAuthStatus() {
  const { isAuthenticated, isLoading, user } = useAuth();

  return {
    isAuthenticated,
    isLoading,
    isGuest: !isAuthenticated && !isLoading,
    user,
    hasUser: !!user,
  };
}

export default useAuth;