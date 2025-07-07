'use client';

import React, { useEffect } from 'react';
import { Box } from '@mantine/core';
import { LoginForm } from '@/components/admin/LoginForm';
import { useAdmin } from '@/contexts/AdminContext';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const { isAuthenticated, isLoading } = useAdmin();
  const router = useRouter();
  
  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/admin');
    }
  }, [isAuthenticated, isLoading, router]);
  
  // Don't show login form if already authenticated
  if (isAuthenticated) {
    return null;
  }
  
  return (
    <Box
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <LoginForm />
    </Box>
  );
}