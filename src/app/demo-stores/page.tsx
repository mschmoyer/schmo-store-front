import { Container, Title, Text, Stack } from '@mantine/core';
import { DemoStores } from '@/components/landing/DemoStores';
import { generateLandingPageMeta } from '@/components/seo/LandingPageMeta';

export const metadata = generateLandingPageMeta({
  title: "Demo Stores - Schmo Store Examples",
  description: "Explore our collection of demo stores to see how different businesses use Schmo Store to showcase their products and drive sales.",
  canonicalUrl: "https://schmostore.com/demo-stores"
});

export default function DemoStoresPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Container size="lg" className="py-20">
        <Stack gap="xl">
          <div className="text-center">
            <Title
              order={1}
              size="h1"
              className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-4"
            >
              Demo Stores
            </Title>
            <Text
              size="lg"
              className="text-gray-600 dark:text-gray-300 max-w-3xl mx-auto leading-relaxed"
            >
              Explore our collection of demo stores to see how different businesses use Schmo Store 
              to showcase their products and drive sales. Each store demonstrates different themes, 
              layouts, and product categories.
            </Text>
          </div>

          <DemoStores showFeaturedOnly={false} maxDisplayCount={12} />
        </Stack>
      </Container>
    </div>
  );
}