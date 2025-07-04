'use client';

import { useState, useEffect } from 'react';
import { Container, Title, Button, Card, Group, Text, Image, NumberInput, ActionIcon, Stack, Alert, Divider, Badge, Loader, Center } from '@mantine/core';
import { IconTrash, IconShoppingCart, IconArrowLeft } from '@tabler/icons-react';
import Link from 'next/link';

interface CartItem {
  product_id: string | number;
  name: string;
  price: number;
  quantity: number;
  thumbnail_url: string;
}

export default function CartPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [localStorageAvailable, setLocalStorageAvailable] = useState(false);

  // Check if localStorage is available
  useEffect(() => {
    const checkLocalStorage = () => {
      if (typeof window !== 'undefined') {
        try {
          const testKey = 'localStorage-test';
          localStorage.setItem(testKey, 'test');
          localStorage.removeItem(testKey);
          console.log('Cart page: localStorage is available');
          setLocalStorageAvailable(true);
        } catch (error) {
          console.error('Cart page: localStorage is not available:', error);
          setLocalStorageAvailable(false);
        }
      } else {
        console.log('Cart page: window is undefined');
        setLocalStorageAvailable(false);
      }
    };

    checkLocalStorage();
  }, []);

  // Load cart data from localStorage
  useEffect(() => {
    const loadCartData = () => {
      console.log('Cart page: Loading cart data from localStorage');
      if (!localStorageAvailable) {
        console.log('Cart page: localStorage not available');
        setLoading(false);
        return;
      }

      try {
        const savedCart = localStorage.getItem('cart');
        console.log('Cart page: Raw cart data from localStorage:', savedCart);
        
        if (savedCart) {
          const parsedCart = JSON.parse(savedCart);
          console.log('Cart page: Parsed cart data:', parsedCart);
          
          // Validate cart structure
          if (Array.isArray(parsedCart)) {
            const validatedCart = parsedCart.filter(item => 
              item && 
              (typeof item.product_id === 'string' || typeof item.product_id === 'number') &&
              typeof item.name === 'string' &&
              typeof item.price === 'number' &&
              typeof item.quantity === 'number' &&
              typeof item.thumbnail_url === 'string'
            );
            console.log('Cart page: Validated cart items:', validatedCart);
            setCartItems(validatedCart);
          } else {
            console.log('Cart page: Parsed cart is not an array:', parsedCart);
          }
        } else {
          console.log('Cart page: No cart data found in localStorage');
        }
      } catch (error) {
        console.error('Cart page: Error loading cart from localStorage:', error);
      } finally {
        setLoading(false);
      }
    };

    loadCartData();

    // Only listen for storage events from other tabs, not cartUpdated events
    // (to avoid infinite loops when this page updates the cart)
    const handleStorageUpdate = (event: StorageEvent) => {
      if (event.key === 'cart') {
        console.log('Cart page: Storage update event received from another tab');
        loadCartData();
      }
    };

    window.addEventListener('storage', handleStorageUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
    };
  }, [localStorageAvailable]);

  // Don't automatically save cart when cartItems changes - only save when user makes changes
  // This prevents infinite loops and overwrites

  const saveCartToStorage = (newCartItems: CartItem[]) => {
    try {
      localStorage.setItem('cart', JSON.stringify(newCartItems));
      console.log('Cart page: Saved cart to localStorage:', newCartItems);
      // Trigger cart update event for TopNav
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: newCartItems }));
    } catch (error) {
      console.error('Cart page: Error saving cart to localStorage:', error);
    }
  };

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    
    const updatedItems = cartItems.map(item =>
      item.product_id === productId
        ? { ...item, quantity: newQuantity }
        : item
    );
    
    setCartItems(updatedItems);
    saveCartToStorage(updatedItems);
  };

  const removeItem = (productId: string) => {
    const updatedItems = cartItems.filter(item => item.product_id !== productId);
    setCartItems(updatedItems);
    saveCartToStorage(updatedItems);
  };

  const clearCart = () => {
    setCartItems([]);
    saveCartToStorage([]);
  };

  const calculateTotal = () => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const totalItems = cartItems.reduce((total, item) => total + item.quantity, 0);

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Center>
          <Stack align="center">
            <Loader size="lg" />
            <Text style={{ color: 'var(--theme-text-muted)' }}>Loading cart...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (!localStorageAvailable) {
    return (
      <Container size="lg" py="xl">
        <Alert color="red" title="Storage Not Available" style={{ backgroundColor: 'var(--theme-background-secondary)', borderColor: 'var(--theme-border)' }}>
          Your browser does not support localStorage, or it is disabled. Cart functionality will not work properly.
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Group justify="space-between" mb="xl">
        <Title order={1}>Shopping Cart</Title>
        <Badge size="lg" variant="filled">
          {totalItems} {totalItems === 1 ? 'item' : 'items'}
        </Badge>
      </Group>

      {cartItems.length === 0 ? (
        <Stack align="center" gap="lg">
          <IconShoppingCart size={80} stroke={1} style={{ color: 'var(--theme-text-muted)' }} />
          <Stack align="center" gap="sm">
            <Title order={2} style={{ color: 'var(--theme-text-muted)' }}>Your cart is empty</Title>
            <Text style={{ color: 'var(--theme-text-muted)' }} size="lg">
              Add some products to your cart to see them here.
            </Text>
          </Stack>
          <Button
            component={Link}
            href="/store"
            leftSection={<IconArrowLeft size={16} />}
            size="lg"
            variant="filled"
            style={{
              background: 'var(--theme-primary-gradient)',
              border: 'none',
              fontWeight: 600,
              transition: 'all 0.3s ease',
              color: 'var(--theme-text-on-primary)',
              ':hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
              }
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
            Continue Shopping
          </Button>
        </Stack>
      ) : (
        <Stack gap="lg">
          {/* Cart Items */}
          <Stack gap="md">
            {cartItems.map((item) => (
              <Card key={item.product_id} shadow="sm" padding="lg" radius="md" withBorder style={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
                <Group wrap="nowrap" align="flex-start">
                  <Image
                    src={item.thumbnail_url}
                    alt={item.name}
                    w={80}
                    h={80}
                    fit="cover"
                    radius="md"
                    fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' fill='%23f0f0f0'/%3E%3Ctext x='40' y='40' font-family='Arial' font-size='12' text-anchor='middle' dy='.3em' fill='%23999'%3ENo Image%3C/text%3E%3C/svg%3E"
                    style={{ flexShrink: 0 }}
                  />
                  
                  <Stack flex={1} gap="xs">
                    <Group justify="space-between" wrap="nowrap">
                      <Text fw={500} size="lg" lineClamp={2} style={{ color: 'var(--theme-text)' }}>
                        {item.name}
                      </Text>
                      <ActionIcon
                        variant="light"
                        color="red"
                        size="sm"
                        onClick={() => removeItem(item.product_id)}
                        aria-label="Remove item"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                    
                    <Group justify="space-between" align="flex-end">
                      <Stack gap="xs">
                        <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>
                          Price: ${item.price.toFixed(2)}
                        </Text>
                        <Group gap="xs" align="center">
                          <Text size="sm" style={{ color: 'var(--theme-text-muted)' }}>Quantity:</Text>
                          <NumberInput
                            value={item.quantity}
                            onChange={(value) => updateQuantity(item.product_id, Number(value) || 1)}
                            min={1}
                            max={99}
                            size="xs"
                            w={70}
                            styles={{ input: { textAlign: 'center' } }}
                          />
                        </Group>
                      </Stack>
                      
                      <Text fw={600} size="lg" style={{ color: 'var(--theme-text)' }}>
                        ${(item.price * item.quantity).toFixed(2)}
                      </Text>
                    </Group>
                  </Stack>
                </Group>
              </Card>
            ))}
          </Stack>

          <Divider />

          {/* Cart Summary */}
          <Card shadow="sm" padding="lg" radius="md" withBorder style={{ backgroundColor: 'var(--theme-card)', borderColor: 'var(--theme-border)' }}>
            <Stack gap="md">
              <Group justify="space-between" align="center">
                <Text size="xl" fw={600} style={{ color: 'var(--theme-text)' }}>Total:</Text>
                <Text size="xl" fw={700} style={{
                  background: 'var(--theme-primary-gradient)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  fontWeight: 800
                }}>
                  ${calculateTotal().toFixed(2)}
                </Text>
              </Group>
              
              <Group justify="space-between" mt="md">
                <Button
                  component={Link}
                  href="/store"
                  variant="outline"
                  leftSection={<IconArrowLeft size={16} />}
                  style={{
                    borderColor: 'var(--theme-primary)',
                    color: 'var(--theme-primary)',
                    transition: 'all 0.3s ease',
                    ':hover': {
                      backgroundColor: 'var(--theme-primary)',
                      color: 'var(--theme-text-on-primary)',
                      transform: 'translateY(-2px)'
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--theme-primary)';
                    e.currentTarget.style.color = 'var(--theme-text-on-primary)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--theme-primary)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Continue Shopping
                </Button>
                
                <Group gap="sm">
                  <Button
                    variant="subtle"
                    color="red"
                    onClick={clearCart}
                    style={{
                      transition: 'all 0.3s ease',
                      ':hover': {
                        transform: 'translateY(-2px)'
                      }
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    Clear Cart
                  </Button>
                  
                  <Button
                    component={Link}
                    href="/checkout"
                    size="md"
                    disabled={cartItems.length === 0}
                    style={{
                      background: cartItems.length === 0 ? 'var(--theme-disabled)' : 'var(--theme-primary-gradient)',
                      border: 'none',
                      fontWeight: 600,
                      color: 'var(--theme-text-on-primary)',
                      transition: 'all 0.3s ease',
                      ':hover': {
                        transform: 'translateY(-2px)',
                        boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
                      }
                    }}
                    onMouseEnter={(e) => {
                      if (cartItems.length > 0) {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.3)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (cartItems.length > 0) {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    Checkout
                  </Button>
                </Group>
              </Group>
            </Stack>
          </Card>
        </Stack>
      )}
    </Container>
  );
}