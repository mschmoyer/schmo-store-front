'use client';

import { useState, useEffect } from 'react';
import { Container, Title, Text, Badge, Group, Stack, Alert, Loader, Center, Button } from '@mantine/core';
import { IconCalendar, IconUser, IconArrowLeft, IconAlertCircle } from '@tabler/icons-react';
import { useParams } from 'next/navigation';
import { BlogPost } from '@/types/blog';
import { StoreThemeProvider } from '@/components/store/StoreThemeProvider';
import Link from 'next/link';

interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  theme_name: string;
  currency: string;
}

export default function StoreBlogPostPage() {
  const params = useParams();
  const storeSlug = params.storeSlug as string;
  const postSlug = params.slug as string;
  
  const [store, setStore] = useState<Store | null>(null);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch store information
  useEffect(() => {
    const fetchStore = async () => {
      try {
        const response = await fetch(`/api/stores/public?slug=${storeSlug}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setStore(data.data);
          }
        }
      } catch (err) {
        console.error('Error fetching store:', err);
      }
    };

    if (storeSlug) {
      fetchStore();
    }
  }, [storeSlug]);

  // Fetch blog post
  useEffect(() => {
    const fetchPost = async () => {
      if (!store) return;
      
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/blog/slug/${postSlug}?store_id=${store.id}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Blog post not found');
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.success && data.data) {
          setPost(data.data);
        } else {
          throw new Error(data.error || 'Failed to fetch blog post');
        }
      } catch (error) {
        console.error('Error fetching blog post:', error);
        setError(error instanceof Error ? error.message : 'Failed to load blog post');
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [store, postSlug]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!store) {
    return (
      <Container size="xl" py="xl">
        <Center>
          <Stack align="center">
            <Loader size="lg" />
            <Text>Loading store...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (loading) {
    return (
      <StoreThemeProvider themeId={store.theme_name || 'default'}>
        <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
          <Container size="lg" py="xl">
            <Center>
              <Stack align="center">
                <Loader size="lg" />
                <Text style={{ color: 'var(--theme-text-muted)' }}>Loading blog post...</Text>
              </Stack>
            </Center>
          </Container>
        </div>
      </StoreThemeProvider>
    );
  }

  if (error || !post) {
    return (
      <StoreThemeProvider themeId={store.theme_name || 'default'}>
        <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
          <Container size="lg" py="xl">
            <Alert color="red" title="Error Loading Blog Post" icon={<IconAlertCircle size="1rem" />} mb="lg">
              {error || 'Blog post not found'}
            </Alert>
            <Button
              component={Link}
              href={`/blog/${storeSlug}`}
              leftSection={<IconArrowLeft size={16} />}
              style={{
                background: 'var(--theme-primary-gradient)',
                border: 'none',
                fontWeight: 600,
                color: 'var(--theme-text-on-primary)'
              }}
            >
              Back to Blog
            </Button>
          </Container>
        </div>
      </StoreThemeProvider>
    );
  }

  return (
    <StoreThemeProvider themeId={store.theme_name || 'default'}>
      <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
        <Container size="lg" py="xl">
          <Stack gap="lg">
            {/* Navigation */}
            <Group>
              <Button
                component={Link}
                href={`/blog/${storeSlug}`}
                leftSection={<IconArrowLeft size={16} />}
                variant="outline"
                style={{
                  borderColor: 'var(--theme-primary)',
                  color: 'var(--theme-primary)'
                }}
              >
                Back to Blog
              </Button>
            </Group>

            {/* Post Header */}
            <Stack gap="md">
              <Title order={1} style={{ 
                fontSize: '2.5rem',
                fontWeight: 800,
                color: 'var(--theme-text)',
                lineHeight: 1.2
              }}>
                {post.title}
              </Title>

              {post.excerpt && (
                <Text size="xl" style={{ 
                  color: 'var(--theme-text-secondary)',
                  fontStyle: 'italic'
                }}>
                  {post.excerpt}
                </Text>
              )}

              <Group gap="md">
                <Group gap="xs">
                  <IconCalendar size={16} style={{ color: 'var(--theme-text-muted)' }} />
                  <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                    {formatDate(post.publish_date)}
                  </Text>
                </Group>
                
                {post.author_name && (
                  <Group gap="xs">
                    <IconUser size={16} style={{ color: 'var(--theme-text-muted)' }} />
                    <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                      {post.author_name}
                    </Text>
                  </Group>
                )}
                
                {post.category && (
                  <Badge variant="light" style={{ 
                    backgroundColor: 'var(--theme-primary)',
                    color: 'var(--theme-text-on-primary)'
                  }}>
                    {post.category}
                  </Badge>
                )}
              </Group>

              {post.tags && post.tags.length > 0 && (
                <Group gap="xs">
                  {post.tags.map((tag, index) => (
                    <Badge key={index} variant="outline" size="sm" style={{
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-muted)'
                    }}>
                      {tag}
                    </Badge>
                  ))}
                </Group>
              )}
            </Stack>

            {/* Post Content */}
            <div style={{
              color: 'var(--theme-text)',
              lineHeight: 1.7,
              fontSize: '1.1rem'
            }}>
              <div dangerouslySetInnerHTML={{ __html: post.content }} />
            </div>

            {/* Post Footer */}
            <div style={{
              marginTop: '3rem',
              paddingTop: '2rem',
              borderTop: '1px solid var(--theme-border)'
            }}>
              <Group justify="space-between">
                <Button
                  component={Link}
                  href={`/blog/${storeSlug}`}
                  leftSection={<IconArrowLeft size={16} />}
                  variant="outline"
                  style={{
                    borderColor: 'var(--theme-primary)',
                    color: 'var(--theme-primary)'
                  }}
                >
                  Back to Blog
                </Button>
                
                <Button
                  component={Link}
                  href={`/store/${storeSlug}`}
                  style={{
                    background: 'var(--theme-primary-gradient)',
                    border: 'none',
                    fontWeight: 600,
                    color: 'var(--theme-text-on-primary)'
                  }}
                >
                  Visit Store
                </Button>
              </Group>
            </div>
          </Stack>
        </Container>
      </div>
    </StoreThemeProvider>
  );
}