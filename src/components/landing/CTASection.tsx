'use client';

import { Container, Title, Text, Button, Group, Stack } from '@mantine/core';
import { IconRocket, IconArrowRight } from '@tabler/icons-react';
import Link from 'next/link';
import { rebelTheme } from '@/lib/theme/rebel-theme';

interface CTASectionProps {
  title?: string;
  subtitle?: string;
  primaryCTA?: {
    text: string;
    href: string;
    icon?: React.ReactNode;
  };
  secondaryCTA?: {
    text: string;
    href: string;
    icon?: React.ReactNode;
  };
  showStats?: boolean;
  variant?: 'default' | 'gradient' | 'minimal';
}

export function CTASection({
  title = "Ready to rebel against high fees?",
  subtitle = "Join the rebellion and take back your margins. Create your low-cost storefront and keep more of what you earn.",
  primaryCTA = {
    text: "Create Your Storefront",
    href: "/create-store",
    icon: <IconRocket size={20} />
  },
  secondaryCTA = {
    text: "View Demo Stores",
    href: "/demo-stores",
    icon: <IconArrowRight size={20} />
  },
  showStats = true,
  variant = 'gradient'
}: CTASectionProps) {
  const bgClass = variant === 'gradient' 
    ? rebelTheme.sections.cta
    : variant === 'minimal' 
      ? rebelTheme.classes.card.background
      : 'bg-gray-50';

  const textClass = variant === 'gradient' 
    ? rebelTheme.classes.text.white
    : rebelTheme.classes.text.heading;

  const subtitleClass = variant === 'gradient' 
    ? 'text-orange-100'
    : rebelTheme.classes.text.body;

  return (
    <section className={`py-20 ${bgClass}`} data-section="cta">
      <Container size="lg">
        <Stack gap="xl">
          <div className="text-center max-w-3xl mx-auto">
            <Title
              order={2}
              size="h2"
              className={`text-3xl sm:text-4xl font-bold mb-4 ${textClass}`}
            >
              {title}
            </Title>
            <Text
              size="lg"
              className={`leading-relaxed ${subtitleClass}`}
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
              variant={variant === 'gradient' ? 'white' : 'filled'}
              leftSection={primaryCTA.icon}
              className={`px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 ${
                variant === 'gradient' 
                  ? '!text-orange-600 hover:!text-orange-700 !bg-white' 
                  : rebelTheme.classes.button.primary
              }`}
            >
              {primaryCTA.text}
            </Button>
            
            <Button
              component={Link}
              href={secondaryCTA.href}
              size="xl"
              radius="md"
              variant="outline"
              leftSection={secondaryCTA.icon}
              className={`px-8 py-4 text-lg font-semibold transition-all duration-200 ${
                variant === 'gradient' 
                  ? '!border-white !text-white hover:!bg-white hover:!text-orange-600' 
                  : rebelTheme.classes.button.outline.secondary
              }`}
            >
              {secondaryCTA.text}
            </Button>
          </Group>

          {showStats && (
            <div className="mt-12">
              <Group justify="center" gap="xl" className="text-center">
                <div>
                  <Text size="xl" fw={700} className={textClass}>
                    500+
                  </Text>
                  <Text size="sm" className={subtitleClass}>
                    Active Stores
                  </Text>
                </div>
                <div>
                  <Text size="xl" fw={700} className={textClass}>
                    $2M+
                  </Text>
                  <Text size="sm" className={subtitleClass}>
                    Sales Processed
                  </Text>
                </div>
                <div>
                  <Text size="xl" fw={700} className={textClass}>
                    99.9%
                  </Text>
                  <Text size="sm" className={subtitleClass}>
                    Uptime
                  </Text>
                </div>
              </Group>
            </div>
          )}

          <div className="text-center mt-8">
            <Text size="sm" className={subtitleClass}>
              No credit card required • Keep 100% of your margins • Start rebelling today
            </Text>
          </div>
        </Stack>
      </Container>
    </section>
  );
}