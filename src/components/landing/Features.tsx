'use client';

import { Container, Title, Text, SimpleGrid, Stack } from '@mantine/core';
import { 
  IconBolt, 
  IconTruck, 
  IconPalette, 
  IconSettings, 
  IconSeo,
  IconDeviceMobile
} from '@tabler/icons-react';
import { FeatureCard } from '../ui/FeatureCard';

const features = [
  {
    icon: <IconBolt size={24} />,
    title: "Lightning Fast Setup",
    description: "Rebellion starts in 3 simple steps. No technical knowledge required - connect any shipping platform and launch your store in minutes.",
    color: "red"
  },
  {
    icon: <IconTruck size={24} />,
    title: "Any Shipping Platform",
    description: "Connect ShipStation or any shipping service. Your choice, your control - no vendor lock-in, no excessive fees.",
    color: "gray"
  },
  {
    icon: <IconPalette size={24} />,
    title: "Rebel-Ready Design",
    description: "Professional themes designed to convert. Stand out from cookie-cutter stores with designs that capture your rebellious spirit.",
    color: "red"
  },
  {
    icon: <IconSettings size={24} />,
    title: "Keep Your Margins",
    description: "Low-cost platform means more money in your pocket. Full control over pricing, fees, and profits - the way it should be.",
    color: "green"
  },
  {
    icon: <IconSeo size={24} />,
    title: "Rebel Against Big Tech",
    description: "Built for independence with clean URLs, fast loading, and SEO optimization. Don't pay premium prices for basic features.",
    color: "orange"
  },
  {
    icon: <IconDeviceMobile size={24} />,
    title: "Ship Efficiently",
    description: "Mobile-optimized for modern commerce. Your customers can shop anywhere while you manage everything from one affordable dashboard.",
    color: "red"
  }
];

export function Features() {
  return (
    <section className="py-20 bg-white dark:bg-gray-900" data-section="features">
      <Container size="lg">
        <Stack gap="xl">
          <div className="text-center max-w-3xl mx-auto">
            <Title
              order={2}
              size="h2"
              className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4"
            >
              Rebel against expensive software
            </Title>
            <Text
              size="lg"
              className="text-gray-600 dark:text-gray-300 leading-relaxed"
            >
              RebelCart combines powerful ecommerce tools with any shipping platform you choose. 
              Keep your margins high and your costs low - the rebellion starts here.
            </Text>
          </div>

          <SimpleGrid
            cols={{ base: 1, sm: 2, lg: 3 }}
            spacing="xl"
            className="mt-12"
          >
            {features.map((feature, index) => (
              <FeatureCard
                key={index}
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                color={feature.color}
              />
            ))}
          </SimpleGrid>
        </Stack>
      </Container>
    </section>
  );
}