'use client';

import { Stack, Text, Button, Card, List, Group, ThemeIcon, rem } from '@mantine/core';
import { 
  IconPlus, 
  IconBulb, 
  IconUsers, 
  IconTrendingUp, 
  IconSearch,
  IconRocket
} from '@tabler/icons-react';
import Link from 'next/link';

export function BlogEmptyState() {
  return (
    <Card
      padding="xl"
      radius="md"
      style={{
        backgroundColor: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
        textAlign: 'center',
        maxWidth: '600px',
        margin: '0 auto'
      }}
    >
      <Stack gap="xl" align="center">
        {/* Icon */}
        <ThemeIcon 
          size={80} 
          radius="xl" 
          variant="light" 
          color="blue"
          style={{ backgroundColor: 'var(--theme-primary-light)' }}
        >
          <IconRocket style={{ width: rem(40), height: rem(40) }} />
        </ThemeIcon>

        {/* Main Message */}
        <Stack gap="sm" align="center">
          <Text size="xl" fw={700} style={{ color: 'var(--theme-text)' }}>
            Start Your Blog Journey
          </Text>
          <Text size="md" style={{ color: 'var(--theme-text-muted)', maxWidth: '400px' }}>
            Create engaging content to connect with your customers and boost your store&apos;s visibility.
          </Text>
        </Stack>

        {/* Benefits */}
        <Card 
          padding="lg" 
          radius="md" 
          style={{ 
            backgroundColor: 'var(--theme-background-secondary)',
            width: '100%'
          }}
        >
          <Stack gap="md">
            <Group>
              <ThemeIcon size="sm" color="green" variant="light">
                <IconBulb style={{ width: rem(16), height: rem(16) }} />
              </ThemeIcon>
              <Text size="sm" style={{ color: 'var(--theme-text)' }}>
                <strong>Why Blog?</strong> Blogging helps your store in several ways:
              </Text>
            </Group>
            
            <List
              spacing="xs"
              size="sm"
              icon={
                <ThemeIcon size="sm" color="blue" variant="light">
                  <IconTrendingUp style={{ width: rem(12), height: rem(12) }} />
                </ThemeIcon>
              }
              style={{ textAlign: 'left' }}
            >
              <List.Item>
                <Text style={{ color: 'var(--theme-text)' }}>
                  <strong>Improve SEO:</strong> Fresh content helps search engines find your store
                </Text>
              </List.Item>
              <List.Item>
                <Text style={{ color: 'var(--theme-text)' }}>
                  <strong>Build Trust:</strong> Share your expertise and connect with customers
                </Text>
              </List.Item>
              <List.Item>
                <Text style={{ color: 'var(--theme-text)' }}>
                  <strong>Drive Traffic:</strong> Engaging posts bring visitors to your store
                </Text>
              </List.Item>
              <List.Item>
                <Text style={{ color: 'var(--theme-text)' }}>
                  <strong>Showcase Products:</strong> Feature new items and highlight bestsellers
                </Text>
              </List.Item>
            </List>
          </Stack>
        </Card>

        {/* Getting Started Tips */}
        <Card 
          padding="lg" 
          radius="md" 
          style={{ 
            backgroundColor: 'var(--theme-background-tertiary)',
            width: '100%'
          }}
        >
          <Stack gap="md">
            <Group>
              <ThemeIcon size="sm" color="orange" variant="light">
                <IconUsers style={{ width: rem(16), height: rem(16) }} />
              </ThemeIcon>
              <Text size="sm" fw={600} style={{ color: 'var(--theme-text)' }}>
                First Post Ideas:
              </Text>
            </Group>
            
            <List
              spacing="xs"
              size="sm"
              icon="•"
              style={{ textAlign: 'left' }}
            >
              <List.Item style={{ color: 'var(--theme-text-muted)' }}>
                Welcome customers and share your store&apos;s story
              </List.Item>
              <List.Item style={{ color: 'var(--theme-text-muted)' }}>
                Introduce your top products and their benefits
              </List.Item>
              <List.Item style={{ color: 'var(--theme-text-muted)' }}>
                Write a how-to guide related to your products
              </List.Item>
              <List.Item style={{ color: 'var(--theme-text-muted)' }}>
                Share behind-the-scenes content about your business
              </List.Item>
              <List.Item style={{ color: 'var(--theme-text-muted)' }}>
                Create a FAQ post addressing common questions
              </List.Item>
            </List>
          </Stack>
        </Card>

        {/* Action Button */}
        <Link href="/admin/blog/create" style={{ textDecoration: 'none' }}>
          <Button
            size="lg"
            leftSection={<IconPlus size={20} />}
            style={{
              backgroundColor: 'var(--theme-primary)',
              color: 'var(--theme-text-on-primary)',
              border: 'none'
            }}
          >
            Write Your First Blog Post
          </Button>
        </Link>

        {/* SEO Tip */}
        <Card 
          padding="md" 
          radius="md" 
          style={{ 
            backgroundColor: 'var(--theme-info-light)',
            border: '1px solid var(--theme-info)',
            width: '100%'
          }}
        >
          <Group>
            <ThemeIcon size="sm" color="cyan" variant="light">
              <IconSearch style={{ width: rem(16), height: rem(16) }} />
            </ThemeIcon>
            <Text size="sm" style={{ color: 'var(--theme-text)' }}>
              <strong>Pro Tip:</strong> Regular blogging can improve your store&apos;s search engine ranking and bring in more organic traffic.
            </Text>
          </Group>
        </Card>
      </Stack>
    </Card>
  );
}