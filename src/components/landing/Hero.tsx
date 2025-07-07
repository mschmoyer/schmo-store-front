'use client';

import { Container, Title, Text, Button, Group, Stack } from '@mantine/core';
import { IconShoppingCart, IconRocket } from '@tabler/icons-react';
import Link from 'next/link';
import { trackHeroCTAClick } from '@/lib/analytics';

interface HeroProps {
  title?: string;
  subtitle?: string;
  primaryCTA?: {
    text: string;
    href: string;
    variant: 'primary' | 'secondary';
  };
  secondaryCTA?: {
    text: string;
    href: string;
  };
  backgroundImage?: string;
}

export function Hero({
  title = "Build your shop, power it with your favorite shipping app, and take back your margins",
  subtitle = "RebelCart: The low-cost ecommerce solution that lets you keep your profits. Connect any shipping platform, create stunning stores, and ship efficiently without expensive software fees.",
  primaryCTA = {
    text: "Create Your Storefront",
    href: "/create-store",
    variant: "primary" as const
  },
  secondaryCTA = {
    text: "Login",
    href: "/login"
  }
}: HeroProps) {
  return (
    <section 
      className="relative bg-gradient-to-br from-red-50 to-gray-100 dark:from-gray-900 dark:to-red-900 py-20 sm:py-24 md:py-32"
      data-section="hero"
    >
      <Container size="lg" className="relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          <Stack gap="xl">
            <div>
              <Title
                order={1}
                size="h1"
                className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 dark:text-white leading-tight"
                mb="md"
              >
                {title}
              </Title>
              <Text
                size="xl"
                className="text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed"
              >
                {subtitle}
              </Text>
            </div>

            <Group justify="center" gap="md" className="mt-8">
              <Button
                component={Link}
                href={primaryCTA.href}
                size="xl"
                radius="md"
                variant={primaryCTA.variant === 'primary' ? 'filled' : 'outline'}
                color="red"
                leftSection={<IconRocket size={20} />}
                className="bg-red-600 hover:bg-red-700 text-white px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
                onClick={() => trackHeroCTAClick(primaryCTA.text, primaryCTA.href)}
              >
                {primaryCTA.text}
              </Button>
              
              <Button
                component={Link}
                href={secondaryCTA.href}
                size="xl"
                radius="md"
                variant="outline"
                color="red"
                leftSection={<IconShoppingCart size={20} />}
                className="border-2 border-red-600 hover:border-red-700 text-red-600 hover:text-red-700 dark:text-red-400 dark:border-red-500 dark:hover:border-red-400 px-8 py-4 text-lg font-semibold transition-all duration-200"
                onClick={() => trackHeroCTAClick(secondaryCTA.text, secondaryCTA.href)}
              >
                {secondaryCTA.text}
              </Button>
            </Group>

            <div className="mt-12 text-center">
              <Text size="sm" className="text-gray-500 dark:text-gray-400">
                No credit card required • Keep 100% of your margins • Start rebelling in under 5 minutes
              </Text>
            </div>
          </Stack>
        </div>
      </Container>
      
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-red-200 dark:bg-red-800 rounded-full opacity-20 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gray-300 dark:bg-gray-700 rounded-full opacity-20 blur-3xl"></div>
      </div>
    </section>
  );
}