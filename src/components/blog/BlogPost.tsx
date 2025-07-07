'use client';

import { 
  Stack, 
  Text, 
  Group, 
  Badge, 
  Image, 
  Container, 
  ActionIcon, 
  Divider,
  Box,
  Card,
  Button
} from '@mantine/core';
import { 
  IconEye, 
  IconClock, 
  IconShare, 
  IconBrandFacebook, 
  IconBrandTwitter, 
  IconBrandLinkedin,
  IconMail,
  IconCopy,
  IconArrowLeft
} from '@tabler/icons-react';
import { useState } from 'react';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { BlogPostProps } from '@/types/blog';
import { 
  formatDate, 
  formatCategoryName,
  formatTagName,
  getCategoryColor,
  getTagColor,
  getImageUrl,
  generateImageAlt,
  formatViewCount,
  generateSocialShareUrls,
  createCategoryUrl,
  createTagUrl
} from '@/lib/blogHelpers';

export default function BlogPost({ 
  post, 
  showRelated = true, 
  showSocial = true,
  showComments = false
}: BlogPostProps) {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const imageUrl = getImageUrl(post.featured_image);
  const imageAlt = generateImageAlt(post);
  const socialUrls = generateSocialShareUrls(post);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(socialUrls.copy);
      notifications.show({
        title: 'Link Copied!',
        message: 'The blog post URL has been copied to your clipboard.',
        color: 'green',
        autoClose: 3000,
      });
    } catch {
      notifications.show({
        title: 'Copy Failed',
        message: 'Could not copy link to clipboard.',
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        {/* Breadcrumbs */}
        <Group gap="xs" align="center">
          <Link href="/blog" style={{ textDecoration: 'none' }}>
            <Group gap="xs" align="center">
              <ActionIcon
                variant="subtle"
                size="sm"
                style={{ color: 'var(--theme-primary)' }}
              >
                <IconArrowLeft size={16} />
              </ActionIcon>
              <Text size="sm" style={{ color: 'var(--theme-primary)' }}>
                Back to Blog
              </Text>
            </Group>
          </Link>
        </Group>

        {/* Article Header */}
        <Stack gap="md">
          {/* Categories */}
          {post.categories && post.categories.length > 0 && (
            <Group gap="xs">
              {post.categories.map((category) => (
                <Link key={category} href={createCategoryUrl(category)} style={{ textDecoration: 'none' }}>
                  <Badge
                    variant="light"
                    color={getCategoryColor(category)}
                    size="md"
                    style={{
                      backgroundColor: `var(--theme-${getCategoryColor(category)})`,
                      color: 'var(--theme-text-on-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    {formatCategoryName(category)}
                  </Badge>
                </Link>
              ))}
            </Group>
          )}
          
          {/* Title */}
          <Text
            size="xl"
            fw={700}
            style={{ 
              color: 'var(--theme-text)',
              lineHeight: 1.2,
              fontSize: '2.5rem'
            }}
          >
            {post.title}
          </Text>
          
          {/* Excerpt */}
          {post.excerpt && (
            <Text
              size="lg"
              style={{ 
                color: 'var(--theme-text-muted)',
                lineHeight: 1.5,
                fontStyle: 'italic'
              }}
            >
              {post.excerpt}
            </Text>
          )}
          
          {/* Meta Information */}
          <Group justify="space-between" align="center">
            <Group gap="md">
              <Group gap="xs">
                <IconClock size={16} style={{ color: 'var(--theme-text-muted)' }} />
                <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                  {formatDate(post.published_at || post.created_at)}
                </Text>
              </Group>
              
              {post.reading_time && (
                <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                  {post.reading_time} min read
                </Text>
              )}
              
              {post.view_count && post.view_count > 0 && (
                <Group gap="xs">
                  <IconEye size={16} style={{ color: 'var(--theme-text-muted)' }} />
                  <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                    {formatViewCount(post.view_count)} views
                  </Text>
                </Group>
              )}
            </Group>
            
            {/* Social Sharing */}
            {showSocial && (
              <Group gap="xs">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  style={{ color: 'var(--theme-text-muted)' }}
                >
                  <IconShare size={16} />
                </ActionIcon>
                
                {showShareMenu && (
                  <Group gap="xs">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      component="a"
                      href={socialUrls.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1877F2' }}
                    >
                      <IconBrandFacebook size={16} />
                    </ActionIcon>
                    
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      component="a"
                      href={socialUrls.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#1DA1F2' }}
                    >
                      <IconBrandTwitter size={16} />
                    </ActionIcon>
                    
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      component="a"
                      href={socialUrls.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#0A66C2' }}
                    >
                      <IconBrandLinkedin size={16} />
                    </ActionIcon>
                    
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      component="a"
                      href={socialUrls.email}
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      <IconMail size={16} />
                    </ActionIcon>
                    
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={copyToClipboard}
                      style={{ color: 'var(--theme-text-muted)' }}
                    >
                      <IconCopy size={16} />
                    </ActionIcon>
                  </Group>
                )}
              </Group>
            )}
          </Group>
        </Stack>

        {/* Featured Image */}
        {post.featured_image && (
          <Image
            src={imageUrl}
            alt={imageAlt}
            radius="md"
            style={{
              width: '100%',
              maxHeight: '400px',
              objectFit: 'cover'
            }}
          />
        )}

        {/* Article Content */}
        <Box
          style={{
            color: 'var(--theme-text)',
            lineHeight: 1.7,
            fontSize: '1.1rem'
          }}
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <Stack gap="sm">
            <Divider />
            <Group gap="xs">
              <Text size="sm" fw={600} style={{ color: 'var(--theme-text)' }}>
                Tags:
              </Text>
              {post.tags.map((tag) => (
                <Link key={tag} href={createTagUrl(tag)} style={{ textDecoration: 'none' }}>
                  <Badge
                    variant="outline"
                    color={getTagColor(tag)}
                    size="sm"
                    style={{
                      borderColor: `var(--theme-${getTagColor(tag)})`,
                      color: `var(--theme-${getTagColor(tag)})`,
                      cursor: 'pointer'
                    }}
                  >
                    {formatTagName(tag)}
                  </Badge>
                </Link>
              ))}
            </Group>
          </Stack>
        )}

        {/* Social Sharing Bottom */}
        {showSocial && (
          <Stack gap="md">
            <Divider />
            <Group justify="center" gap="md">
              <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                Share this article:
              </Text>
              <Group gap="sm">
                <Button
                  variant="outline"
                  size="sm"
                  leftSection={<IconBrandFacebook size={16} />}
                  component="a"
                  href={socialUrls.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderColor: '#1877F2', color: '#1877F2' }}
                >
                  Facebook
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  leftSection={<IconBrandTwitter size={16} />}
                  component="a"
                  href={socialUrls.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderColor: '#1DA1F2', color: '#1DA1F2' }}
                >
                  Twitter
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  leftSection={<IconBrandLinkedin size={16} />}
                  component="a"
                  href={socialUrls.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderColor: '#0A66C2', color: '#0A66C2' }}
                >
                  LinkedIn
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  leftSection={<IconCopy size={16} />}
                  onClick={copyToClipboard}
                  style={{ 
                    borderColor: 'var(--theme-border)', 
                    color: 'var(--theme-text-muted)' 
                  }}
                >
                  Copy Link
                </Button>
              </Group>
            </Group>
          </Stack>
        )}

        {/* Related Posts */}
        {showRelated && (
          <Stack gap="md">
            <Divider />
            <Text size="lg" fw={600} style={{ color: 'var(--theme-text)' }}>
              Related Posts
            </Text>
            <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
              Coming soon! Related posts based on categories and tags.
            </Text>
          </Stack>
        )}

        {/* Comments Section */}
        {showComments && (
          <Stack gap="md">
            <Divider />
            <Text size="lg" fw={600} style={{ color: 'var(--theme-text)' }}>
              Comments
            </Text>
            <Card
              padding="lg"
              style={{
                backgroundColor: 'var(--theme-background-secondary)',
                borderColor: 'var(--theme-border)'
              }}
            >
              <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                Comments system coming soon! Share your thoughts on social media for now.
              </Text>
            </Card>
          </Stack>
        )}
      </Stack>
    </Container>
  );
}