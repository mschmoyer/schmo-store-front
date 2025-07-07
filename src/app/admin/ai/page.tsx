'use client';

import React, { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Grid,
  Card,
  Button,
  Group,
  Badge,
  Stack,
  Alert,
  Textarea,
  Modal,
  GridCol,
  CardSection,
  Divider,
  Paper,
  ThemeIcon
} from '@mantine/core';
import {
  IconBrain,
  IconWand,
  IconPencil,
  IconBulb,
  IconTarget,
  IconRocket,
  IconChartLine,
  IconMail,
  IconInfoCircle,
  IconCheck,
  IconSparkles,
  IconX,
  IconColorSwatch
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { useAdmin } from '@/contexts/AdminContext';
import { type GeneratedStoreDetails } from '@/lib/prompts/store-details';

interface AIFeature {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  color: string;
  category: 'content' | 'automation' | 'optimization';
  status: 'available' | 'coming-soon' | 'beta';
  benefits: string[];
}

const aiFeatures: AIFeature[] = [
  {
    id: 'store-details-generator',
    title: 'Store Details Generator',
    description: 'Automatically generate compelling store titles, hero descriptions, and meta content based on your product catalog.',
    icon: IconWand,
    color: 'blue',
    category: 'content',
    status: 'available',
    benefits: [
      'SEO-optimized titles and descriptions',
      'Consistent brand messaging',
      'Saves hours of copywriting time',
      'Based on your actual products'
    ]
  },
  {
    id: 'blog-post-generator',
    title: 'Blog Post Generator',
    description: 'Create engaging, product-focused blog posts that drive traffic and showcase your inventory.',
    icon: IconPencil,
    color: 'green',
    category: 'content',
    status: 'available',
    benefits: [
      'Product-specific content',
      'SEO keyword optimization',
      'Engaging storytelling',
      'Automatic publishing workflow'
    ]
  },
  {
    id: 'product-descriptions',
    title: 'AI Product Descriptions',
    description: 'Generate compelling, unique product descriptions that convert browsers into buyers.',
    icon: IconBulb,
    color: 'orange',
    category: 'content',
    status: 'coming-soon',
    benefits: [
      'Unique descriptions for each product',
      'Conversion-focused copy',
      'Feature highlighting',
      'Brand voice consistency'
    ]
  },
  {
    id: 'smart-pricing',
    title: 'Smart Pricing Assistant',
    description: 'AI-powered pricing recommendations based on market data, competitor analysis, and demand patterns.',
    icon: IconTarget,
    color: 'red',
    category: 'optimization',
    status: 'coming-soon',
    benefits: [
      'Competitive pricing analysis',
      'Demand-based adjustments',
      'Profit margin optimization',
      'Dynamic pricing strategies'
    ]
  },
  {
    id: 'customer-insights',
    title: 'Customer Behavior Insights',
    description: 'Analyze customer patterns and provide actionable recommendations to boost sales.',
    icon: IconChartLine,
    color: 'purple',
    category: 'optimization',
    status: 'coming-soon',
    benefits: [
      'Purchase pattern analysis',
      'Customer segmentation',
      'Personalization recommendations',
      'Churn prediction'
    ]
  },
  {
    id: 'email-campaigns',
    title: 'AI Email Campaigns',
    description: 'Automatically create personalized email campaigns for abandoned carts, promotions, and re-engagement.',
    icon: IconMail,
    color: 'cyan',
    category: 'automation',
    status: 'coming-soon',
    benefits: [
      'Personalized messaging',
      'Optimal send timing',
      'A/B test generation',
      'Revenue tracking'
    ]
  }
];

export default function AIPage() {
  const { user } = useAdmin();
  const [selectedFeature, setSelectedFeature] = useState<AIFeature | null>(null);
  const [opened, { open, close }] = useDisclosure(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [blogPostPrompt, setBlogPostPrompt] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [generatedStoreDetails, setGeneratedStoreDetails] = useState<GeneratedStoreDetails | null>(null);
  const [resultsOpened, { open: openResults, close: closeResults }] = useDisclosure(false);
  const [isApplying, setIsApplying] = useState(false);

  const handleApplyStoreDetails = async () => {
    if (!generatedStoreDetails || !user?.storeId) return;
    
    const payload = {
      storeId: generatedStoreDetails.storeId || user.storeId,
      storeName: generatedStoreDetails.storeName,
      storeDescription: generatedStoreDetails.storeDescription,
      heroTitle: generatedStoreDetails.heroTitle,
      heroDescription: generatedStoreDetails.heroDescription,
      theme: generatedStoreDetails.selectedTheme,
      metaTitle: generatedStoreDetails.metaTitle,
      metaDescription: generatedStoreDetails.metaDescription,
    };

    setIsApplying(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/store-config', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to apply store details');
      }

      notifications.show({
        title: 'Success!',
        message: 'Store details applied successfully',
        color: 'green',
        icon: <IconCheck size={16} />
      });

      closeResults();
      setGeneratedStoreDetails(null);
      setBusinessDescription('');
    } catch (error) {
      console.error('Error applying store details:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to apply store details. Please try again.',
        color: 'red',
        icon: <IconInfoCircle size={16} />
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleFeatureClick = (feature: AIFeature) => {
    setSelectedFeature(feature);
    open();
  };

  const handleGenerate = async (featureId: string) => {
    if (!user?.storeId) {
      notifications.show({
        title: 'Error',
        message: 'Store information not found',
        color: 'red',
        icon: <IconInfoCircle size={16} />
      });
      return;
    }

    if (featureId === 'store-details-generator' && !businessDescription.trim()) {
      notifications.show({
        title: 'Business Description Required',
        message: 'Please describe your business to generate store details',
        color: 'orange',
        icon: <IconInfoCircle size={16} />
      });
      return;
    }

    if (featureId === 'blog-post-generator' && !blogPostPrompt.trim()) {
      notifications.show({
        title: 'Blog Post Prompt Required',
        message: 'Please describe what kind of blog post you want to create',
        color: 'orange',
        icon: <IconInfoCircle size={16} />
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedContent('');
    setGeneratedStoreDetails(null);

    try {
      const requestBody = featureId === 'store-details-generator' 
        ? { businessDescription: businessDescription.trim() }
        : featureId === 'blog-post-generator'
        ? { userPrompt: blogPostPrompt.trim() }
        : { storeId: user.storeId };

      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/ai/${featureId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error('Failed to generate content');
      }

      const data = await response.json();
      
      if (featureId === 'store-details-generator') {
        setGeneratedStoreDetails(data.data);
        close();
        openResults();
      } else if (featureId === 'blog-post-generator') {
        // Redirect to edit page for blog posts
        if (data.redirectUrl) {
          window.location.href = data.redirectUrl;
          return;
        }
      } else {
        setGeneratedContent(data.content);
      }
      
      notifications.show({
        title: 'Success!',
        message: 'AI content generated successfully',
        color: 'green',
        icon: <IconCheck size={16} />
      });
    } catch (error) {
      console.error('Error generating AI content:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to generate content. Please try again.',
        color: 'red',
        icon: <IconInfoCircle size={16} />
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available':
        return <Badge color="green" variant="light">Available</Badge>;
      case 'beta':
        return <Badge color="yellow" variant="light">Beta</Badge>;
      case 'coming-soon':
        return <Badge color="gray" variant="light">Coming Soon</Badge>;
      default:
        return null;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'content':
        return 'blue';
      case 'automation':
        return 'green';
      case 'optimization':
        return 'purple';
      default:
        return 'gray';
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <div>
          <Group gap="sm" mb="sm">
            <IconBrain size={32} color="var(--mantine-color-violet-6)" />
            <Title order={1}>AI Assistant</Title>
          </Group>
          <Text size="lg" c="dimmed" mb="xl">
            Supercharge your store with AI-powered tools that automate content creation, 
            optimize operations, and boost sales performance.
          </Text>
        </div>

        {/* Quick Stats */}
        <Alert icon={<IconSparkles size={16} />} color="violet" variant="light">
          <Group justify="space-between">
            <div>
              <Text fw={500}>AI Features Available</Text>
              <Text size="sm" c="dimmed">
                {aiFeatures.filter(f => f.status === 'available').length} features ready to use, 
                {aiFeatures.filter(f => f.status === 'coming-soon').length} more coming soon
              </Text>
            </div>
            <Badge color="violet" size="lg" variant="gradient">
              {aiFeatures.length} Total Features
            </Badge>
          </Group>
        </Alert>

        {/* Feature Categories */}
        {['content', 'automation', 'optimization'].map(category => (
          <div key={category}>
            <Title order={2} mb="md" c={getCategoryColor(category)}>
              {category === 'content' && 'Content Generation'}
              {category === 'automation' && 'Process Automation'}
              {category === 'optimization' && 'Performance Optimization'}
            </Title>
            
            <Grid>
              {aiFeatures
                .filter(feature => feature.category === category)
                .map((feature) => (
                  <GridCol key={feature.id} span={{ base: 12, md: 6, lg: 4 }}>
                    <Card 
                      shadow="sm" 
                      padding="lg" 
                      radius="md" 
                      withBorder
                      style={{ 
                        height: '100%',
                        cursor: feature.status === 'available' ? 'pointer' : 'default',
                        opacity: feature.status === 'coming-soon' ? 0.7 : 1,
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                      onClick={() => feature.status === 'available' && handleFeatureClick(feature)}
                    >
                      <CardSection withBorder inheritPadding py="xs">
                        <Group justify="space-between">
                          <Group gap="sm">
                            <feature.icon size={20} color={`var(--mantine-color-${feature.color}-6)`} />
                            <Text fw={500}>{feature.title}</Text>
                          </Group>
                          {getStatusBadge(feature.status)}
                        </Group>
                      </CardSection>

                      <Text size="sm" c="dimmed" mt="md" mb="md">
                        {feature.description}
                      </Text>

                      <Stack gap="xs" mb="md" style={{ flex: 1 }}>
                        {feature.benefits.slice(0, 3).map((benefit, index) => (
                          <Group key={index} gap="xs">
                            <IconCheck size={14} color="var(--mantine-color-green-6)" />
                            <Text size="xs">{benefit}</Text>
                          </Group>
                        ))}
                      </Stack>

                      <Button
                        variant={feature.status === 'available' ? 'filled' : 'light'}
                        color={feature.color}
                        fullWidth
                        disabled={feature.status !== 'available'}
                        leftSection={feature.status === 'available' ? <IconRocket size={16} /> : null}
                        style={{ marginTop: 'auto' }}
                      >
                        {feature.status === 'available' ? 'Try Now' : 'Coming Soon'}
                      </Button>
                    </Card>
                  </GridCol>
                ))}
            </Grid>
          </div>
        ))}
      </Stack>

      {/* Feature Modal */}
      <Modal
        opened={opened}
        onClose={close}
        title={
          <Group gap="sm">
            {selectedFeature && <selectedFeature.icon size={24} />}
            <Text fw={500}>{selectedFeature?.title}</Text>
          </Group>
        }
        size="lg"
      >
        {selectedFeature && (
          <Stack gap="md">
            <Text>{selectedFeature.description}</Text>
            
            {selectedFeature?.id === 'store-details-generator' && (
              <div>
                <Text fw={500} mb="xs">Describe Your Business:</Text>
                <Textarea
                  placeholder="Tell us about your business, products, target audience, and what makes you unique. This will help AI generate personalized store details..."
                  value={businessDescription}
                  onChange={(e) => setBusinessDescription(e.currentTarget.value)}
                  minRows={4}
                  maxRows={6}
                  mb="md"
                />
              </div>
            )}

            {selectedFeature?.id === 'blog-post-generator' && (
              <div>
                <Text fw={500} mb="xs">Blog Post Idea:</Text>
                <Textarea
                  placeholder="Describe what kind of blog post you want to create. For example: 'Write a buying guide for our sticker collection', 'Create a seasonal post about summer trends', or 'Write about how to use our products creatively'..."
                  value={blogPostPrompt}
                  onChange={(e) => setBlogPostPrompt(e.currentTarget.value)}
                  minRows={4}
                  maxRows={6}
                  mb="md"
                />
              </div>
            )}

            <div>
              <Text fw={500} mb="xs">Benefits:</Text>
              <Stack gap="xs">
                {selectedFeature.benefits.map((benefit, index) => (
                  <Group key={index} gap="xs">
                    <IconCheck size={16} color="var(--mantine-color-green-6)" />
                    <Text size="sm">{benefit}</Text>
                  </Group>
                ))}
              </Stack>
            </div>

            <Button
              onClick={() => handleGenerate(selectedFeature.id)}
              loading={isGenerating}
              leftSection={<IconWand size={16} />}
              size="md"
              color={selectedFeature.color}
            >
              {isGenerating ? 'Generating...' : (selectedFeature.id === 'store-details-generator' ? 'Generate Store Details' : selectedFeature.id === 'blog-post-generator' ? 'Generate Blog Post' : 'Generate Now')}
            </Button>

            {generatedContent && (
              <div>
                <Text fw={500} mb="xs">Generated Content:</Text>
                <Textarea
                  value={generatedContent}
                  onChange={(e) => setGeneratedContent(e.currentTarget.value)}
                  minRows={6}
                  maxRows={12}
                  autosize
                />
                <Group mt="sm">
                  <Button variant="light" size="sm">
                    Copy to Clipboard
                  </Button>
                  <Button variant="light" size="sm">
                    Apply to Store
                  </Button>
                </Group>
              </div>
            )}
          </Stack>
        )}
      </Modal>

      {/* Store Details Results Modal */}
      <Modal
        opened={resultsOpened}
        onClose={closeResults}
        title={
          <Group gap="sm">
            <IconSparkles size={24} color="var(--mantine-color-blue-6)" />
            <Text fw={500}>Generated Store Details</Text>
          </Group>
        }
        size="xl"
      >
        {generatedStoreDetails && (
          <Stack gap="lg">
            <Alert color="blue" icon={<IconInfoCircle size={16} />}>
              Review the generated content below and click &quot;Apply to Store&quot; to update your store settings.
            </Alert>

            <Paper withBorder p="md" radius="md">
              <Stack gap="md">
                <div>
                  <Text fw={500} mb="xs">Store Name:</Text>
                  <Text size="lg">{generatedStoreDetails.storeName}</Text>
                </div>
                
                <Divider />
                
                <div>
                  <Text fw={500} mb="xs">Hero Title:</Text>
                  <Text size="lg">{generatedStoreDetails.heroTitle}</Text>
                </div>
                
                <div>
                  <Text fw={500} mb="xs">Hero Description:</Text>
                  <Text>{generatedStoreDetails.heroDescription}</Text>
                </div>
                
                <Divider />
                
                <div>
                  <Text fw={500} mb="xs">Store Description:</Text>
                  <Text>{generatedStoreDetails.storeDescription}</Text>
                </div>
                
                <div>
                  <Text fw={500} mb="xs">Selected Theme:</Text>
                  <Group gap="xs">
                    <ThemeIcon color="blue" size="sm" variant="light">
                      <IconColorSwatch size={14} />
                    </ThemeIcon>
                    <Text tt="capitalize">{generatedStoreDetails.selectedTheme}</Text>
                  </Group>
                </div>
                
                <Divider />
                
                <div>
                  <Text fw={500} mb="xs">SEO Meta Title:</Text>
                  <Text size="sm" c="dimmed">{generatedStoreDetails.metaTitle}</Text>
                </div>
                
                <div>
                  <Text fw={500} mb="xs">SEO Meta Description:</Text>
                  <Text size="sm" c="dimmed">{generatedStoreDetails.metaDescription}</Text>
                </div>
                
                <Divider />
                
                <div>
                  <Text fw={500} mb="xs">AI Reasoning:</Text>
                  <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                    {generatedStoreDetails.reasoning}
                  </Text>
                </div>
              </Stack>
            </Paper>

            <Group justify="flex-end">
              <Button 
                variant="light" 
                onClick={closeResults}
                leftSection={<IconX size={16} />}
              >
                Reject
              </Button>
              <Button 
                onClick={handleApplyStoreDetails}
                loading={isApplying}
                leftSection={<IconCheck size={16} />}
                color="green"
              >
                {isApplying ? 'Applying...' : 'Apply to Store'}
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}