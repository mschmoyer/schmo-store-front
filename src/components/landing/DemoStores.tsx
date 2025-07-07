'use client';

import { Container, Title, Text, SimpleGrid, Card, Button, Badge, Stack, Group } from '@mantine/core';
import { IconExternalLink, IconEye } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { rebelTheme } from '@/lib/theme/rebel-theme';

interface DemoStore {
  id: string;
  name: string;
  slug: string;
  description: string;
  screenshotUrl?: string;
  isFeatured: boolean;
  category: string;
  theme: string;
}

interface DemoStoresProps {
  stores?: DemoStore[];
  showFeaturedOnly?: boolean;
  maxDisplayCount?: number;
}

// Fallback stores data in case API fails
const fallbackStores: DemoStore[] = [
  {
    id: '1',
    name: 'Demo Electronics Store',
    slug: 'demo-electronics',
    description: 'Your one-stop shop for quality electronics and gadgets',
    isFeatured: true,
    category: 'Electronics',
    theme: 'Default'
  },
  {
    id: '2',
    name: 'Artisan Craft Corner',
    slug: 'artisan-craft',
    description: 'Handmade crafts and artisan goods',
    isFeatured: true,
    category: 'Handmade',
    theme: 'Default'
  },
  {
    id: '3',
    name: 'Fitness Pro Shop',
    slug: 'fitness-pro',
    description: 'Professional fitness equipment and accessories',
    isFeatured: true,
    category: 'Fitness',
    theme: 'Default'
  }
];

export function DemoStores({ 
  stores, 
  showFeaturedOnly = true,
  maxDisplayCount = 3 
}: DemoStoresProps) {
  const [demoStores, setDemoStores] = useState<DemoStore[]>(stores || fallbackStores);
  const [loading, setLoading] = useState(!stores);

  useEffect(() => {
    if (!stores) {
      // Fetch stores from API
      fetch('/api/stores/public')
        .then(response => response.json())
        .then(data => {
          if (data.stores && Array.isArray(data.stores)) {
            const formattedStores: DemoStore[] = data.stores.map((store: Record<string, unknown>) => ({
              id: store.id as string,
              name: store.store_name as string,
              slug: store.store_slug as string,
              description: store.store_description as string,
              isFeatured: true, // All public stores are featured for demo
              category: 'Demo',
              theme: (store.theme_name as string) || 'Default'
            }));
            setDemoStores(formattedStores);
          }
        })
        .catch(error => {
          console.error('Failed to fetch stores:', error);
          // Keep fallback stores
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [stores]);

  const displayedStores = showFeaturedOnly 
    ? demoStores.filter(store => store.isFeatured).slice(0, maxDisplayCount)
    : demoStores.slice(0, maxDisplayCount);

  if (loading) {
    return (
      <section className={`py-20 ${rebelTheme.sections.demoStores}`} data-section="demo-stores">
        <Container size="lg">
          <div className="text-center">
            <Text c="dimmed">Loading demo stores...</Text>
          </div>
        </Container>
      </section>
    );
  }

  if (displayedStores.length === 0) {
    return null;
  }

  return (
    <section className={`py-20 ${rebelTheme.sections.demoStores}`} data-section="demo-stores">
      <Container size="lg">
        <Stack gap="xl">
          <div className="text-center max-w-3xl mx-auto">
            <Title
              order={2}
              size="h2"
              className={`text-3xl sm:text-4xl font-bold ${rebelTheme.classes.text.heading} mb-4`}
            >
              See It In Action
            </Title>
            <Text
              size="lg"
              className={`${rebelTheme.classes.text.body} leading-relaxed`}
            >
              Explore our demo stores to see how different businesses use Schmo Store to showcase 
              their products and drive sales.
            </Text>
          </div>

          <SimpleGrid
            cols={{ base: 1, sm: 2, lg: 3 }}
            spacing="xl"
            className="mt-12"
          >
            {displayedStores.map((store) => (
              <Card 
                key={store.id}
                shadow="sm" 
                padding="lg" 
                radius="md" 
                withBorder 
                className={`h-full transition-all duration-200 ${rebelTheme.classes.card.background} ${rebelTheme.classes.card.shadow}`}
              >
                <Card.Section>
                  <div className="relative h-48 bg-gray-100">
                    {/* Placeholder for store screenshot */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <IconEye size={48} className={`${rebelTheme.classes.text.light} mx-auto mb-2`} />
                        <Text size="sm" className={rebelTheme.classes.text.muted}>
                          Store Preview
                        </Text>
                      </div>
                    </div>
                    {store.isFeatured && (
                      <Badge 
                        color="orange" 
                        variant="filled"
                        className="absolute top-2 right-2 z-10"
                      >
                        Featured
                      </Badge>
                    )}
                  </div>
                </Card.Section>

                <Stack gap="md" className="mt-4">
                  <div>
                    <Group justify="space-between" align="flex-start">
                      <Title order={3} size="h4" className={rebelTheme.classes.text.heading}>
                        {store.name}
                      </Title>
                      <Badge variant="light" size="sm">
                        {store.category}
                      </Badge>
                    </Group>
                    <Text size="sm" className={`${rebelTheme.classes.text.body} mt-2`}>
                      {store.description}
                    </Text>
                  </div>

                  <Group justify="space-between" align="center">
                    <Text size="xs" className={rebelTheme.classes.text.muted}>
                      Theme: {store.theme}
                    </Text>
                    <Button
                      component={Link}
                      href={`/${store.slug}`}
                      variant="outline"
                      size="sm"
                      leftSection={<IconExternalLink size={16} />}
                      className={`flex-shrink-0 ${rebelTheme.classes.button.outline.tertiary}`}
                    >
                      View Demo
                    </Button>
                  </Group>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>

          <div className="text-center mt-8">
            <Button
              component={Link}
              href="/demo-stores"
              variant="outline"
              size="lg"
              className={`border-2 ${rebelTheme.classes.button.outline.primaryDark}`}
            >
              View All Demo Stores
            </Button>
          </div>
        </Stack>
      </Container>
    </section>
  );
}