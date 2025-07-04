'use client';

import { useState, useEffect } from 'react';
import { Container, Title, Text, Card, Stack, Button, Group, Loader, Center, Alert, Badge, Grid } from '@mantine/core';
import { IconArrowLeft, IconBuilding, IconMapPin, IconPhone, IconMail } from '@tabler/icons-react';
import Link from 'next/link';

interface Warehouse {
  warehouse_id: string;
  name: string;
  origin_address?: {
    name?: string;
    company?: string;
    street1?: string;
    street2?: string;
    street3?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    phone?: string;
    residential?: boolean;
  };
  return_address?: {
    name?: string;
    company?: string;
    street1?: string;
    street2?: string;
    street3?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    phone?: string;
    residential?: boolean;
  };
  create_date?: string;
  is_default?: boolean;
}

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const response = await fetch('/api/warehouses');
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Warehouses data:', data);
        
        // Handle both array and object response formats
        const warehouseList = Array.isArray(data) ? data : data.warehouses || [];
        setWarehouses(warehouseList);
        
      } catch (error) {
        console.error('Error fetching warehouses:', error);
        setError(error instanceof Error ? error.message : 'Failed to load warehouses');
      } finally {
        setLoading(false);
      }
    };

    fetchWarehouses();
  }, []);

  const formatAddress = (address: Warehouse['origin_address']) => {
    if (!address) return 'No address provided';
    
    const parts = [];
    if (address.street1) parts.push(address.street1);
    if (address.street2) parts.push(address.street2);
    if (address.city && address.state) parts.push(`${address.city}, ${address.state}`);
    if (address.postal_code) parts.push(address.postal_code);
    if (address.country) parts.push(address.country);
    
    return parts.length > 0 ? parts.join(', ') : 'No address provided';
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center>
          <Stack align="center">
            <Loader size="lg" />
            <Text>Loading warehouses...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  return (
    <div>
      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #f7fdf7 0%, #ecfdf5 50%, #f0fdf4 100%)',
        borderBottom: '1px solid #d1fae5',
        padding: '3rem 0',
        marginBottom: '2rem'
      }}>
        <Container size="xl">
          <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <Title order={1} style={{ 
              fontSize: '3rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1rem',
              letterSpacing: '-0.5px'
            }}>
              Warehouses
            </Title>
            <Text size="xl" c="dimmed" style={{ 
              fontSize: '1.25rem',
              lineHeight: 1.6,
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              View all configured warehouses and their shipping addresses from ShipStation.
            </Text>
          </div>
        </Container>
      </div>

      <Container size="xl" py="lg">
        <Group justify="space-between" mb="xl">
          <Button
            variant="outline"
            leftSection={<IconArrowLeft size={16} />}
            component={Link}
            href="/store"
            style={{
              borderColor: '#22c55e',
              color: '#22c55e',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#22c55e';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#22c55e';
            }}
          >
            Back to Store
          </Button>
        </Group>

        {error ? (
          <Alert color="red" title="Unable to Load Warehouses" mb="md">
            <Text size="sm" mb="md">{error}</Text>
            <Text size="xs" c="dimmed">
              Please check your ShipStation API configuration or try again later.
            </Text>
          </Alert>
        ) : warehouses.length === 0 ? (
          <Alert color="blue" title="No Warehouses Found" mb="md">
            <Text size="sm">No warehouses found in your ShipStation account.</Text>
          </Alert>
        ) : (
          <div>
            <Group justify="space-between" align="center" mb="lg">
              <Text size="lg" c="dimmed">
                Found {warehouses.length} warehouse{warehouses.length !== 1 ? 's' : ''}
              </Text>
            </Group>

            <Grid>
              {warehouses.map((warehouse) => (
                <Grid.Col key={warehouse.warehouse_id} span={{ base: 12, md: 6 }}>
                  <Card 
                    shadow="sm" 
                    padding="lg" 
                    radius="md" 
                    withBorder 
                    style={{
                      height: '100%',
                      background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
                      border: '1px solid #e9ecef',
                      transition: 'all 0.3s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
                      e.currentTarget.style.borderColor = '#22c55e';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = '#e9ecef';
                    }}
                  >
                    <Stack gap="md">
                      {/* Header */}
                      <Group justify="space-between" align="flex-start">
                        <Group gap="sm">
                          <div style={{
                            padding: '8px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <IconBuilding size={24} color="#22c55e" />
                          </div>
                          <div>
                            <Text fw={600} size="lg">
                              {warehouse.name || 'Unnamed Warehouse'}
                            </Text>
                            <Text size="sm" c="dimmed">
                              ID: {warehouse.warehouse_id}
                            </Text>
                          </div>
                        </Group>
                        {warehouse.is_default && (
                          <Badge color="green" variant="light">
                            Default
                          </Badge>
                        )}
                      </Group>

                      {/* Origin Address */}
                      {warehouse.origin_address && (
                        <div>
                          <Group gap="sm" mb="xs">
                            <IconMapPin size={16} color="#6b7280" />
                            <Text fw={500} size="sm">Origin Address</Text>
                          </Group>
                          <Text size="sm" c="dimmed" style={{ marginLeft: '24px' }}>
                            {warehouse.origin_address.company && (
                              <>
                                <strong>{warehouse.origin_address.company}</strong>
                                <br />
                              </>
                            )}
                            {formatAddress(warehouse.origin_address)}
                          </Text>
                          {warehouse.origin_address.phone && (
                            <Group gap="xs" mt="xs" style={{ marginLeft: '24px' }}>
                              <IconPhone size={14} color="#6b7280" />
                              <Text size="xs" c="dimmed">
                                {warehouse.origin_address.phone}
                              </Text>
                            </Group>
                          )}
                        </div>
                      )}

                      {/* Return Address (if different) */}
                      {warehouse.return_address && 
                       JSON.stringify(warehouse.return_address) !== JSON.stringify(warehouse.origin_address) && (
                        <div>
                          <Group gap="sm" mb="xs">
                            <IconMail size={16} color="#6b7280" />
                            <Text fw={500} size="sm">Return Address</Text>
                          </Group>
                          <Text size="sm" c="dimmed" style={{ marginLeft: '24px' }}>
                            {warehouse.return_address.company && (
                              <>
                                <strong>{warehouse.return_address.company}</strong>
                                <br />
                              </>
                            )}
                            {formatAddress(warehouse.return_address)}
                          </Text>
                        </div>
                      )}

                      {/* Created Date */}
                      {warehouse.create_date && (
                        <Text size="xs" c="dimmed">
                          Created: {new Date(warehouse.create_date).toLocaleDateString()}
                        </Text>
                      )}
                    </Stack>
                  </Card>
                </Grid.Col>
              ))}
            </Grid>
          </div>
        )}

        {/* Quick Navigation */}
        <Group justify="center" mt="xl">
          <Button
            component={Link}
            href="/store"
            variant="outline"
            style={{
              borderColor: '#22c55e',
              color: '#22c55e',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#22c55e';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#22c55e';
            }}
          >
            Continue Shopping
          </Button>
          
          <Button
            component={Link}
            href="/account"
            style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
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
            Account Settings
          </Button>
        </Group>
      </Container>
    </div>
  );
}