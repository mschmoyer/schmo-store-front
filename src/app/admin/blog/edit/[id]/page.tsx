'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  Container, 
  Stack, 
  Text, 
  Group, 
  Button, 
  Alert,
  Center,
  Loader
} from '@mantine/core';
import { IconArrowLeft, IconAlertCircle } from '@tabler/icons-react';
import Link from 'next/link';
import { BlogPost, BlogPostData, BlogAPIResponse } from '@/types/blog';
import BlogPostForm from '@/components/blog/BlogPostForm';

export default function EditBlogPostPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params.id as string;
  
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch the blog post
  useEffect(() => {
    const fetchPost = async () => {
      if (!postId) return;
      
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('admin_token');
        const response = await fetch(`/api/blog/admin/${postId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        
        if (data.success && data.data) {
          setPost(data.data);
        } else {
          setError('Blog post not found.');
        }
      } catch (err) {
        setError('Failed to load blog post. Please try again later.');
        console.error('Error fetching blog post:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [postId]);

  const handleSave = async (postData: BlogPostData) => {
    setSaving(true);
    
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/blog/admin/${postId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(postData),
      });

      const data: BlogAPIResponse<BlogPost> = await response.json();

      if (data.success) {
        // Redirect to the blog admin page
        router.push('/admin/blog');
      } else {
        throw new Error(data.error || 'Failed to update blog post');
      }
    } catch (error) {
      console.error('Error updating blog post:', error);
      throw error; // Re-throw to let the form handle the error
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    router.push('/admin/blog');
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center style={{ minHeight: '400px' }}>
          <Stack align="center" gap="md">
            <Loader size="lg" color="var(--theme-primary)" />
            <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
              Loading blog post...
            </Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (error || !post) {
    return (
      <Container size="xl" py="xl">
        <Stack gap="md">
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
          
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Post Not Found"
            color="red"
            variant="light"
          >
            {error || 'The blog post you are trying to edit could not be found.'}
          </Alert>
        </Stack>
      </Container>
    );
  }

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
              
              {post.status === 'published' && (
                <Button
                  variant="outline"
                  size="sm"
                  component="a"
                  href={`/blog/${post.slug}`}
                  target="_blank"
                  style={{
                    borderColor: 'var(--theme-primary)',
                    color: 'var(--theme-primary)',
                    backgroundColor: 'transparent'
                  }}
                >
                  View Post
                </Button>
              )}
            </Group>
            
            <Text
              size="xl"
              fw={700}
              style={{ color: 'var(--theme-text)' }}
            >
              Edit Blog Post
            </Text>
            
            <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
              Update your blog post content, settings, and publishing options.
            </Text>
          </Stack>
        </Group>

        {/* Blog Post Form */}
        <BlogPostForm
          post={post}
          onSave={handleSave}
          onCancel={handleCancel}
          isEditing={true}
          loading={saving}
        />
      </Stack>
    </Container>
  );
}