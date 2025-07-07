'use client';

import { Container, Group, Button } from '@mantine/core';
import Link from 'next/link';
import { RebelCartLogo } from '@/components/ui/RebelCartLogo';
import { rebelTheme } from '@/lib/theme/rebel-theme';

export function Header() {
  return (
    <header className={`${rebelTheme.classes.card.background} border-b ${rebelTheme.classes.card.border} sticky top-0 z-50`}>
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
              className={`${rebelTheme.classes.link.primary} hover:!bg-orange-50`}
            >
              Demo Stores
            </Button>
            
            <Button
              component={Link}
              href="/login"
              variant="outline"
              className={rebelTheme.classes.button.outline.primary}
            >
              Login
            </Button>
            
            <Button
              component={Link}
              href="/create-store"
              className={rebelTheme.classes.button.primary}
            >
              Create Your Storefront
            </Button>
          </Group>
        </Group>
      </Container>
    </header>
  );
}