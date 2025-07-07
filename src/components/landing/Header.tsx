'use client';

import { Container, Group, Button } from '@mantine/core';
import Link from 'next/link';
import { RebelCartLogo } from '@/components/ui/RebelCartLogo';

export function Header() {
  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <Container size="lg">
        <Group justify="space-between" className="py-4">
          <Link href="/" className="flex items-center">
            <RebelCartLogo size={40} />
          </Link>
          
          <Group gap="md">
            <Button
              component={Link}
              href="/demo-stores"
              variant="subtle"
              className="text-gray-700 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400"
            >
              Demo Stores
            </Button>
            
            <Button
              component={Link}
              href="/login"
              variant="outline"
              color="red"
              className="border-red-600 text-red-600 hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-950"
            >
              Login
            </Button>
            
            <Button
              component={Link}
              href="/create-store"
              color="red"
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Create Your Storefront
            </Button>
          </Group>
        </Group>
      </Container>
    </header>
  );
}