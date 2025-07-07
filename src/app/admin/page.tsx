'use client';

import React, { useEffect, useState } from 'react';
import { 
  Grid, 
  Card, 
  Text, 
  Title, 
  Group, 
  Stack, 
  Badge,
  ActionIcon,
  SimpleGrid,
  ThemeIcon,
  Loader,
  Alert,
  Progress,
  rem,
  Switch,
  Modal,
  Button,
  Table,
  Avatar
} from '@mantine/core';
import { 
  IconShoppingCart, 
  IconArticle, 
  IconPlug,
  IconEye,
  IconArrowRight,
  IconAlertCircle,
  IconCheck,
  IconX,
  IconUsers,
  IconTrendingUp,
  IconAlertTriangle,
  IconWorld,
  IconLock,
  IconExclamationMark,
  IconCurrencyDollar
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { AdminDashboardStats } from '@/lib/types/admin';
import { notifications } from '@mantine/notifications';

interface DashboardCardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  href?: string;
  progress?: number;
}

interface Product {
  name: string;
  base_price: number;
  stock_quantity: number;
  featured_image_url: string | null;
  sales_count?: number;
}

interface DashboardData {
  stats: AdminDashboardStats & {
    store: {
      name: string;
      isPublic: boolean;
      createdAt: string;
    };
    siteVisitors: number;
    lowStockCount: number;
    revenue: {
      totalRevenue: number;
      monthlyRevenue: number;
      totalOrders: number;
      monthlyOrders: number;
    };
  };
  recentActivity: unknown[];
  topProducts: Product[];
  lowStockProducts: Product[];
}

