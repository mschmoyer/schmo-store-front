'use client';

import { Card, Group, Text, Badge, Stack, Image, ActionIcon, Box } from '@mantine/core';
import { IconEye, IconClock, IconArrowRight } from '@tabler/icons-react';
import Link from 'next/link';
import { BlogPostCardProps } from '@/types/blog';
import { 
  getRelativeTime, 
  extractTextFromHtml,
  formatCategoryName,
  formatTagName,
  getCategoryColor,
  getTagColor,
  getImageUrl,
  generateImageAlt,
  formatViewCount,
  createBlogUrl
} from '@/lib/blogHelpers';

export default function BlogPostCard({ 
  post, 
  storeSlug,
  showExcerpt = true, 
  showDate = true, 
  showCategories = true, 
  showTags = true 
}: BlogPostCardProps) {
  const excerpt = post.excerpt || extractTextFromHtml(post.content, 160);
  const imageUrl = getImageUrl(post.featured_image);
  const imageAlt = generateImageAlt(post);
  const blogUrl = createBlogUrl(post.slug, storeSlug);

  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{
        backgroundColor: 'var(--theme-card)',
        borderColor: 'var(--theme-border)',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.boxShadow = '0 12px 24px rgba(0,0,0,0.15)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      }}
    >
      <Link href={blogUrl} style={{ textDecoration: 'none', color: 'inherit' }}>
        <Stack gap="md" style={{ height: '100%' }}>
          {/* Featured Image */}
          <Image
            src={imageUrl}
            alt={imageAlt}
            height={200}
            radius="md"
            style={{
              objectFit: 'cover',
              backgroundColor: 'var(--theme-background-secondary)'
            }}
          />
          
          {/* Content */}
          <Stack gap="sm" style={{ flex: 1 }}>
            {/* Categories */}
            {showCategories && post.categories && post.categories.length > 0 && (
              <Group gap="xs">
                {post.categories.slice(0, 2).map((category) => (
                  <Badge
                    key={category}
                    variant="light"
                    color={getCategoryColor(category)}
                    size="sm"
                    style={{
                      backgroundColor: `var(--theme-${getCategoryColor(category)})`,
                      color: 'var(--theme-text-on-primary)'
                    }}
                  >
                    {formatCategoryName(category)}
                  </Badge>
                ))}
                {post.categories.length > 2 && (
                  <Badge
                    variant="light"
                    color="gray"
                    size="sm"
                    style={{
                      backgroundColor: 'var(--theme-background-tertiary)',
                      color: 'var(--theme-text-muted)'
                    }}
                  >
                    +{post.categories.length - 2}
                  </Badge>
                )}
              </Group>
            )}
            
            {/* Title */}
            <Text
              size="lg"
              fw={600}
              style={{ 
                color: 'var(--theme-text)',
                lineHeight: 1.3,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {post.title}
            </Text>
            
            {/* Excerpt */}
            {showExcerpt && (
              <Text
                size="sm"
                style={{ 
                  color: 'var(--theme-text-muted)',
                  lineHeight: 1.5,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {excerpt}
              </Text>
            )}
            
            {/* Tags */}
            {showTags && post.tags && post.tags.length > 0 && (
              <Group gap="xs">
                {post.tags.slice(0, 3).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    color={getTagColor(tag)}
                    size="xs"
                    style={{
                      borderColor: `var(--theme-${getTagColor(tag)})`,
                      color: `var(--theme-${getTagColor(tag)})`
                    }}
                  >
                    {formatTagName(tag)}
                  </Badge>
                ))}
                {post.tags.length > 3 && (
                  <Badge
                    variant="outline"
                    color="gray"
                    size="xs"
                    style={{
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text-muted)'
                    }}
                  >
                    +{post.tags.length - 3}
                  </Badge>
                )}
              </Group>
            )}
            
            {/* Spacer */}
            <Box style={{ flex: 1 }} />
            
            {/* Footer */}
            <Group justify="space-between" align="center">
              {/* Date and Reading Time */}
              <Group gap="md">
                {showDate && (
                  <Group gap="xs">
                    <IconClock size={14} style={{ color: 'var(--theme-text-muted)' }} />
                    <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
                      {getRelativeTime(post.published_at || post.created_at)}
                    </Text>
                  </Group>
                )}
                
                {post.reading_time && (
                  <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
                    {post.reading_time} min read
                  </Text>
                )}
              </Group>
              
              {/* View Count and Read More */}
              <Group gap="sm">
                {post.view_count && post.view_count > 0 && (
                  <Group gap="xs">
                    <IconEye size={14} style={{ color: 'var(--theme-text-muted)' }} />
                    <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
                      {formatViewCount(post.view_count)}
                    </Text>
                  </Group>
                )}
                
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  style={{ color: 'var(--theme-primary)' }}
                >
                  <IconArrowRight size={16} />
                </ActionIcon>
              </Group>
            </Group>
          </Stack>
        </Stack>
      </Link>
    </Card>
  );
}