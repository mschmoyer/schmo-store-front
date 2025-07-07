'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AdminUser, AdminSession, AdminContext as AdminContextType, AdminLoginRequest } from '@/lib/types/admin';
import { useRouter } from 'next/navigation';

const AdminContext = createContext<AdminContextType | null>(null);

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
          const data = await response.json();
          if (data.success) {
            setUser(data.data.user);
            setSession({
              id: data.data.user.id,
              storeId: data.data.user.storeId,
              sessionToken: token,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              createdAt: new Date()
            });
          }
        } else {
          localStorage.removeItem('admin_token');
          forceLogout();
        }
      } catch (error) {
        console.error('Session verification failed:', error);
        localStorage.removeItem('admin_token');
        forceLogout();
      } finally {
        setIsLoading(false);
      }
    };
    
    verifySession();
  }, []);
  
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
        setUser(data.data.user);
        setSession(data.data.session);
        localStorage.setItem('admin_token', data.data.session.sessionToken);
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
      const token = localStorage.getItem('admin_token');
      if (token) {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setUser(null);
      setSession(null);
      localStorage.removeItem('admin_token');
      router.push('/admin/login');
    }
  };

  const forceLogout = () => {
    setUser(null);
    setSession(null);
    localStorage.removeItem('admin_token');
    router.push('/admin/login');
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