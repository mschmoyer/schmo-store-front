'use client';

import React from 'react';
import { NavLink, Box, Stack, Text, rem } from '@mantine/core';
import { 
  IconDashboard, 
  IconSettings, 
  IconShoppingCart, 
  IconPalette, 
  IconArticle, 
  IconChartLine, 
  IconUser,
  IconPlug,
  IconCategory,
  IconExternalLink,
  IconLogout,
  IconBrain,
  IconShip
} from '@tabler/icons-react';
import { usePathname } from 'next/navigation';
import { useAdmin } from '@/contexts/AdminContext';

interface AdminNavProps {
  onNavClick?: () => void;
}

export function AdminNav({ onNavClick }: AdminNavProps) {
  const pathname = usePathname();
  const { user, logout } = useAdmin();
  
  const handleViewStore = () => {
    if (user?.store?.slug) {
      window.open(`/store/${user.store.slug}`, '_blank');
    }
  };

  const handleLogout = async () => {
    await logout();
    if (onNavClick) {
      onNavClick();
    }
  };
  
  const navItems = [
    {
      label: 'Dashboard',
      icon: IconDashboard,
      href: '/admin',
      color: 'blue',
      enabled: true
    },
    {
      label: 'Account',
      icon: IconUser,
      href: '/admin/account',
      color: 'green',
      enabled: false // Page not implemented yet
    },
    {
      label: 'Products',
      icon: IconShoppingCart,
      href: '/admin/products',
      color: 'orange',
      enabled: true
    },
    {
      label: 'Categories',
      icon: IconCategory,
      href: '/admin/categories',
      color: 'purple',
      enabled: false // Page not implemented yet
    },
    {
      label: 'AI Assistant',
      icon: IconBrain,
      href: '/admin/ai',
      color: 'violet',
      enabled: true
    },
    {
      label: 'Integrations',
      icon: IconPlug,
      href: '/admin/integrations',
      color: 'teal',
      enabled: true
    },
    {
      label: 'ShipStation',
      icon: IconShip,
      href: '/admin/integrations/shipstation',
      color: 'blue',
      enabled: true
    },
    {
      label: 'Page Design',
      icon: IconPalette,
      href: '/admin/design',
      color: 'pink',
      enabled: true
    },
    {
      label: 'Blog',
      icon: IconArticle,
      href: '/admin/blog',
      color: 'indigo',
      enabled: true
    },
    {
      label: 'Analytics',
      icon: IconChartLine,
      href: '/admin/analytics',
      color: 'cyan',
      enabled: false // Page not implemented yet
    },
    {
      label: 'Settings',
      icon: IconSettings,
      href: '/admin/settings',
      color: 'gray',
      enabled: false // Page not implemented yet
    }
  ];
  
  const isActive = (href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname?.startsWith(href);
  };
  
  return (
    <Box p="md">
      <Stack gap="xs">
        <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb="sm">
          Admin Dashboard
        </Text>
        
        {user?.store?.slug && (
          <NavLink
            label="View Store"
            leftSection={
              <IconExternalLink 
                style={{ width: rem(20), height: rem(20) }} 
                stroke={1.5} 
              />
            }
            onClick={handleViewStore}
            color="violet"
            styles={{
              root: {
                borderRadius: rem(8),
                cursor: 'pointer',
                marginBottom: rem(8),
                border: '1px solid var(--mantine-color-violet-2)',
                backgroundColor: 'var(--mantine-color-violet-0)',
                '&:hover': {
                  backgroundColor: 'var(--mantine-color-violet-1)',
                }
              },
              label: {
                fontWeight: 600,
                color: 'var(--mantine-color-violet-7)',
              }
            }}
          />
        )}
        
        {navItems.filter(item => item.enabled).map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            label={item.label}
            leftSection={
              <item.icon 
                style={{ width: rem(20), height: rem(20) }} 
                stroke={1.5} 
              />
            }
            active={isActive(item.href)}
            color={item.color}
            onClick={onNavClick}
            styles={{
              root: {
                borderRadius: rem(8),
                '&:hover': {
                  backgroundColor: 'var(--mantine-color-gray-0)',
                }
              },
              label: {
                fontWeight: 500,
              }
            }}
          />
        ))}
        
        {/* Logout Button */}
        <NavLink
          label="Logout"
          leftSection={
            <IconLogout 
              style={{ width: rem(20), height: rem(20) }} 
              stroke={1.5} 
            />
          }
          onClick={handleLogout}
          color="red"
          styles={{
            root: {
              borderRadius: rem(8),
              marginTop: rem(16),
              border: '1px solid var(--mantine-color-red-2)',
              backgroundColor: 'var(--mantine-color-red-0)',
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: 'var(--mantine-color-red-1)',
              }
            },
            label: {
              fontWeight: 600,
              color: 'var(--mantine-color-red-7)',
            }
          }}
        />
      </Stack>
    </Box>
  );
}