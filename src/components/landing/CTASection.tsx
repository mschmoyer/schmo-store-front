'use client';

import { Container, Title, Text, Button, Group, Stack } from '@mantine/core';
import { IconRocket, IconArrowRight } from '@tabler/icons-react';
import Link from 'next/link';

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
    ? 'bg-gradient-to-r from-red-600 to-gray-800'
    : variant === 'minimal' 
      ? 'bg-white dark:bg-gray-900'
      : 'bg-gray-50 dark:bg-gray-800';

  const textClass = variant === 'gradient' 
    ? 'text-white'
    : 'text-gray-900 dark:text-white';

  const subtitleClass = variant === 'gradient' 
    ? 'text-red-100'
    : 'text-gray-600 dark:text-gray-300';

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
              color={variant === 'gradient' ? undefined : 'red'}
              leftSection={primaryCTA.icon}
              className={`px-8 py-4 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 ${
                variant === 'gradient' 
                  ? 'text-red-600 hover:text-red-700' 
                  : 'bg-red-600 hover:bg-red-700 text-white'
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
              color={variant === 'gradient' ? undefined : 'red'}
              leftSection={secondaryCTA.icon}
              className={`px-8 py-4 text-lg font-semibold transition-all duration-200 ${
                variant === 'gradient' 
                  ? 'border-white text-white hover:bg-white hover:text-red-600' 
                  : 'border-2 border-red-600 hover:border-red-700 text-red-600 hover:text-red-700 dark:text-red-400 dark:border-red-500 dark:hover:border-red-400'
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