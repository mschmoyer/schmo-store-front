'use client';

import { Container, Title, Text, Stack, Group, ThemeIcon, Timeline } from '@mantine/core';
import { IconPlug, IconPalette, IconRocket, IconCheck } from '@tabler/icons-react';
import { rebelTheme } from '@/lib/theme/rebel-theme';

const steps = [
  {
    icon: <IconPlug size={20} />,
    title: "Connect ShipStation",
    description: "Link your ShipStation account to automatically sync your products and inventory. No manual data entry required.",
    color: "blue"
  },
  {
    icon: <IconPalette size={20} />,
    title: "Customize Your Store",
    description: "Choose from our professional themes and customize your store's appearance to match your brand in minutes.",
    color: "orange"
  },
  {
    icon: <IconRocket size={20} />,
    title: "Launch & Sell",
    description: "Your store is ready to go live! Share your custom URL and start selling with integrated payment processing.",
    color: "green"
  }
];

export function HowItWorks() {
  return (
    <section className={`py-20 ${rebelTheme.sections.howItWorks}`} data-section="how-it-works">
      <Container size="lg">
        <Stack gap="xl">
          <div className="text-center max-w-3xl mx-auto">
            <Title
              order={2}
              size="h2"
              className={`text-3xl sm:text-4xl font-bold ${rebelTheme.classes.text.heading} mb-4`}
            >
              How It Works
            </Title>
            <Text
              size="lg"
              className={`${rebelTheme.classes.text.body} leading-relaxed`}
            >
              Get your professional online store up and running in just three simple steps. 
              No technical expertise needed.
            </Text>
          </div>

          <div className="mt-12 max-w-4xl mx-auto">
            {/* Desktop Timeline */}
            <div className="hidden md:block">
              <Timeline active={3} bulletSize={60} lineWidth={2} color="orange">
                {steps.map((step, index) => (
                  <Timeline.Item
                    key={index}
                    bullet={
                      <ThemeIcon 
                        size="xl" 
                        radius="xl" 
                        color={step.color}
                        className="shadow-lg"
                      >
                        {step.icon}
                      </ThemeIcon>
                    }
                    title={
                      <Text size="xl" fw={600} className={rebelTheme.classes.text.heading}>
                        {step.title}
                      </Text>
                    }
                    className="mb-8"
                  >
                    <Text size="md" className={`${rebelTheme.classes.text.body} mt-2 max-w-lg`}>
                      {step.description}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-6">
              {steps.map((step, index) => (
                <div key={index} className={`${rebelTheme.classes.card.background} rounded-lg p-6 ${rebelTheme.classes.card.shadow} ${rebelTheme.classes.card.border} border`}>
                  <Group gap="md" align="flex-start">
                    <ThemeIcon 
                      size="xl" 
                      radius="xl" 
                      color={step.color}
                      className="shadow-lg flex-shrink-0"
                    >
                      {step.icon}
                    </ThemeIcon>
                    <div className="flex-1">
                      <Title order={3} size="h4" className={`${rebelTheme.classes.text.heading} mb-2`}>
                        {step.title}
                      </Title>
                      <Text size="sm" className={rebelTheme.classes.text.body}>
                        {step.description}
                      </Text>
                    </div>
                  </Group>
                </div>
              ))}
            </div>
          </div>

          <div className="text-center mt-8">
            <Group justify="center" gap="xs">
              <ThemeIcon size="sm" radius="xl" color="green">
                <IconCheck size={12} />
              </ThemeIcon>
              <Text size="sm" className={rebelTheme.classes.text.muted}>
                Average setup time: 5 minutes
              </Text>
            </Group>
          </div>
        </Stack>
      </Container>
    </section>
  );
}