'use client';

import { Container, Title, Text, Button, Group, Stack } from '@mantine/core';
import { IconShoppingCart, IconRocket } from '@tabler/icons-react';
import Link from 'next/link';
import { trackHeroCTAClick } from '@/lib/analytics';
import { rebelTheme } from '@/lib/theme/rebel-theme';

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
  subtitle = "RebelShop: The low-cost ecommerce solution that lets you keep your profits. Connect any shipping platform, create stunning stores, and ship efficiently without expensive software fees.",
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
      className={`relative ${rebelTheme.sections.hero} py-20 sm:py-24 md:py-32`}
      data-section="hero"
    >
      <Container size="lg" className="relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          <Stack gap="xl">
            <div>
              <Title
                order={1}
                size="h1"
                className={`text-4xl sm:text-5xl md:text-6xl font-bold ${rebelTheme.classes.text.heading} leading-tight`}
                mb="md"
              >
                {title}
              </Title>
              <Text
                size="xl"
                className={`${rebelTheme.classes.text.body} max-w-3xl mx-auto leading-relaxed`}
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
                leftSection={<IconRocket size={20} />}
                className={`${rebelTheme.classes.button.primary} px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200`}
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
                leftSection={<IconShoppingCart size={20} />}
                className={`${rebelTheme.classes.button.outline.secondary} px-8 py-4 text-lg font-semibold transition-all duration-200`}
                onClick={() => trackHeroCTAClick(secondaryCTA.text, secondaryCTA.href)}
              >
                {secondaryCTA.text}
              </Button>
            </Group>

            <div className="mt-12 text-center">
              <Text size="sm" className={rebelTheme.classes.text.muted}>
                No credit card required • Keep 100% of your margins • Start rebelling in under 5 minutes
              </Text>
            </div>
          </Stack>
        </div>
      </Container>
      
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-orange-200 rounded-full opacity-20 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-amber-200 rounded-full opacity-20 blur-3xl"></div>
      </div>
    </section>
  );
}