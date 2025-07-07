'use client';

import { useEffect, useState } from 'react';
import { Container, Paper, Title, Text, Button, Group, ThemeIcon, Box, Stack, Divider } from '@mantine/core';
import { IconCheck, IconArrowRight, IconShoppingBag, IconTruck, IconReceipt } from '@tabler/icons-react';
import { useSearchParams, useParams } from 'next/navigation';
import Confetti from 'react-confetti';
import { useViewportSize } from '@mantine/hooks';
import Link from 'next/link';
import { StoreThemeProvider } from '@/components/store/StoreThemeProvider';

interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  theme_name: string;
  currency: string;
}

export default function OrderSuccess() {
  // const router = useRouter(); // Future use for navigation
  const params = useParams();
  const searchParams = useSearchParams();
  const { width, height } = useViewportSize();
  const [showConfetti, setShowConfetti] = useState(true);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  
  const storeSlug = params.storeSlug as string;
  const orderId = searchParams.get('orderId');
  const orderTotal = searchParams.get('orderTotal');
  const isLocalOrder = searchParams.get('isLocalOrder') === 'true';

  // Fetch store information
  useEffect(() => {
    const fetchStore = async () => {
      try {
        const response = await fetch(`/api/stores/public?slug=${storeSlug}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setStore(data.data);
          }
        }
      } catch (err) {
        console.error('Error fetching store:', err);
      }
      setLoading(false);
    };

    if (storeSlug) {
      fetchStore();
    }
  }, [storeSlug]);

  useEffect(() => {
    // Stop confetti after 5 seconds
    const timer = setTimeout(() => {
      setShowConfetti(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const formatPrice = (price: string | null) => {
    if (!price) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(parseFloat(price));
  };

  if (loading || !store) {
    return (
      <Container size="xl" py="xl">
        <Text style={{ color: 'var(--theme-text)' }}>Loading...</Text>
      </Container>
    );
  }

  return (
    <StoreThemeProvider themeId={store.theme_name || 'default'}>
      <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
        {showConfetti && (
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={200}
            gravity={0.3}
          />
        )}
        
        <Container size="md" py="xl">
          <Box pt={60} pb={40}>
            <Paper
              shadow="lg"
              radius="xl"
              p="xl"
              style={{
                backgroundColor: 'var(--theme-card)',
                borderColor: 'var(--theme-border)',
                border: '1px solid var(--theme-border)'
              }}
            >
              <Stack align="center" gap="lg">
                {/* Success Icon */}
                <ThemeIcon
                  size={80}
                  radius="xl"
                  style={{
                    background: 'var(--theme-primary-gradient)',
                    color: 'white'
                  }}
                >
                  <IconCheck size={48} />
                </ThemeIcon>

                {/* Success Message */}
                <Stack align="center" gap="xs">
                  <Title 
                    order={1} 
                    size="h2" 
                    ta="center"
                    style={{ 
                      color: 'var(--theme-text)',
                      fontWeight: 700
                    }}
                  >
                    Order Confirmed!
                  </Title>
                  <Text 
                    size="lg" 
                    ta="center" 
                    style={{ color: 'var(--theme-text-muted)' }}
                  >
                    Thank you for your purchase. Your order has been successfully placed.
                  </Text>
                </Stack>

                <Divider 
                  w="100%" 
                  style={{ borderColor: 'var(--theme-border)' }} 
                />

                {/* Order Details */}
                <Stack gap="md" w="100%" maw={400}>
                  <Group justify="space-between">
                    <Group gap="sm">
                      <IconReceipt size={20} style={{ color: 'var(--theme-primary)' }} />
                      <Text fw={500} style={{ color: 'var(--theme-text)' }}>
                        Order Number:
                      </Text>
                    </Group>
                    <Text fw={600} style={{ color: 'var(--theme-text)' }}>
                      {orderId}
                    </Text>
                  </Group>

                  <Group justify="space-between">
                    <Group gap="sm">
                      <IconShoppingBag size={20} style={{ color: 'var(--theme-primary)' }} />
                      <Text fw={500} style={{ color: 'var(--theme-text)' }}>
                        Order Total:
                      </Text>
                    </Group>
                    <Text 
                      fw={700} 
                      size="lg"
                      style={{
                        background: 'var(--theme-primary-gradient)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}
                    >
                      {formatPrice(orderTotal)}
                    </Text>
                  </Group>

                  {isLocalOrder && (
                    <Group justify="space-between">
                      <Group gap="sm">
                        <IconTruck size={20} style={{ color: 'var(--theme-primary)' }} />
                        <Text fw={500} style={{ color: 'var(--theme-text)' }}>
                          Status:
                        </Text>
                      </Group>
                      <Text fw={600} style={{ color: 'var(--theme-success)' }}>
                        Processing Locally
                      </Text>
                    </Group>
                  )}
                </Stack>

                <Divider 
                  w="100%" 
                  style={{ borderColor: 'var(--theme-border)' }} 
                />

                {/* Order Status Message */}
                <Box ta="center" maw={500}>
                  {isLocalOrder ? (
                    <Stack gap="sm">
                      <Text style={{ color: 'var(--theme-text)' }}>
                        Your order has been completed locally and is being processed. 
                        The merchant will prepare your items for shipment.
                      </Text>
                      <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                        You will receive shipping updates once your order is ready for dispatch.
                      </Text>
                    </Stack>
                  ) : (
                    <Text style={{ color: 'var(--theme-text)' }}>
                      Your order has been successfully submitted to our fulfillment system. 
                      You will receive a confirmation email with tracking information shortly.
                    </Text>
                  )}
                </Box>

                {/* Action Buttons */}
                <Group gap="md" mt="lg">
                  <Button
                    size="lg"
                    leftSection={<IconArrowRight size={20} />}
                    component={Link}
                    href={`/store/${storeSlug}`}
                    style={{
                      background: 'var(--theme-primary-gradient)',
                      border: 'none',
                      fontWeight: 600,
                      minWidth: 200
                    }}
                  >
                    Continue Shopping
                  </Button>
                </Group>

                {/* Additional Info */}
                <Text 
                  size="sm" 
                  ta="center" 
                  style={{ color: 'var(--theme-text-muted)' }}
                  mt="md"
                >
                  Need help with your order? Contact the store for assistance.
                </Text>
              </Stack>
            </Paper>
          </Box>
        </Container>
      </div>
    </StoreThemeProvider>
  );
}