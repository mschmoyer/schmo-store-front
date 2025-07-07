'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Container, Stack, Text, Group, Button } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import Link from 'next/link';
import { BlogPostData, BlogAPIResponse, BlogPost } from '@/types/blog';
import BlogPostForm from '@/components/blog/BlogPostForm';

export default function CreateBlogPostPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSave = async (postData: BlogPostData) => {
    setLoading(true);
    
    try {
      const response = await fetch('/api/blog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postData),
      });

      const data: BlogAPIResponse<BlogPost> = await response.json();

      if (data.success) {
        // Redirect to the blog admin page
        router.push('/admin/blog');
      } else {
        throw new Error(data.error || 'Failed to create blog post');
      }
    } catch (error) {
      console.error('Error creating blog post:', error);
      throw error; // Re-throw to let the form handle the error
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.push('/admin/blog');
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Stack gap="xs">
            <Group gap="sm" align="center">
              <Link href="/admin/blog" style={{ textDecoration: 'none' }}>
                <Button
                  variant="subtle"
                  leftSection={<IconArrowLeft size={16} />}
                  size="sm"
                  style={{
                    color: 'var(--theme-primary)',
                    backgroundColor: 'transparent'
                  }}
                >
                  Back to Blog Admin
                </Button>
              </Link>
            </Group>
            
            <Text
              size="xl"
              fw={700}
              style={{ color: 'var(--theme-text)' }}
            >
              Create New Blog Post
            </Text>
            
            <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
              Write and publish a new blog post. You can save it as a draft or publish it immediately.
            </Text>
          </Stack>
        </Group>

        {/* Blog Post Form */}
        <BlogPostForm
          onSave={handleSave}
          onCancel={handleCancel}
          isEditing={false}
          loading={loading}
        />
      </Stack>
    </Container>
  );
}