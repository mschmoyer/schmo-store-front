'use client';

import { 
  Stack, 
  TextInput, 
  Textarea, 
  Button, 
  Group, 
  Select, 
  MultiSelect, 
  Grid,
  Card,
  Text,
  Switch,
  Image,
  ActionIcon,
  Divider
} from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import { IconTrash, IconUpload } from '@tabler/icons-react';
import { useState, useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { BlogPostFormProps, BlogPostData } from '@/types/blog';
import { blogUtils } from '@/lib/blog';
import { validateBlogPost } from '@/lib/blogHelpers';
import BlogEditor from './BlogEditor';

export default function BlogPostForm({ 
  post, 
  onSave, 
  onCancel, 
  isEditing = false,
  loading = false
}: BlogPostFormProps) {
  const [formData, setFormData] = useState<BlogPostData>({
    title: '',
    slug: '',
    content: '',
    excerpt: '',
    featured_image: '',
    meta_title: '',
    meta_description: '',
    status: 'draft',
    published_at: '',
    og_title: '',
    og_description: '',
    og_image: '',
    twitter_title: '',
    twitter_description: '',
    twitter_image: '',
    tags: [],
    categories: [],
    scheduled_for: ''
  });

  const [autoSlug, setAutoSlug] = useState(true);
  const [showSeoFields, setShowSeoFields] = useState(false);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Initialize form with existing post data
  useEffect(() => {
    if (post) {
      setFormData({
        title: post.title || '',
        slug: post.slug || '',
        content: post.content || '',
        excerpt: post.excerpt || '',
        featured_image: post.featured_image || '',
        meta_title: post.meta_title || '',
        meta_description: post.meta_description || '',
        status: post.status || 'draft',
        published_at: post.published_at || '',
        og_title: post.og_title || '',
        og_description: post.og_description || '',
        og_image: post.og_image || '',
        twitter_title: post.twitter_title || '',
        twitter_description: post.twitter_description || '',
        twitter_image: post.twitter_image || '',
        tags: post.tags || [],
        categories: post.categories || [],
        scheduled_for: post.scheduled_for || ''
      });
      setAutoSlug(false);
    }
  }, [post]);

  // Load available categories and tags
  useEffect(() => {
    const loadData = async () => {
      try {
        // TODO: Get actual store ID from context or props
        const storeId = 'default-store';
        const categories = await blogUtils.getBlogCategories(storeId);
        const tags = await blogUtils.getBlogTags(storeId);
        setAvailableCategories(categories);
        setAvailableTags(tags);
      } catch (error) {
        console.error('Error loading blog metadata:', error);
      }
    };
    loadData();
  }, []);

  // Auto-generate slug from title
  useEffect(() => {
    if (autoSlug && formData.title) {
      const slug = blogUtils.generateSlug(formData.title);
      setFormData(prev => ({ ...prev, slug }));
    }
  }, [formData.title, autoSlug]);

  // Auto-generate excerpt from content
  useEffect(() => {
    if (formData.content && !formData.excerpt) {
      const excerpt = blogUtils.generateExcerpt(formData.content);
      setFormData(prev => ({ ...prev, excerpt }));
    }
  }, [formData.content, formData.excerpt]);

  const handleInputChange = (field: keyof BlogPostData, value: string | string[] | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation errors when user starts typing
    if (validationErrors.length > 0) {
      setValidationErrors([]);
    }
  };

  const handleSubmit = async () => {
    // Validate form data
    const validation = validateBlogPost(formData);
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      notifications.show({
        title: 'Validation Error',
        message: validation.errors.join(', '),
        color: 'red',
        autoClose: 5000,
      });
      return;
    }

    try {
      await onSave(formData);
      notifications.show({
        title: 'Success!',
        message: isEditing ? 'Blog post updated successfully' : 'Blog post created successfully',
        color: 'green',
        autoClose: 3000,
      });
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to save blog post. Please try again.',
        color: 'red',
        autoClose: 5000,
      });
    }
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // In a real implementation, you would upload the file to a server
      // For now, we'll just use a placeholder URL
      const imageUrl = URL.createObjectURL(file);
      setFormData(prev => ({ ...prev, featured_image: imageUrl }));
      notifications.show({
        title: 'Image Uploaded',
        message: 'Featured image has been set.',
        color: 'green',
        autoClose: 3000,
      });
    }
  };

  return (
    <Stack gap="xl">
      <Card padding="xl" style={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Text size="lg" fw={600} style={{ color: 'var(--theme-text)' }}>
              {isEditing ? 'Edit Blog Post' : 'Create New Blog Post'}
            </Text>
            <Group gap="sm">
              <Button
                variant="outline"
                onClick={onCancel}
                disabled={loading}
                style={{
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                  backgroundColor: 'transparent'
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                loading={loading}
                style={{
                  backgroundColor: 'var(--theme-primary)',
                  color: 'var(--theme-text-on-primary)'
                }}
              >
                {isEditing ? 'Update Post' : 'Create Post'}
              </Button>
            </Group>
          </Group>

          {/* Validation Errors */}
          {validationErrors.length > 0 && (
            <Card padding="md" style={{ backgroundColor: 'var(--theme-error)', borderColor: 'var(--theme-error)' }}>
              <Text size="sm" fw={600} style={{ color: 'var(--theme-text-on-primary)' }}>
                Please fix the following errors:
              </Text>
              <Stack gap="xs" mt="xs">
                {validationErrors.map((error, index) => (
                  <Text key={index} size="sm" style={{ color: 'var(--theme-text-on-primary)' }}>
                    • {error}
                  </Text>
                ))}
              </Stack>
            </Card>
          )}

          {/* Basic Information */}
          <Stack gap="md">
            <Text size="md" fw={600} style={{ color: 'var(--theme-text)' }}>
              Basic Information
            </Text>
            
            <TextInput
              label="Title"
              placeholder="Enter blog post title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              required
              styles={{
                input: {
                  backgroundColor: 'var(--theme-background-secondary)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                  '&::placeholder': { color: 'var(--theme-text-muted)' }
                },
                label: { color: 'var(--theme-text)' }
              }}
            />

            <Group align="end">
              <TextInput
                label="URL Slug"
                placeholder="url-friendly-slug"
                value={formData.slug}
                onChange={(e) => handleInputChange('slug', e.target.value)}
                required
                style={{ flex: 1 }}
                styles={{
                  input: {
                    backgroundColor: 'var(--theme-background-secondary)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                    '&::placeholder': { color: 'var(--theme-text-muted)' }
                  },
                  label: { color: 'var(--theme-text)' }
                }}
              />
              <Switch
                label="Auto-generate from title"
                checked={autoSlug}
                onChange={(e) => setAutoSlug(e.target.checked)}
                styles={{
                  label: { color: 'var(--theme-text)' }
                }}
              />
            </Group>

            <Textarea
              label="Excerpt (Optional)"
              placeholder="Brief summary of the blog post"
              value={formData.excerpt}
              onChange={(e) => handleInputChange('excerpt', e.target.value)}
              minRows={3}
              maxRows={5}
              styles={{
                input: {
                  backgroundColor: 'var(--theme-background-secondary)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                  '&::placeholder': { color: 'var(--theme-text-muted)' }
                },
                label: { color: 'var(--theme-text)' }
              }}
            />

            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <MultiSelect
                  label="Categories"
                  placeholder="Select or add categories"
                  data={availableCategories}
                  value={formData.categories}
                  onChange={(values) => handleInputChange('categories', values)}
                  searchable
                  creatable
                  getCreateLabel={(query) => `+ Create "${query}"`}
                  onCreate={(query) => {
                    const item = query;
                    setAvailableCategories(prev => [...prev, item]);
                    return item;
                  }}
                  styles={{
                    input: {
                      backgroundColor: 'var(--theme-background-secondary)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                      '&::placeholder': { color: 'var(--theme-text-muted)' }
                    },
                    label: { color: 'var(--theme-text)' }
                  }}
                />
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, md: 6 }}>
                <MultiSelect
                  label="Tags"
                  placeholder="Select or add tags"
                  data={availableTags}
                  value={formData.tags}
                  onChange={(values) => handleInputChange('tags', values)}
                  searchable
                  creatable
                  getCreateLabel={(query) => `+ Create "${query}"`}
                  onCreate={(query) => {
                    const item = query;
                    setAvailableTags(prev => [...prev, item]);
                    return item;
                  }}
                  styles={{
                    input: {
                      backgroundColor: 'var(--theme-background-secondary)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                      '&::placeholder': { color: 'var(--theme-text-muted)' }
                    },
                    label: { color: 'var(--theme-text)' }
                  }}
                />
              </Grid.Col>
            </Grid>
          </Stack>

          <Divider />

          {/* Featured Image */}
          <Stack gap="md">
            <Text size="md" fw={600} style={{ color: 'var(--theme-text)' }}>
              Featured Image
            </Text>
            
            <Group align="center">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
                id="featured-image-upload"
              />
              <Button
                variant="outline"
                leftSection={<IconUpload size={16} />}
                component="label"
                htmlFor="featured-image-upload"
                style={{
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                  backgroundColor: 'transparent'
                }}
              >
                Upload Image
              </Button>
              
              {formData.featured_image && (
                <Group gap="sm">
                  <Image
                    src={formData.featured_image}
                    alt="Featured image preview"
                    width={60}
                    height={40}
                    radius="md"
                    style={{ objectFit: 'cover' }}
                  />
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => handleInputChange('featured_image', '')}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              )}
            </Group>
          </Stack>

          <Divider />

          {/* Content Editor */}
          <Stack gap="md">
            <Text size="md" fw={600} style={{ color: 'var(--theme-text)' }}>
              Content
            </Text>
            
            <BlogEditor
              initialContent={formData.content}
              onChange={(content) => handleInputChange('content', content)}
              placeholder="Write your blog post content here..."
              height={400}
            />
          </Stack>

          <Divider />

          {/* Publishing Options */}
          <Stack gap="md">
            <Text size="md" fw={600} style={{ color: 'var(--theme-text)' }}>
              Publishing Options
            </Text>
            
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Select
                  label="Status"
                  data={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'published', label: 'Published' },
                    { value: 'scheduled', label: 'Scheduled' }
                  ]}
                  value={formData.status}
                  onChange={(value) => handleInputChange('status', value)}
                  styles={{
                    input: {
                      backgroundColor: 'var(--theme-background-secondary)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)'
                    },
                    label: { color: 'var(--theme-text)' }
                  }}
                />
              </Grid.Col>
              
              <Grid.Col span={{ base: 12, md: 6 }}>
                <DateTimePicker
                  label="Scheduled For (Optional)"
                  placeholder="Select date and time"
                  value={formData.scheduled_for ? new Date(formData.scheduled_for) : null}
                  onChange={(date) => handleInputChange('scheduled_for', date?.toISOString() || '')}
                  disabled={formData.status !== 'scheduled'}
                  styles={{
                    input: {
                      backgroundColor: 'var(--theme-background-secondary)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)'
                    },
                    label: { color: 'var(--theme-text)' }
                  }}
                />
              </Grid.Col>
            </Grid>
          </Stack>

          <Divider />

          {/* Advanced Options */}
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Text size="md" fw={600} style={{ color: 'var(--theme-text)' }}>
                SEO & Social Media
              </Text>
              <Switch
                label="Show advanced options"
                checked={showSeoFields}
                onChange={(e) => setShowSeoFields(e.target.checked)}
                styles={{
                  label: { color: 'var(--theme-text)' }
                }}
              />
            </Group>

            {showSeoFields && (
              <Stack gap="md">
                <TextInput
                  label="Meta Title"
                  placeholder="SEO title for search engines"
                  value={formData.meta_title}
                  onChange={(e) => handleInputChange('meta_title', e.target.value)}
                  styles={{
                    input: {
                      backgroundColor: 'var(--theme-background-secondary)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                      '&::placeholder': { color: 'var(--theme-text-muted)' }
                    },
                    label: { color: 'var(--theme-text)' }
                  }}
                />

                <Textarea
                  label="Meta Description"
                  placeholder="SEO description for search engines"
                  value={formData.meta_description}
                  onChange={(e) => handleInputChange('meta_description', e.target.value)}
                  minRows={3}
                  maxRows={5}
                  styles={{
                    input: {
                      backgroundColor: 'var(--theme-background-secondary)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                      '&::placeholder': { color: 'var(--theme-text-muted)' }
                    },
                    label: { color: 'var(--theme-text)' }
                  }}
                />

                <Grid>
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput
                      label="Open Graph Title"
                      placeholder="Facebook/LinkedIn share title"
                      value={formData.og_title}
                      onChange={(e) => handleInputChange('og_title', e.target.value)}
                      styles={{
                        input: {
                          backgroundColor: 'var(--theme-background-secondary)',
                          borderColor: 'var(--theme-border)',
                          color: 'var(--theme-text)',
                          '&::placeholder': { color: 'var(--theme-text-muted)' }
                        },
                        label: { color: 'var(--theme-text)' }
                      }}
                    />
                  </Grid.Col>
                  
                  <Grid.Col span={{ base: 12, md: 6 }}>
                    <TextInput
                      label="Twitter Title"
                      placeholder="Twitter share title"
                      value={formData.twitter_title}
                      onChange={(e) => handleInputChange('twitter_title', e.target.value)}
                      styles={{
                        input: {
                          backgroundColor: 'var(--theme-background-secondary)',
                          borderColor: 'var(--theme-border)',
                          color: 'var(--theme-text)',
                          '&::placeholder': { color: 'var(--theme-text-muted)' }
                        },
                        label: { color: 'var(--theme-text)' }
                      }}
                    />
                  </Grid.Col>
                </Grid>
              </Stack>
            )}
          </Stack>
        </Stack>
      </Card>
    </Stack>
  );
}