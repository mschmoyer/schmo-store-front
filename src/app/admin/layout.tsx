'use client';

import React, { useEffect } from 'react';
import { AppShell, Loader, Center, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { AdminProvider, useAdmin } from '@/contexts/AdminContext';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { useRouter, usePathname } from 'next/navigation';

interface AdminLayoutContentProps {
  children: React.ReactNode;
}

function AdminLayoutContent({ children }: AdminLayoutContentProps) {
  const [opened, { toggle }] = useDisclosure();
  const { user, isAuthenticated, isLoading, logout } = useAdmin();
  const router = useRouter();
  const pathname = usePathname();
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/admin/login') {
      router.push('/admin/login');
    }
  }, [isAuthenticated, isLoading, pathname, router]);
  
  // Show loading while checking authentication
  if (isLoading) {
    return (
      <Center h="100vh">
        <div style={{ textAlign: 'center' }}>
          <Loader size="lg" />
          <Text mt="md" c="dimmed">
            Loading admin dashboard...
          </Text>
        </div>
      </Center>
    );
  }
  
  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <>{children}</>;
  }
  
  // Generate breadcrumbs based on current path
  const generateBreadcrumbs = () => {
    const segments = pathname.split('/').filter(Boolean);
    const breadcrumbs = [];
    
    // Always include Dashboard as first breadcrumb
    breadcrumbs.push({ label: 'Dashboard', href: '/admin' });
    
    // Add additional breadcrumbs based on path
    if (segments.length > 1) {
      let currentPath = '';
      for (let i = 1; i < segments.length; i++) {
        currentPath += `/${segments[i]}`;
        const segment = segments[i];
        
        // Capitalize and format segment name
        const label = segment
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        breadcrumbs.push({
          label,
          href: i === segments.length - 1 ? undefined : `/admin${currentPath}`
        });
      }
    }
    
    return breadcrumbs;
  };
  
  return (
    <AppShell
      header={{ height: { base: 70, md: 80 } }}
      navbar={{
        width: { base: 200, md: 250, lg: 300 },
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <AdminHeader
          user={user!}
          breadcrumbs={generateBreadcrumbs()}
          onMenuToggle={toggle}
          menuOpened={opened}
          onLogout={logout}
        />
      </AppShell.Header>
      
      <AppShell.Navbar>
        <AdminNav onNavClick={() => opened && toggle()} />
      </AppShell.Navbar>
      
      <AppShell.Main>
        {children}
      </AppShell.Main>
    </AppShell>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminProvider>
  );
}