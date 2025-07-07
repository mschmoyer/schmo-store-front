'use client';

import { useState, useEffect } from 'react';
import { 
  Stack, 
  Text, 
  Group, 
  Button, 
  Container,
  Alert,
  Title,
  Loader,
  Center
} from '@mantine/core';
import { IconRss, IconAlertCircle, IconArrowLeft } from '@tabler/icons-react';
import { useSearchParams, useParams } from 'next/navigation';
import { BlogPost, BlogAPIResponse } from '@/types/blog';
import BlogPostList from '@/components/blog/BlogPostList';
import { StoreThemeProvider } from '@/components/store/StoreThemeProvider';
import { TopNav } from '@/components';
import Link from 'next/link';

interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  theme_name: string;
  currency: string;
}

export default function StoreBlogPage() {
  const params = useParams();
  const storeSlug = params.storeSlug as string;
  
  const [store, setStore] = useState<Store | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 9,
    total: 0,
    totalPages: 0
  });

  const searchParams = useSearchParams();
  const currentCategory = searchParams.get('category');
  const currentTag = searchParams.get('tag');
  const currentSearch = searchParams.get('search');
  const currentPage = parseInt(searchParams.get('page') || '1');

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

  // Fetch blog posts for this store
  useEffect(() => {
    const fetchPosts = async () => {
      if (!store) return;
      
      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', currentPage.toString());
        queryParams.set('limit', pagination.limit.toString());
        queryParams.set('storeId', store.id); // Filter by store

        if (currentCategory) queryParams.set('category', currentCategory);
        if (currentTag) queryParams.set('tag', currentTag);
        if (currentSearch) queryParams.set('search', currentSearch);

        const response = await fetch(`/api/blog?${queryParams.toString()}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data: BlogAPIResponse = await response.json();
        
        if (data.success && data.data) {
          setPosts(data.data.posts || []);
          setPagination(prev => ({
            ...prev,
            page: data.data.pagination?.page || currentPage,
            total: data.data.pagination?.total || 0,
            totalPages: data.data.pagination?.totalPages || 0
          }));
        } else {
          throw new Error(data.error || 'Failed to fetch blog posts');
        }
      } catch (error) {
        console.error('Error fetching blog posts:', error);
        setError(error instanceof Error ? error.message : 'Failed to load blog posts');
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [store, currentCategory, currentTag, currentSearch, currentPage, pagination.limit]);


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

  if (error) {
    return (
      <StoreThemeProvider themeId={store.theme_name || 'default'}>
        <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
          <Container size="xl" py="xl">
            <Alert color="red" title="Error Loading Blog" icon={<IconAlertCircle size="1rem" />}>
              {error}
            </Alert>
          </Container>
        </div>
      </StoreThemeProvider>
    );
  }

  return (
    <StoreThemeProvider themeId={store.theme_name || 'default'}>
      <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
        <TopNav storeSlug={storeSlug} store={store} />
        {/* Hero Section */}
        <div style={{
          background: 'var(--theme-hero-gradient)',
          borderBottom: '1px solid var(--theme-border)',
          padding: '3rem 0',
          marginBottom: '2rem'
        }}>
          <Container size="xl">
            <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
              <Title order={1} style={{ 
                fontSize: '3rem',
                fontWeight: 800,
                color: 'var(--theme-text)',
                marginBottom: '1rem',
                letterSpacing: '-0.5px'
              }}>
                {store.store_name} Blog
              </Title>
              <Text size="xl" style={{ 
                fontSize: '1.25rem',
                lineHeight: 1.6,
                maxWidth: '600px',
                margin: '0 auto',
                color: 'var(--theme-text-secondary)'
              }}>
                Latest news, updates, and insights from {store.store_name}
              </Text>
              <Group justify="center" mt="lg">
                <Button
                  component={Link}
                  href={`/store/${storeSlug}`}
                  leftSection={<IconArrowLeft size={16} />}
                  variant="outline"
                  style={{
                    borderColor: 'var(--theme-primary)',
                    color: 'var(--theme-primary)'
                  }}
                >
                  Back to Store
                </Button>
              </Group>
            </div>
          </Container>
        </div>

        <Container size="xl" py="lg">
          {loading ? (
            <Center>
              <Stack align="center">
                <Loader size="lg" />
                <Text style={{ color: 'var(--theme-text-muted)' }}>Loading blog posts...</Text>
              </Stack>
            </Center>
          ) : posts.length === 0 ? (
            <Stack align="center" gap="lg">
              <IconRss size={80} stroke={1} style={{ color: 'var(--theme-text-muted)' }} />
              <Stack align="center" gap="sm">
                <Title order={2} style={{ color: 'var(--theme-text)' }}>No blog posts yet</Title>
                <Text style={{ color: 'var(--theme-text-muted)' }} size="lg">
                  {store.store_name} hasn&apos;t published any blog posts yet. Check back soon!
                </Text>
              </Stack>
            </Stack>
          ) : (
            <BlogPostList
              posts={posts}
              pagination={pagination}
              storeSlug={storeSlug}
            />
          )}
        </Container>
      </div>
    </StoreThemeProvider>
  );
}