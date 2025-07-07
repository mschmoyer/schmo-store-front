'use client';

import { Grid, Stack, Text, Group, Pagination, Select, TextInput, Button, Center, Loader, GridCol } from '@mantine/core';
import { IconSearch, IconFilter, IconX } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { BlogPostListProps, BlogFilters } from '@/types/blog';
import BlogPostCard from './BlogPostCard';

export default function BlogPostList({ 
  posts, 
  pagination, 
  storeSlug,
  showFilters = true,
  loading = false
}: BlogPostListProps) {
  const [filters, setFilters] = useState<BlogFilters>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  // Load categories and tags for filters
  useEffect(() => {
    if (showFilters) {
      // Extract categories and tags from posts
      const categorySet = new Set<string>();
      const tagSet = new Set<string>();
      
      posts.forEach(post => {
        post.categories?.forEach(category => categorySet.add(category));
        post.tags?.forEach(tag => tagSet.add(tag));
      });
      
      setCategories(Array.from(categorySet).sort());
      setTags(Array.from(tagSet).sort());
    }
  }, [posts, showFilters]);

  const handleFilterChange = (key: keyof BlogFilters, value: string | undefined) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.values(filters).some(value => value);

  if (loading) {
    return (
      <Center py="xl">
        <Stack align="center" gap="md">
          <Loader size="md" color="var(--theme-primary)" />
          <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
            Loading blog posts...
          </Text>
        </Stack>
      </Center>
    );
  }

  if (posts.length === 0) {
    return (
      <Center py="xl">
        <Stack align="center" gap="md">
          <Text size="lg" fw={600} style={{ color: 'var(--theme-text)' }}>
            No blog posts found
          </Text>
          <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
            {hasActiveFilters 
              ? 'Try adjusting your filters or search terms.'
              : 'Check back later for new content!'
            }
          </Text>
          {hasActiveFilters && (
            <Button
              variant="light"
              leftSection={<IconX size={16} />}
              onClick={clearFilters}
              style={{
                backgroundColor: 'var(--theme-background-secondary)',
                color: 'var(--theme-text)',
                borderColor: 'var(--theme-border)'
              }}
            >
              Clear Filters
            </Button>
          )}
        </Stack>
      </Center>
    );
  }

  return (
    <Stack gap="lg">
      {/* Filters */}
      {showFilters && (
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text size="lg" fw={600} style={{ color: 'var(--theme-text)' }}>
              Blog Posts
            </Text>
            {hasActiveFilters && (
              <Button
                variant="subtle"
                size="sm"
                leftSection={<IconX size={14} />}
                onClick={clearFilters}
                style={{ color: 'var(--theme-text-muted)' }}
              >
                Clear Filters
              </Button>
            )}
          </Group>
          
          <Grid>
            <GridCol span={{ base: 12, md: 4 }}>
              <TextInput
                placeholder="Search posts..."
                leftSection={<IconSearch size={16} />}
                value={filters.search || ''}
                onChange={(e) => handleFilterChange('search', e.target.value || undefined)}
                style={{
                  input: {
                    backgroundColor: 'var(--theme-background-secondary)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                    '&::placeholder': {
                      color: 'var(--theme-text-muted)',
                    }
                  }
                }}
              />
            </GridCol>
            
            <GridCol span={{ base: 12, md: 4 }}>
              <Select
                placeholder="Filter by category"
                data={categories.map(cat => ({ value: cat, label: cat }))}
                value={filters.category || null}
                onChange={(value) => handleFilterChange('category', value || undefined)}
                clearable
                leftSection={<IconFilter size={16} />}
                styles={{
                  input: {
                    backgroundColor: 'var(--theme-background-secondary)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                    '&::placeholder': {
                      color: 'var(--theme-text-muted)',
                    }
                  },
                  dropdown: {
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-border)',
                  },
                  option: {
                    color: 'var(--theme-text)',
                    '&[dataSelected]': {
                      backgroundColor: 'var(--theme-primary)',
                      color: 'var(--theme-text-on-primary)',
                    },
                    '&[dataHovered]': {
                      backgroundColor: 'var(--theme-background-tertiary)',
                    }
                  }
                }}
              />
            </GridCol>
            
            <GridCol span={{ base: 12, md: 4 }}>
              <Select
                placeholder="Filter by tag"
                data={tags.map(tag => ({ value: tag, label: tag }))}
                value={filters.tag || null}
                onChange={(value) => handleFilterChange('tag', value || undefined)}
                clearable
                leftSection={<IconFilter size={16} />}
                styles={{
                  input: {
                    backgroundColor: 'var(--theme-background-secondary)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                    '&::placeholder': {
                      color: 'var(--theme-text-muted)',
                    }
                  },
                  dropdown: {
                    backgroundColor: 'var(--theme-card)',
                    borderColor: 'var(--theme-border)',
                  },
                  option: {
                    color: 'var(--theme-text)',
                    '&[dataSelected]': {
                      backgroundColor: 'var(--theme-primary)',
                      color: 'var(--theme-text-on-primary)',
                    },
                    '&[dataHovered]': {
                      backgroundColor: 'var(--theme-background-tertiary)',
                    }
                  }
                }}
              />
            </GridCol>
          </Grid>
        </Stack>
      )}

      {/* Results Count */}
      {pagination && (
        <Group justify="space-between" align="center">
          <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
            Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} posts
          </Text>
        </Group>
      )}

      {/* Blog Posts Grid */}
      <Grid>
        {posts.map((post) => (
          <GridCol key={post.id} span={{ base: 12, md: 6, lg: 4 }}>
            <BlogPostCard post={post} storeSlug={storeSlug} />
          </GridCol>
        ))}
      </Grid>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Center>
          <Pagination
            total={pagination.totalPages}
            value={pagination.page}
            onChange={(page) => {
              // Handle pagination change
              const url = new URL(window.location.href);
              url.searchParams.set('page', page.toString());
              window.history.pushState({}, '', url.toString());
              window.location.reload();
            }}
            size="sm"
            styles={{
              control: {
                backgroundColor: 'var(--theme-background-secondary)',
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-text)',
                '&:hover': {
                  backgroundColor: 'var(--theme-background-tertiary)',
                },
                '&[dataActive]': {
                  backgroundColor: 'var(--theme-primary)',
                  borderColor: 'var(--theme-primary)',
                  color: 'var(--theme-text-on-primary)',
                }
              }
            }}
          />
        </Center>
      )}
    </Stack>
  );
}