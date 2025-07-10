'use client';

import { useState, useEffect } from 'react';
import { Container, Title, Button, Card, Group, Text, Image, NumberInput, ActionIcon, Stack, Alert, Divider, Badge, Loader, Center, TextInput } from '@mantine/core';
import { IconTrash, IconShoppingCart, IconArrowLeft, IconTicket, IconCheck, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StoreThemeProvider } from '@/components/store/StoreThemeProvider';

interface CartItem {
  product_id: string | number;
  name: string;
  price: number;
  quantity: number;
  thumbnail_url: string;
}

interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  theme_name: string;
  currency: string;
}

export default function StoreCartPage() {
  const params = useParams();
  const storeSlug = params.storeSlug as string;
  
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [localStorageAvailable, setLocalStorageAvailable] = useState(false);
  
  // Coupon state
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
    description: string;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

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
    };

    if (storeSlug) {
      fetchStore();
    }
  }, [storeSlug]);

  // Refresh cart prices when store is loaded (run once)
  useEffect(() => {
    const refreshCartPrices = async () => {
      if (!store?.id || cartItems.length === 0) return;

      try {
        // Fetch current product data to get updated prices
        const productPromises = cartItems.map(async (item) => {
          try {
            const response = await fetch(`/api/stores/${store.id}/products/${item.product_id}`);
            if (response.ok) {
              const data = await response.json();
              if (data.success && data.data.product) {
                const product = data.data.product;
                const currentPrice = product.display_price || product.price || product.override_price || product.sale_price || product.base_price || item.price;
                return { ...item, price: currentPrice };
              }
            }
          } catch (error) {
            console.warn('Failed to refresh price for product:', item.product_id, error);
          }
          return item; // Return original item if price refresh fails
        });

        const updatedItems = await Promise.all(productPromises);
        
        // Check if any prices actually changed
        const pricesChanged = updatedItems.some((updated, index) => 
          updated.price !== cartItems[index].price
        );

        if (pricesChanged) {
          setCartItems(updatedItems);
          try {
            localStorage.setItem('cart', JSON.stringify(updatedItems));
            // Trigger cart update event for TopNav
            window.dispatchEvent(new CustomEvent('cartUpdated', { detail: updatedItems }));
          } catch (error) {
            console.error('Error saving updated cart:', error);
          }
          
          notifications.show({
            title: 'Prices Updated',
            message: 'Cart prices have been refreshed with current pricing.',
            color: 'blue'
          });
        }
      } catch (error) {
        console.error('Error refreshing cart prices:', error);
      }
    };

    // Only run if we have both store and cart items, and haven't refreshed yet
    if (store?.id && cartItems.length > 0) {
      refreshCartPrices();
    }
  }, [store?.id]); // Only depend on store.id to run once when store loads

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
              (typeof item.price === 'number' || typeof item.price === 'string') &&
              typeof item.quantity === 'number' &&
              typeof item.thumbnail_url === 'string'
            ).map(item => ({
              ...item,
              price: typeof item.price === 'string' ? parseFloat(item.price) : item.price
            }));
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

  const calculateSubtotal = () => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const discount = appliedCoupon?.discountAmount || 0;
    return Math.max(0, subtotal - discount);
  };

  // Coupon functions
  const validateCoupon = async () => {
    if (!couponCode.trim() || !store) return;
    
    setCouponLoading(true);
    try {
      const response = await fetch(`/api/store/${store.id}/coupons/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          couponCode: couponCode.trim(),
          cartItems,
          orderTotal: calculateSubtotal()
        })
      });

      const result = await response.json();
      
      if (result.success && result.data.valid) {
        setAppliedCoupon({
          code: couponCode.trim(),
          discountAmount: result.data.discountAmount,
          description: result.data.discount.description
        });
        setCouponCode('');
        notifications.show({
          title: 'Coupon Applied!',
          message: `You saved $${result.data.discountAmount.toFixed(2)}`,
          color: 'green',
          icon: <IconCheck size="1rem" />
        });
      } else {
        notifications.show({
          title: 'Invalid Coupon',
          message: result.data.error || 'This coupon code is not valid',
          color: 'red',
          icon: <IconX size="1rem" />
        });
      }
    } catch (error) {
      console.error('Error validating coupon:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to validate coupon. Please try again.',
        color: 'red',
        icon: <IconX size="1rem" />
      });
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    notifications.show({
      title: 'Coupon Removed',
      message: 'The coupon has been removed from your order',
      color: 'blue'
    });
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

  if (!store) {
    return (
      <Container size="lg" py="xl">
        <Center>
          <Stack align="center">
            <Loader size="lg" />
            <Text>Loading store...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  return (
    <StoreThemeProvider themeId={store.theme_name || 'default'}>
      <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
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
            href={`/store/${storeSlug}`}
            leftSection={<IconArrowLeft size={16} />}
            size="lg"
            variant="filled"
            style={{
              background: 'var(--theme-primary-gradient)',
              border: 'none',
              fontWeight: 600,
              transition: 'all 0.3s ease',
              color: 'var(--theme-text-on-primary)'
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
                        onClick={() => removeItem(String(item.product_id))}
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
                            onChange={(value) => updateQuantity(String(item.product_id), Number(value) || 1)}
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
              {/* Coupon Section */}
              <Stack gap="sm">
                <Text size="md" fw={500} style={{ color: 'var(--theme-text)' }}>
                  Have a coupon code?
                </Text>
                
                {!appliedCoupon ? (
                  <Group gap="sm">
                    <TextInput
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.currentTarget.value.toUpperCase())}
                      leftSection={<IconTicket size={16} />}
                      style={{ flex: 1 }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          validateCoupon();
                        }
                      }}
                    />
                    <Button
                      onClick={validateCoupon}
                      loading={couponLoading}
                      disabled={!couponCode.trim()}
                      size="sm"
                    >
                      Apply
                    </Button>
                  </Group>
                ) : (
                  <Alert
                    color="green"
                    variant="light"
                    icon={<IconCheck size={16} />}
                    withCloseButton
                    onClose={removeCoupon}
                  >
                    <Group justify="space-between">
                      <Stack gap={2}>
                        <Text size="sm" fw={500}>
                          Coupon &quot;{appliedCoupon.code}&quot; applied
                        </Text>
                        <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
                          {appliedCoupon.description}
                        </Text>
                      </Stack>
                      <Text size="sm" fw={600} style={{ color: 'green' }}>
                        -${appliedCoupon.discountAmount.toFixed(2)}
                      </Text>
                    </Group>
                  </Alert>
                )}
              </Stack>

              <Divider />

              {/* Order Summary */}
              <Stack gap="xs">
                <Group justify="space-between">
                  <Text size="md" style={{ color: 'var(--theme-text)' }}>Subtotal:</Text>
                  <Text size="md" style={{ color: 'var(--theme-text)' }}>
                    ${calculateSubtotal().toFixed(2)}
                  </Text>
                </Group>
                
                {appliedCoupon && (
                  <Group justify="space-between">
                    <Text size="md" style={{ color: 'green' }}>
                      Discount ({appliedCoupon.code}):
                    </Text>
                    <Text size="md" style={{ color: 'green' }}>
                      -${appliedCoupon.discountAmount.toFixed(2)}
                    </Text>
                  </Group>
                )}
                
                <Divider />
                
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
              </Stack>
              
              <Group justify="space-between" mt="md">
                <Button
                  component={Link}
                  href={`/store/${storeSlug}`}
                  variant="outline"
                  leftSection={<IconArrowLeft size={16} />}
                  style={{
                    borderColor: 'var(--theme-primary)',
                    color: 'var(--theme-primary)',
                    transition: 'all 0.3s ease'
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
                      transition: 'all 0.3s ease'
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
                    href={`/store/${storeSlug}/checkout`}
                    size="md"
                    disabled={cartItems.length === 0}
                    style={{
                      background: cartItems.length === 0 ? 'var(--theme-disabled)' : 'var(--theme-primary-gradient)',
                      border: 'none',
                      fontWeight: 600,
                      color: 'var(--theme-text-on-primary)',
                      transition: 'all 0.3s ease'
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
      </div>
    </StoreThemeProvider>
  );
}