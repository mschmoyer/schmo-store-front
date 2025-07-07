'use client';

import { useState, useEffect } from 'react';
import { 
  Stack, 
  Text, 
  Group, 
  Button, 
  Table, 
  Badge, 
  ActionIcon,
  Card,
  Grid,
  TextInput,
  Select,
  Pagination,
  Center,
  Loader,
  Alert,
  Modal,
  Container
} from '@mantine/core';
import { 
  IconPlus, 
  IconEdit, 
  IconTrash, 
  IconEye, 
  IconSearch,
  IconAlertCircle
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { BlogPost, BlogPostResponse, BlogAPIResponse, BlogStats } from '@/types/blog';
import { 
  formatDate, 
  getStatusColor, 
  getStatusLabel, 
  formatViewCount,
  truncateText
} from '@/lib/blogHelpers';
import { BlogEmptyState } from '@/components/blog/BlogEmptyState';

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });
  const [filters, setFilters] = useState({
    status: '',
    search: ''
  });
  const [stats, setStats] = useState<BlogStats | null>(null);
  const [selectedPost, setSelectedPost] = useState<BlogPost | null>(null);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);

  // Fetch blog posts
  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams();
        queryParams.set('page', pagination.page.toString());
        queryParams.set('limit', pagination.limit.toString());
        
        if (filters.status) queryParams.set('status', filters.status);
        if (filters.search) queryParams.set('search', filters.search);

        const token = localStorage.getItem('admin_token');
        if (!token) {
          setError('Authentication required. Please log in.');
          return;
        }

        const response = await fetch(`/api/blog/admin?${queryParams.toString()}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data: BlogAPIResponse<BlogPostResponse> = await response.json();

        if (data.success && data.data) {
          setPosts(data.data.posts);
          setPagination(prev => ({
            ...prev,
            page: data.data!.page,
            total: data.data!.total,
            totalPages: data.data!.totalPages
          }));
        } else {
          setError(data.error || 'Failed to fetch blog posts');
        }
      } catch (err) {
        setError('Failed to fetch blog posts. Please try again later.');
        console.error('Error fetching blog posts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPosts();
  }, [pagination.page, pagination.limit, filters]);

  // Fetch blog statistics
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        if (!token) {
          console.error('No admin token found for stats request');
          return;
        }

        const response = await fetch('/api/blog/stats', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data: BlogAPIResponse<BlogStats> = await response.json();
        
        if (data.success && data.data) {
          setStats(data.data);
        }
      } catch (error) {
        console.error('Error fetching blog stats:', error);
      }
    };

    fetchStats();
  }, []);

  const handleDeletePost = async () => {
    if (!selectedPost) return;

    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        notifications.show({
          title: 'Error',
          message: 'Authentication required. Please log in.',
          color: 'red',
          autoClose: 5000,
        });
        return;
      }

      const response = await fetch(`/api/blog/${selectedPost.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data: BlogAPIResponse<null> = await response.json();

      if (data.success) {
        notifications.show({
          title: 'Success!',
          message: 'Blog post deleted successfully',
          color: 'green',
          autoClose: 3000,
        });
        
        // Refresh the posts list
        setPosts(prev => prev.filter(post => post.id !== selectedPost.id));
        closeDeleteModal();
        setSelectedPost(null);
      } else {
        notifications.show({
          title: 'Error',
          message: data.error || 'Failed to delete blog post',
          color: 'red',
          autoClose: 5000,
        });
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Failed to delete blog post. Please try again.',
        color: 'red',
        autoClose: 5000,
      });
    }
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }));
  };

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Alert
          icon={<IconAlertCircle size={16} />}
          title="Error Loading Blog Administration"
          color="red"
          variant="light"
        >
          {error}
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Stack gap="xs">
            <Text
              size="xl"
              fw={700}
              style={{ color: 'var(--theme-text)' }}
            >
              Blog Administration
            </Text>
            <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
              Manage your blog posts, monitor performance, and create new content.
            </Text>
          </Stack>
          
          <Link href="/admin/blog/create" style={{ textDecoration: 'none' }}>
            <Button
              leftSection={<IconPlus size={16} />}
              style={{
                backgroundColor: 'var(--theme-primary)',
                color: 'var(--theme-text-on-primary)'
              }}
            >
              New Post
            </Button>
          </Link>
        </Group>

        {/* Statistics */}
        {stats && (
          <Grid>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card
                padding="lg"
                style={{
                  backgroundColor: 'var(--theme-card)',
                  borderColor: 'var(--theme-border)',
                  textAlign: 'center'
                }}
              >
                <Stack gap="xs">
                  <Text size="xl" fw={700} style={{ color: 'var(--theme-primary)' }}>
                    {stats.totalPosts}
                  </Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                    Total Posts
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card
                padding="lg"
                style={{
                  backgroundColor: 'var(--theme-card)',
                  borderColor: 'var(--theme-border)',
                  textAlign: 'center'
                }}
              >
                <Stack gap="xs">
                  <Text size="xl" fw={700} style={{ color: 'var(--theme-success)' }}>
                    {stats.publishedPosts}
                  </Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                    Published
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card
                padding="lg"
                style={{
                  backgroundColor: 'var(--theme-card)',
                  borderColor: 'var(--theme-border)',
                  textAlign: 'center'
                }}
              >
                <Stack gap="xs">
                  <Text size="xl" fw={700} style={{ color: 'var(--theme-warning)' }}>
                    {stats.draftPosts}
                  </Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                    Drafts
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card
                padding="lg"
                style={{
                  backgroundColor: 'var(--theme-card)',
                  borderColor: 'var(--theme-border)',
                  textAlign: 'center'
                }}
              >
                <Stack gap="xs">
                  <Text size="xl" fw={700} style={{ color: 'var(--theme-text)' }}>
                    {formatViewCount(stats.totalViews)}
                  </Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                    Total Views
                  </Text>
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        )}

        {/* Filters */}
        <Card
          padding="lg"
          style={{
            backgroundColor: 'var(--theme-card)',
            borderColor: 'var(--theme-border)'
          }}
        >
          <Group gap="md">
            <TextInput
              placeholder="Search posts..."
              leftSection={<IconSearch size={16} />}
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              style={{ flex: 1 }}
              styles={{
                input: {
                  backgroundColor: 'var(--theme-background-secondary)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                  '&::placeholder': { color: 'var(--theme-text-muted)' }
                }
              }}
            />
            
            <Select
              placeholder="Filter by status"
              data={[
                { value: '', label: 'All Posts' },
                { value: 'published', label: 'Published' },
                { value: 'draft', label: 'Draft' },
                { value: 'scheduled', label: 'Scheduled' }
              ]}
              value={filters.status}
              onChange={(value) => setFilters(prev => ({ ...prev, status: value || '' }))}
              styles={{
                input: {
                  backgroundColor: 'var(--theme-background-secondary)',
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)'
                }
              }}
            />
          </Group>
        </Card>

        {/* Posts Table */}
        <Card
          padding="lg"
          style={{
            backgroundColor: 'var(--theme-card)',
            borderColor: 'var(--theme-border)'
          }}
        >
          {loading ? (
            <Center py="xl">
              <Stack align="center" gap="md">
                <Loader size="md" color="var(--theme-primary)" />
                <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                  Loading blog posts...
                </Text>
              </Stack>
            </Center>
          ) : posts.length === 0 ? (
            // Show enhanced empty state only when no filters are applied
            filters.search || filters.status ? (
              <Center py="xl">
                <Stack align="center" gap="md">
                  <Text size="lg" fw={600} style={{ color: 'var(--theme-text)' }}>
                    No blog posts found
                  </Text>
                  <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                    Try adjusting your filters.
                  </Text>
                </Stack>
              </Center>
            ) : (
              <BlogEmptyState />
            )
          ) : (
            <Stack gap="md">
              <Table
                style={{
                  backgroundColor: 'var(--theme-background)',
                  color: 'var(--theme-text)'
                }}
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ color: 'var(--theme-text)' }}>Title</Table.Th>
                    <Table.Th style={{ color: 'var(--theme-text)' }}>Status</Table.Th>
                    <Table.Th style={{ color: 'var(--theme-text)' }}>Views</Table.Th>
                    <Table.Th style={{ color: 'var(--theme-text)' }}>Date</Table.Th>
                    <Table.Th style={{ color: 'var(--theme-text)' }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {posts.map((post) => (
                    <Table.Tr key={post.id}>
                      <Table.Td>
                        <Stack gap="xs">
                          <Text
                            size="sm"
                            fw={600}
                            style={{ color: 'var(--theme-text)' }}
                          >
                            {truncateText(post.title, 60)}
                          </Text>
                          {post.excerpt && (
                            <Text
                              size="xs"
                              style={{ color: 'var(--theme-text-muted)' }}
                            >
                              {truncateText(post.excerpt, 100)}
                            </Text>
                          )}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          variant="light"
                          color={getStatusColor(post.status)}
                          size="sm"
                        >
                          {getStatusLabel(post.status)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" style={{ color: 'var(--theme-text)' }}>
                          {formatViewCount(post.view_count || 0)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                          {formatDate(post.published_at || post.created_at)}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          {post.status === 'published' && (
                            <ActionIcon
                              variant="subtle"
                              size="sm"
                              component="a"
                              href={`/blog/${post.slug}`}
                              target="_blank"
                              style={{ color: 'var(--theme-primary)' }}
                            >
                              <IconEye size={14} />
                            </ActionIcon>
                          )}
                          
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            component={Link}
                            href={`/admin/blog/edit/${post.id}`}
                            style={{ color: 'var(--theme-warning)' }}
                          >
                            <IconEdit size={14} />
                          </ActionIcon>
                          
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            color="red"
                            onClick={() => {
                              setSelectedPost(post);
                              openDeleteModal();
                            }}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <Center>
                  <Pagination
                    total={pagination.totalPages}
                    value={pagination.page}
                    onChange={handlePageChange}
                    size="sm"
                  />
                </Center>
              )}
            </Stack>
          )}
        </Card>

        {/* Delete Confirmation Modal */}
        <Modal
          opened={deleteModalOpened}
          onClose={closeDeleteModal}
          title="Delete Blog Post"
          centered
        >
          <Stack gap="md">
            <Text size="sm" style={{ color: 'var(--theme-text)' }}>
              Are you sure you want to delete &quot;{selectedPost?.title}&quot;? This action cannot be undone.
            </Text>
            
            <Group justify="flex-end" gap="sm">
              <Button
                variant="outline"
                onClick={closeDeleteModal}
                style={{
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                  backgroundColor: 'transparent'
                }}
              >
                Cancel
              </Button>
              <Button
                color="red"
                onClick={handleDeletePost}
                leftSection={<IconTrash size={16} />}
              >
                Delete Post
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}