function DashboardCard({ title, value, subtitle, icon, color, href, progress }: DashboardCardProps) {
  const router = useRouter();
  
  return (
    <Card 
      shadow="sm" 
      padding="lg" 
      radius="md" 
      withBorder
      style={{ cursor: href ? 'pointer' : 'default' }}
      onClick={() => href && router.push(href)}
    >
      <Group justify="space-between" mb="xs">
        <Text size="sm" c="dimmed" fw={500}>
          {title}
        </Text>
        <ThemeIcon color={color} variant="light" size="lg">
          {icon}
        </ThemeIcon>
      </Group>
      
      <Group align="flex-end" gap="xs">
        <Text size="xl" fw={700}>
          {value}
        </Text>
        {subtitle && (
          <Text size="sm" c="dimmed">
            {subtitle}
          </Text>
        )}
      </Group>
      
      {progress !== undefined && (
        <Progress value={progress} mt="md" color={color} />
      )}
      
      {href && (
        <Group justify="space-between" mt="md">
          <Text size="sm" c="dimmed">
            View details
          </Text>
          <ActionIcon variant="subtle" color={color} size="sm">
            <IconArrowRight style={{ width: rem(12), height: rem(12) }} />
          </ActionIcon>
        </Group>
      )}
    </Card>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibilityModalOpen, setVisibilityModalOpen] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const router = useRouter();
  
  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        router.push('/admin/login');
        return;
      }
      
      const response = await fetch('/api/admin/dashboard', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error || 'Failed to load dashboard data');
        }
      } else {
        setError('Failed to load dashboard data');
      }
    } catch (err) {
      setError('An error occurred while loading dashboard data');
      console.error('Dashboard data error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVisibilityToggle = async () => {
    if (!data) return;
    
    setUpdatingVisibility(true);
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/store/visibility', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isPublic: !data.stats.store.isPublic
        })
      });
      
      const result = await response.json();
      if (result.success) {
        // Update local state
        setData(prev => prev ? {
          ...prev,
          stats: {
            ...prev.stats,
            store: {
              ...prev.stats.store,
              isPublic: result.data.isPublic
            }
          }
        } : null);
        
        notifications.show({
          title: 'Store Visibility Updated',
          message: result.data.message,
          color: 'green',
          icon: <IconCheck size="1rem" />
        });
      } else {
        notifications.show({
          title: 'Error',
          message: result.error || 'Failed to update store visibility',
          color: 'red',
          icon: <IconX size="1rem" />
        });
      }
    } catch {
      notifications.show({
        title: 'Error',
        message: 'An error occurred while updating store visibility',
        color: 'red',
        icon: <IconX size="1rem" />
      });
    } finally {
      setUpdatingVisibility(false);
      setVisibilityModalOpen(false);
    }
  };
  
  useEffect(() => {
    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <Loader size="lg" />
        <Text mt="md" c="dimmed">
          Loading dashboard...
        </Text>
      </div>
    );
  }
  
  if (error) {
    return (
      <Alert
        icon={<IconAlertCircle size="1rem" />}
        color="red"
        variant="light"
        mb="md"
      >
        {error}
      </Alert>
    );
  }
  
  if (!data) {
    return (
      <Alert
        icon={<IconAlertCircle size="1rem" />}
        color="yellow"
        variant="light"
        mb="md"
      >
        No dashboard data available
      </Alert>
    );
  }

  const { stats } = data;
  
  const productVisibilityProgress = stats.totalProducts > 0 
    ? (stats.visibleProducts / stats.totalProducts) * 100 
    : 0;
  
  const blogPublishedProgress = stats.totalBlogPosts > 0 
    ? (stats.publishedBlogPosts / stats.totalBlogPosts) * 100 
    : 0;
  
  return (
    <Stack gap="lg">
      <div>
        <Group justify="space-between" align="flex-start" mb="xs">
          <div>
            <Title order={1} mb="xs">
              RebelShop Dashboard
            </Title>
            <Text c="dimmed">
              Welcome to {stats.store.name}. Keep your margins high and ship efficiently with RebelShop.
            </Text>
          </div>
          
          {/* Store Visibility Toggle */}
          <Card shadow="sm" padding="md" radius="md" withBorder style={{ minWidth: '200px' }}>
            <Group justify="space-between">
              <Group gap="xs">
                <ThemeIcon 
                  color={stats.store.isPublic ? 'green' : 'orange'} 
                  variant="light" 
                  size="sm"
                >
                  {stats.store.isPublic ? <IconWorld size="1rem" /> : <IconLock size="1rem" />}
                </ThemeIcon>
                <div>
                  <Text size="sm" fw={500}>
                    {stats.store.isPublic ? 'Public Store' : 'Private Store'}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {stats.store.isPublic ? 'Visible to everyone' : 'Only admins can view'}
                  </Text>
                </div>
              </Group>
              <Switch
                checked={stats.store.isPublic}
                onChange={() => setVisibilityModalOpen(true)}
                color={stats.store.isPublic ? 'green' : 'orange'}
              />
            </Group>
          </Card>
        </Group>
      </div>
      
      {/* Visibility Confirmation Modal */}
      <Modal 
        opened={visibilityModalOpen} 
        onClose={() => setVisibilityModalOpen(false)}
        title="Change Store Visibility"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to make your store{' '}
            <Text span fw={600} c={stats.store.isPublic ? 'orange' : 'green'}>
              {stats.store.isPublic ? 'private' : 'public'}
            </Text>?
          </Text>
          
          {stats.store.isPublic ? (
            <Alert icon={<IconLock size="1rem" />} color="orange" variant="light">
              Making your store private will hide it from public view. Only you will be able to access it.
            </Alert>
          ) : (
            <Alert icon={<IconWorld size="1rem" />} color="green" variant="light">
              Making your store public will make it visible to everyone on the internet.
            </Alert>
          )}
          
          <Group justify="flex-end">
            <Button variant="outline" onClick={() => setVisibilityModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              color={stats.store.isPublic ? 'orange' : 'green'}
              loading={updatingVisibility}
              onClick={handleVisibilityToggle}
            >
              {stats.store.isPublic ? 'Make Private' : 'Make Public'}
            </Button>
          </Group>
        </Stack>
      </Modal>
      
      {/* Quick Stats Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 6 }} spacing="md">
        <DashboardCard
          title="Total Revenue"
          value={Math.round(stats.revenue.totalRevenue)}
          subtitle={`$${stats.revenue.totalRevenue.toLocaleString()}`}
          icon={<IconCurrencyDollar style={{ width: rem(20), height: rem(20) }} />}
          color="green"
        />
        
        <DashboardCard
          title="Monthly Revenue"
          value={Math.round(stats.revenue.monthlyRevenue)}
          subtitle={`$${stats.revenue.monthlyRevenue.toLocaleString()} this month`}
          icon={<IconTrendingUp style={{ width: rem(20), height: rem(20) }} />}
          color="blue"
        />
        
        <DashboardCard
          title="Site Visitors"
          value={stats.siteVisitors}
          subtitle="this month"
          icon={<IconUsers style={{ width: rem(20), height: rem(20) }} />}
          color="cyan"
        />
        
        <DashboardCard
          title="Total Products"
          value={stats.totalProducts}
          subtitle={`${stats.visibleProducts} visible`}
          icon={<IconShoppingCart style={{ width: rem(20), height: rem(20) }} />}
          color="purple"
          href="/admin/products"
          progress={productVisibilityProgress}
        />
        
        <DashboardCard
          title="Low Stock Alert"
          value={stats.lowStockCount}
          subtitle="products need restocking"
          icon={<IconAlertTriangle style={{ width: rem(20), height: rem(20) }} />}
          color={stats.lowStockCount > 0 ? "red" : "green"}
        />
        
        <DashboardCard
          title="Blog Posts"
          value={stats.totalBlogPosts}
          subtitle={`${stats.publishedBlogPosts} published`}
          icon={<IconArticle style={{ width: rem(20), height: rem(20) }} />}
          color="indigo"
          href="/admin/blog"
          progress={blogPublishedProgress}
        />
      </SimpleGrid>
      
      {/* Top Products and Low Stock Products */}
      <Grid>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Title order={3}>
                Top Products
              </Title>
              <ThemeIcon color="blue" variant="light" size="sm">
                <IconTrendingUp style={{ width: rem(16), height: rem(16) }} />
              </ThemeIcon>
            </Group>
            
            {data.topProducts.length > 0 ? (
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Product</Table.Th>
                    <Table.Th>Price</Table.Th>
                    <Table.Th># Sold</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.topProducts.map((product, index) => (
                    <Table.Tr key={index}>
                      <Table.Td>
                        <Group gap="sm">
                          <Avatar 
                            src={product.featured_image_url} 
                            size="sm" 
                            radius="sm"
                          >
                            <IconShoppingCart size="1rem" />
                          </Avatar>
                          <Text size="sm" fw={500}>
                            {product.name}
                          </Text>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">${Number(product.base_price).toFixed(2)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge 
                          color={(product.sales_count || 0) > 10 ? 'green' : (product.sales_count || 0) > 5 ? 'blue' : 'yellow'}
                          variant="light"
                        >
                          {product.sales_count || 0}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text c="dimmed" ta="center" py="xl">
                No products found
              </Text>
            )}
          </Card>
        </Grid.Col>
        
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="md">
              <Title order={3}>
                Low Stock Alert
              </Title>
              <ThemeIcon color={stats.lowStockCount > 0 ? "red" : "green"} variant="light" size="sm">
                <IconAlertTriangle style={{ width: rem(16), height: rem(16) }} />
              </ThemeIcon>
            </Group>
            
            {data.lowStockProducts.length > 0 ? (
              <>
                <Alert 
                  icon={<IconExclamationMark size="1rem" />} 
                  color="red" 
                  variant="light" 
                  mb="md"
                >
                  {data.lowStockProducts.length} product(s) are running low on stock!
                </Alert>
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Product</Table.Th>
                      <Table.Th>Price</Table.Th>
                      <Table.Th>Stock</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.lowStockProducts.map((product, index) => (
                      <Table.Tr key={index}>
                        <Table.Td>
                          <Group gap="sm">
                            <Avatar 
                              src={product.featured_image_url} 
                              size="sm" 
                              radius="sm"
                            >
                              <IconShoppingCart size="1rem" />
                            </Avatar>
                            <Text size="sm" fw={500}>
                              {product.name}
                            </Text>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">${Number(product.base_price).toFixed(2)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge 
                            color={product.stock_quantity > 0 ? 'red' : 'dark'}
                            variant="light"
                          >
                            {product.stock_quantity === 0 ? 'Out of Stock' : product.stock_quantity}
                          </Badge>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </>
            ) : (
              <Alert icon={<IconCheck size="1rem" />} color="green" variant="light">
                All products are well stocked!
              </Alert>
            )}
          </Card>
        </Grid.Col>
      </Grid>
      
      {/* Integration Status */}
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Title order={3} mb="md">
          Integration Status
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <Group justify="space-between" p="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: '8px' }}>
            <Group>
              <ThemeIcon color="teal" variant="light" size="lg">
                <IconPlug style={{ width: rem(20), height: rem(20) }} />
              </ThemeIcon>
              <div>
                <Text fw={500}>ShipStation</Text>
                <Text size="sm" c="dimmed">
                  Product & Inventory Management
                </Text>
              </div>
            </Group>
            <Badge 
              color={stats.integrations.shipengine ? 'green' : 'red'} 
              variant="light"
              leftSection={
                stats.integrations.shipengine 
                  ? <IconCheck style={{ width: rem(12), height: rem(12) }} />
                  : <IconX style={{ width: rem(12), height: rem(12) }} />
              }
            >
              {stats.integrations.shipengine ? 'Active' : 'Inactive'}
            </Badge>
          </Group>
          
          <Group justify="space-between" p="md" style={{ backgroundColor: 'var(--mantine-color-gray-0)', borderRadius: '8px' }}>
            <Group>
              <ThemeIcon color="blue" variant="light" size="lg">
                <IconPlug style={{ width: rem(20), height: rem(20) }} />
              </ThemeIcon>
              <div>
                <Text fw={500}>Stripe</Text>
                <Text size="sm" c="dimmed">
                  Payment Processing
                </Text>
              </div>
            </Group>
            <Badge 
              color={stats.integrations.stripe ? 'green' : 'red'} 
              variant="light"
              leftSection={
                stats.integrations.stripe 
                  ? <IconCheck style={{ width: rem(12), height: rem(12) }} />
                  : <IconX style={{ width: rem(12), height: rem(12) }} />
              }
            >
              {stats.integrations.stripe ? 'Active' : 'Inactive'}
            </Badge>
          </Group>
        </SimpleGrid>
      </Card>
      
      {/* Quick Actions */}
      <Grid>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={3} mb="md">
              Quick Actions
            </Title>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <Group
                p="md"
                style={{ 
                  backgroundColor: 'var(--mantine-color-blue-0)', 
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => router.push('/admin/products')}
              >
                <ThemeIcon color="blue" variant="light" size="lg">
                  <IconShoppingCart style={{ width: rem(20), height: rem(20) }} />
                </ThemeIcon>
                <div>
                  <Text fw={500}>Manage Products</Text>
                  <Text size="sm" c="dimmed">
                    Edit descriptions and set discounts
                  </Text>
                </div>
              </Group>
              
              <Group
                p="md"
                style={{ 
                  backgroundColor: 'var(--mantine-color-green-0)', 
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => router.push('/admin/blog/create')}
              >
                <ThemeIcon color="green" variant="light" size="lg">
                  <IconArticle style={{ width: rem(20), height: rem(20) }} />
                </ThemeIcon>
                <div>
                  <Text fw={500}>Write Blog Post</Text>
                  <Text size="sm" c="dimmed">
                    Create new content for your store
                  </Text>
                </div>
              </Group>
              
              <Group
                p="md"
                style={{ 
                  backgroundColor: 'var(--mantine-color-purple-0)', 
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => router.push('/admin/design')}
              >
                <ThemeIcon color="purple" variant="light" size="lg">
                  <IconEye style={{ width: rem(20), height: rem(20) }} />
                </ThemeIcon>
                <div>
                  <Text fw={500}>Customize Design</Text>
                  <Text size="sm" c="dimmed">
                    Change theme and store appearance
                  </Text>
                </div>
              </Group>
              
              <Group
                p="md"
                style={{ 
                  backgroundColor: 'var(--mantine-color-teal-0)', 
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => router.push('/admin/integrations')}
              >
                <ThemeIcon color="teal" variant="light" size="lg">
                  <IconPlug style={{ width: rem(20), height: rem(20) }} />
                </ThemeIcon>
                <div>
                  <Text fw={500}>Setup Integrations</Text>
                  <Text size="sm" c="dimmed">
                    Connect ShipStation and Stripe
                  </Text>
                </div>
              </Group>
            </SimpleGrid>
          </Card>
        </Grid.Col>
        
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={3} mb="md">
              Getting Started
            </Title>
            <Stack gap="md">
              <Group>
                <ThemeIcon 
                  color={stats.integrations.shipengine ? 'green' : 'gray'} 
                  variant="light" 
                  size="sm"
                >
                  {stats.integrations.shipengine 
                    ? <IconCheck style={{ width: rem(12), height: rem(12) }} />
                    : <IconX style={{ width: rem(12), height: rem(12) }} />
                  }
                </ThemeIcon>
                <Text size="sm">
                  Setup ShipStation Integration
                </Text>
              </Group>
              
              <Group>
                <ThemeIcon 
                  color={stats.integrations.stripe ? 'green' : 'gray'} 
                  variant="light" 
                  size="sm"
                >
                  {stats.integrations.stripe 
                    ? <IconCheck style={{ width: rem(12), height: rem(12) }} />
                    : <IconX style={{ width: rem(12), height: rem(12) }} />
                  }
                </ThemeIcon>
                <Text size="sm">
                  Setup Stripe Payments
                </Text>
              </Group>
              
              <Group>
                <ThemeIcon 
                  color={stats.totalProducts > 0 ? 'green' : 'gray'} 
                  variant="light" 
                  size="sm"
                >
                  {stats.totalProducts > 0 
                    ? <IconCheck style={{ width: rem(12), height: rem(12) }} />
                    : <IconX style={{ width: rem(12), height: rem(12) }} />
                  }
                </ThemeIcon>
                <Text size="sm">
                  Add Products to Store
                </Text>
              </Group>
              
              <Group>
                <ThemeIcon 
                  color={stats.publishedBlogPosts > 0 ? 'green' : 'gray'} 
                  variant="light" 
                  size="sm"
                >
                  {stats.publishedBlogPosts > 0 
                    ? <IconCheck style={{ width: rem(12), height: rem(12) }} />
                    : <IconX style={{ width: rem(12), height: rem(12) }} />
                  }
                </ThemeIcon>
                <Text size="sm">
                  Publish First Blog Post
                </Text>
              </Group>
              
              <Group>
                <ThemeIcon 
                  color={stats.store.isPublic ? 'green' : 'orange'} 
                  variant="light" 
                  size="sm"
                >
                  {stats.store.isPublic 
                    ? <IconWorld style={{ width: rem(12), height: rem(12) }} />
                    : <IconLock style={{ width: rem(12), height: rem(12) }} />
                  }
                </ThemeIcon>
                <Text size="sm">
                  {stats.store.isPublic ? 'Store is Public' : 'Make Store Public'}
                </Text>
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}