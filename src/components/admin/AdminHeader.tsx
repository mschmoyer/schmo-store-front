'use client';

import React from 'react';
import { 
  Group, 
  Text, 
  Burger,
  Breadcrumbs,
  Anchor,
  Select
} from '@mantine/core';
import { AdminBreadcrumb } from '@/lib/types/admin';
import { RebelShopLogo } from '@/components/ui/RebelShopLogo';

interface AdminHeaderProps {
  user: {
    email: string;
    store: {
      name: string;
      slug: string;
    };
  };
  breadcrumbs?: AdminBreadcrumb[];
  onMenuToggle?: () => void;
  menuOpened?: boolean;
  onLogout?: () => Promise<void>;
}

export function AdminHeader({ 
  user, 
  breadcrumbs = [], 
  onMenuToggle, 
  menuOpened = false,
  onLogout // eslint-disable-line @typescript-eslint/no-unused-vars
}: AdminHeaderProps) {
  
  return (
    <Group 
      justify="space-between" 
      p="md" 
      style={{ 
        background: 'linear-gradient(135deg, #4a4a4a 0%, #3a3a3a 50%, #2a2a2a 100%)', // soft grayscale gradient
        borderBottom: '1px solid #2a2a2a',
        color: 'var(--mantine-color-gray-1)',
        height: '100%',
        position: 'relative',
        zIndex: 1000
      }}
    >
      <Group>
        <Burger
          opened={menuOpened}
          onClick={onMenuToggle}
          hiddenFrom="sm"
          size="sm"
          color="var(--mantine-color-gray-1)"
        />
        
        <div className="flex items-center gap-8">
          <RebelShopLogo 
            size={32} 
            showText={true} 
            color="white"
            className="hidden sm:flex"
          />
          <div>
            <div className="flex items-center gap-2">
              <Text size="sm" c="gray.3" fw={500}>
                Store:
              </Text>
              <Select
                value={user.store.name}
                data={[{ value: user.store.name, label: user.store.name }]}
                allowDeselect={false}
                size="sm"
                variant="filled"
                styles={{
                  input: {
                    backgroundColor: '#3a3a3a',
                    border: 'none',
                    color: 'var(--mantine-color-gray-1)',
                    fontWeight: 600,
                    fontSize: '16px'
                  }
                }}
              />
            </div>
            {breadcrumbs.length > 0 && (
              <Breadcrumbs 
                mt={4} 
                separator="/" 
                separatorMargin="xs"
                styles={{
                  separator: {
                    color: 'var(--mantine-color-gray-4)',
                    opacity: 0.8
                  }
                }}
              >
                {breadcrumbs.map((breadcrumb, index) => (
                  <Anchor
                    key={index}
                    href={breadcrumb.href}
                    size="sm"
                    c={breadcrumb.href ? 'gray.3' : 'gray.5'}
                    style={{ 
                      textDecoration: 'none',
                      pointerEvents: breadcrumb.href ? 'auto' : 'none'
                    }}
                  >
                    {breadcrumb.label}
                  </Anchor>
                ))}
              </Breadcrumbs>
            )}
          </div>
        </div>
      </Group>
      
      <Group>
        {/* Icons disabled for now - will build later
        <ActionIcon
          variant="subtle"
          onClick={handleViewStore}
          title="View Store"
          size="lg"
          c="white"
          style={{ backgroundColor: '#3a3a3a' }}
        >
          <IconExternalLink style={{ width: rem(18), height: rem(18) }} />
        </ActionIcon>
        
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <ActionIcon 
              variant="subtle" 
              size="lg"
              c="white"
              style={{ backgroundColor: '#3a3a3a' }}
            >
              <Avatar size="sm" radius="xl" color="red.8" style={{ backgroundColor: '#ffffff', color: '#991b1b' }}>
                {user.email.charAt(0).toUpperCase()}
              </Avatar>
            </ActionIcon>
          </Menu.Target>
          
          <Menu.Dropdown>
            <Menu.Label>
              <Text size="xs" c="dimmed" truncate>
                {user.email}
              </Text>
            </Menu.Label>
            
            <Menu.Item
              leftSection={<IconUser style={{ width: rem(14), height: rem(14) }} />}
              onClick={() => router.push('/admin/account')}
            >
              Account Settings
            </Menu.Item>
            
            <Menu.Item
              leftSection={<IconSettings style={{ width: rem(14), height: rem(14) }} />}
              onClick={() => router.push('/admin/settings')}
            >
              Store Settings
            </Menu.Item>
            
            <Menu.Divider />
            
            <Menu.Item
              leftSection={<IconLogout style={{ width: rem(14), height: rem(14) }} />}
              onClick={handleLogout}
              color="red"
            >
              Logout
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        */}
      </Group>
    </Group>
  );
}