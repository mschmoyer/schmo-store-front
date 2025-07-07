'use client';

import { useState, useEffect } from 'react';
import { Container, Title, Text, Alert, Loader, Center, Card, Grid, Badge, Group, Button } from '@mantine/core';
import { IconBuilding, IconArrowRight } from '@tabler/icons-react';
import Link from 'next/link';

interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  store_description: string;
  is_active: boolean;
  is_public: boolean;
  meta_description: string;
}

export default function StoresDirectoryPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStores = async () => {
      try {
        const response = await fetch('/api/stores/public');
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setStores(data.data || []);
          } else {
            setError('Failed to load stores');
          }
        } else {
          setError('Failed to load stores');
        }
      } catch (err) {
        console.error('Error fetching stores:', err);
        setError('An error occurred while loading stores');
      } finally {
        setLoading(false);
      }
    };

    fetchStores();
  }, []);

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center>
          <Loader size="lg" />
          <Text ml="md">Loading stores...</Text>
        </Center>
      </Container>
    );
  }

  if (error) {
    return (
      <Container size="xl" py="xl">
        <Alert color="red" title="Error Loading Stores">
          <Text size="sm">{error}</Text>
        </Alert>
      </Container>
    );
  }

  return (
    <div>
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
              Discover Our Stores
            </Title>
            <Text size="xl" style={{ 
              fontSize: '1.25rem',
              lineHeight: 1.6,
              maxWidth: '600px',
              margin: '0 auto',
              color: 'var(--theme-text-secondary)'
            }}>
              Browse through our collection of amazing stores and find the perfect products for you.
            </Text>
          </div>
        </Container>
      </div>

      <Container size="xl" py="lg">
        {stores.length === 0 ? (
          <Alert color="blue" title="No Public Stores Available" mb="md">
            <Text size="sm">There are currently no public stores available. Check back later!</Text>
          </Alert>
        ) : (
          <>
            <div style={{ marginBottom: '2rem' }}>
              <Text size="lg" style={{ color: 'var(--theme-text-muted)' }}>
                {stores.length} {stores.length === 1 ? 'store' : 'stores'} available
              </Text>
            </div>

            <Grid>
              {stores.map((store) => (
                <Grid.Col key={store.id} span={{ base: 12, sm: 6, md: 4 }}>
                  <Card 
                    shadow="sm" 
                    padding="lg" 
                    radius="md" 
                    withBorder 
                    style={{ 
                      height: '100%', 
                      display: 'flex', 
                      flexDirection: 'column',
                      transition: 'all 0.3s ease',
                      cursor: 'pointer',
                      background: 'var(--theme-card)',
                      border: '1px solid var(--theme-border)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
                      e.currentTarget.style.borderColor = 'var(--theme-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = 'var(--theme-border)';
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      height: '100px',
                      background: 'var(--theme-background-secondary)',
                      borderRadius: '8px',
                      marginBottom: '1rem'
                    }}>
                      <IconBuilding size={48} color="var(--theme-primary)" />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <Title order={3} size="h4" mb="xs" style={{ color: 'var(--theme-text)' }}>
                        {store.store_name}
                      </Title>

                      <Text size="sm" c="dimmed" lineClamp={3} mb="md" style={{ flexGrow: 1 }}>
                        {store.store_description || store.meta_description || 'Discover amazing products in this store.'}
                      </Text>

                      <Group justify="space-between" align="center" mb="md">
                        <Badge 
                          color={store.is_active ? "green" : "gray"} 
                          variant="light"
                        >
                          {store.is_active ? "Active" : "Inactive"}
                        </Badge>
                        <Badge color="blue" variant="light">
                          Public Store
                        </Badge>
                      </Group>

                      <Button
                        component={Link}
                        href={`/store/${store.store_slug}`}
                        fullWidth
                        rightSection={<IconArrowRight size={16} />}
                        style={{
                          background: 'var(--theme-primary-gradient)',
                          border: 'none',
                          fontWeight: 600,
                          transition: 'all 0.3s ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        Browse Store
                      </Button>
                    </div>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
          </>
        )}
      </Container>
    </div>
  );
}