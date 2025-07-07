'use client';

import { useState, useEffect } from 'react';
import { Container, Title, Grid, Card, Group, Text, Image, Button, Stack, Alert, Divider, TextInput, Select, Radio, Badge, Center, Loader, GridCol, Box } from '@mantine/core';
import { IconArrowLeft, IconCheck, IconTruck, IconClock, IconShoppingCart } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useParams } from 'next/navigation';
import { StoreThemeProvider } from '@/components/store/StoreThemeProvider';

interface CartItem {
  product_id: string | number;
  name: string;
  price: number;
  quantity: number;
  thumbnail_url: string;
}

interface ShippingOption {
  id: string;
  name: string;
  description: string;
  price: number;
  estimatedDays: string;
  icon: React.ReactNode;
}

interface CustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  theme_name: string;
  currency: string;
}

const shippingOptions: ShippingOption[] = [
  {
    id: 'standard',
    name: 'Standard Shipping',
    description: 'Free shipping on orders over $50',
    price: 0,
    estimatedDays: '5-7 business days',
    icon: <IconTruck size={20} />
  },
  {
    id: 'expedited',
    name: 'Expedited Shipping',
    description: 'Faster delivery',
    price: 9.99,
    estimatedDays: '2-3 business days',
    icon: <IconClock size={20} />
  },
  {
    id: 'overnight',
    name: 'Overnight Shipping',
    description: 'Next business day delivery',
    price: 24.99,
    estimatedDays: '1 business day',
    icon: <IconCheck size={20} />
  }
];

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams();
  const storeSlug = params.storeSlug as string;
  
  const [store, setStore] = useState<Store | null>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShipping, setSelectedShipping] = useState('standard');
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

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

  // Load cart data from localStorage
  useEffect(() => {
    const loadCartData = () => {
      if (typeof window !== 'undefined') {
        try {
          const savedCart = localStorage.getItem('cart');
          if (savedCart) {
            const parsedCart = JSON.parse(savedCart);
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
              setCartItems(validatedCart);
            }
          }
        } catch (error) {
          console.error('Error loading cart from localStorage:', error);
        }
      }
      setLoading(false);
    };

    loadCartData();
  }, []);

  const calculateSubtotal = () => {
    return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const getShippingCost = () => {
    const subtotal = calculateSubtotal();
    const selectedOption = shippingOptions.find(option => option.id === selectedShipping);
    
    // Free standard shipping on orders over $50
    if (selectedShipping === 'standard' && subtotal >= 50) {
      return 0;
    }
    
    return selectedOption?.price || 0;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + getShippingCost();
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!customerInfo.firstName.trim()) errors.firstName = 'First name is required';
    if (!customerInfo.lastName.trim()) errors.lastName = 'Last name is required';
    if (!customerInfo.email.trim()) errors.email = 'Email is required';
    if (!customerInfo.email.includes('@') && customerInfo.email.trim()) errors.email = 'Please enter a valid email';
    if (!customerInfo.phone.trim()) errors.phone = 'Phone number is required';
    if (!customerInfo.address.trim()) errors.address = 'Address is required';
    if (!customerInfo.city.trim()) errors.city = 'City is required';
    if (!customerInfo.state.trim()) errors.state = 'State is required';
    if (!customerInfo.zipCode.trim()) errors.zipCode = 'ZIP code is required';

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field: keyof CustomerInfo, value: string) => {
    setCustomerInfo(prev => ({ ...prev, [field]: value }));
    
    // Clear error for this field when user starts typing
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handlePlaceOrder = async () => {
    if (!validateForm()) {
      notifications.show({
        title: 'Form Validation Error',
        message: 'Please fill out all required fields correctly.',
        color: 'red',
      });
      return;
    }

    setIsPlacingOrder(true);

    try {
      // Prepare order data for API
      const orderData = {
        items: cartItems,
        shippingAddress: customerInfo,
        shippingMethod: selectedShipping,
        subtotal: calculateSubtotal(),
        shippingCost: getShippingCost(),
        total: calculateTotal(),
        storeId: store?.id
      };

      console.log('Submitting order:', orderData);

      // Call order creation API
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const orderResult = await response.json();
      console.log('Order result:', orderResult);

      if (orderResult.success) {
        // Clear cart from localStorage
        localStorage.removeItem('cart');
        
        // Trigger cart update event
        window.dispatchEvent(new CustomEvent('cartUpdated', { detail: [] }));
        
        // Check if this order should redirect to success page
        if (orderResult.redirectToSuccess || orderResult.isLocalOrder) {
          // Redirect to success page with order details
          const successUrl = `/store/${storeSlug}/order-success?orderId=${orderResult.orderId}&orderTotal=${orderResult.orderTotal}&isLocalOrder=${!!orderResult.isLocalOrder}`;
          router.push(successUrl);
          return;
        }
        
        // Show success notification with order details (for ShipEngine orders)
        const successMessage = orderResult.isMockOrder 
          ? `Thank you ${customerInfo.firstName}! Your order ${orderResult.orderId} has been placed. This is a demo order (ShipEngine not configured).`
          : `Thank you ${customerInfo.firstName}! Your order ${orderResult.orderId} has been created in ShipEngine. ${orderResult.trackingNumber ? `Tracking: ${orderResult.trackingNumber}` : ''}`;

        notifications.show({
          title: 'Order Placed Successfully!',
          message: successMessage,
          color: 'green',
          icon: <IconCheck size="1rem" />,
          autoClose: 7000,
        });

        // Redirect to store after a short delay
        setTimeout(() => {
          router.push(`/store/${storeSlug}`);
        }, 3000);
      } else {
        throw new Error(orderResult.message || 'Failed to create order');
      }
    } catch (error) {
      console.error('Error placing order:', error);
      
      notifications.show({
        title: 'Order Failed',
        message: error instanceof Error ? error.message : 'Failed to place order. Please try again.',
        color: 'red',
        autoClose: 5000,
      });
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(price);
  };

  if (loading || !store) {
    return (
      <Container size="xl" py="xl">
        <Center>
          <Stack align="center">
            <Loader size="lg" />
            <Text style={{ color: 'var(--theme-text)' }}>Loading checkout...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (cartItems.length === 0) {
    return (
      <StoreThemeProvider themeId={store.theme_name || 'default'}>
        <div style={{ minHeight: '100vh', background: 'var(--theme-background)' }}>
          <Container size="xl" py="xl">
        <Stack align="center" gap="lg">
          <Alert color="blue" title="Your cart is empty">
            <Text size="sm" mb="md" style={{ color: 'var(--theme-text)' }}>You need items in your cart to proceed with checkout.</Text>
          </Alert>
          <Button
            component={Link}
            href={`/store/${storeSlug}`}
            leftSection={<IconArrowLeft size={16} />}
            style={{
              background: 'var(--theme-primary-gradient)',
              border: 'none',
              fontWeight: 600,
            }}
          >
            Continue Shopping
          </Button>
          </Stack>
          </Container>
        </div>
      </StoreThemeProvider>
    );
  }

  return (
    <StoreThemeProvider themeId={store.theme_name || 'default'}>
      <div style={{ minHeight: '100vh', background: 'var(--theme-background)', paddingBottom: '120px' }}>
        <Container size="xl" py="xl">
          <Title order={1} mb="xl" style={{ color: 'var(--theme-text)' }}>
            Secure Checkout
          </Title>

          <Grid gutter="xl">
            {/* Left Column - Customer Information */}
            <GridCol span={{ base: 12, lg: 8 }}>
              <Stack gap="lg">
                {/* Customer Information */}
                <Card shadow="sm" padding="lg" radius="md" withBorder style={{ 
                  backgroundColor: 'var(--theme-card)', 
                  borderColor: 'var(--theme-border)' 
                }}>
                  <Title order={3} mb="md" style={{ color: 'var(--theme-text)' }}>
                    Customer Information
                  </Title>
                  
                  <Stack gap="md">
                    {/* Personal Information */}
                    <div>
                      <Text fw={500} mb="sm" style={{ color: 'var(--theme-text)' }}>
                        Personal Information
                      </Text>
                      <Grid>
                        <GridCol span={6}>
                          <TextInput
                            label="First Name"
                            placeholder="Enter your first name"
                            value={customerInfo.firstName}
                            onChange={(e) => handleInputChange('firstName', e.target.value)}
                            error={formErrors.firstName}
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
                        </GridCol>
                        <GridCol span={6}>
                          <TextInput
                            label="Last Name"
                            placeholder="Enter your last name"
                            value={customerInfo.lastName}
                            onChange={(e) => handleInputChange('lastName', e.target.value)}
                            error={formErrors.lastName}
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
                        </GridCol>
                      </Grid>
                      
                      <Grid mt="sm">
                        <GridCol span={6}>
                          <TextInput
                            label="Email"
                            placeholder="Enter your email"
                            type="email"
                            value={customerInfo.email}
                            onChange={(e) => handleInputChange('email', e.target.value)}
                            error={formErrors.email}
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
                        </GridCol>
                        <GridCol span={6}>
                          <TextInput
                            label="Phone"
                            placeholder="Enter your phone number"
                            value={customerInfo.phone}
                            onChange={(e) => handleInputChange('phone', e.target.value)}
                            error={formErrors.phone}
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
                        </GridCol>
                      </Grid>
                    </div>

                    <Divider />

                    {/* Shipping Address */}
                    <div>
                      <Text fw={500} mb="sm" style={{ color: 'var(--theme-text)' }}>
                        Shipping Address
                      </Text>
                      <TextInput
                        label="Address"
                        placeholder="Enter your street address"
                        value={customerInfo.address}
                        onChange={(e) => handleInputChange('address', e.target.value)}
                        error={formErrors.address}
                        required
                        mb="sm"
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
                        <GridCol span={4}>
                          <TextInput
                            label="City"
                            placeholder="City"
                            value={customerInfo.city}
                            onChange={(e) => handleInputChange('city', e.target.value)}
                            error={formErrors.city}
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
                        </GridCol>
                        <GridCol span={4}>
                          <Select
                            label="State"
                            placeholder="State"
                            value={customerInfo.state}
                            onChange={(value) => handleInputChange('state', value || '')}
                            error={formErrors.state}
                            required
                            data={[
                              'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
                              'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
                              'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
                              'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
                              'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
                            ]}
                            styles={{
                              input: {
                                backgroundColor: 'var(--theme-background-secondary)',
                                borderColor: 'var(--theme-border)',
                                color: 'var(--theme-text)'
                              },
                              label: { color: 'var(--theme-text)' }
                            }}
                          />
                        </GridCol>
                        <GridCol span={4}>
                          <TextInput
                            label="ZIP Code"
                            placeholder="ZIP"
                            value={customerInfo.zipCode}
                            onChange={(e) => handleInputChange('zipCode', e.target.value)}
                            error={formErrors.zipCode}
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
                        </GridCol>
                      </Grid>
                    </div>
                  </Stack>
                </Card>

                {/* Shipping Options */}
                <Card shadow="sm" padding="lg" radius="md" withBorder style={{ 
                  backgroundColor: 'var(--theme-card)', 
                  borderColor: 'var(--theme-border)' 
                }}>
                  <Title order={4} mb="md" style={{ color: 'var(--theme-text)' }}>
                    Shipping Options
                  </Title>
                  <Radio.Group
                    value={selectedShipping}
                    onChange={setSelectedShipping}
                  >
                    <Stack gap="sm">
                      {shippingOptions.map((option) => (
                        <Card 
                          key={option.id} 
                          padding="sm" 
                          withBorder 
                          style={{ 
                            cursor: 'pointer',
                            borderColor: selectedShipping === option.id ? 'var(--theme-primary)' : 'var(--theme-border)',
                            backgroundColor: selectedShipping === option.id ? 'var(--theme-card-hover)' : 'var(--theme-card)',
                            transition: 'all 0.2s ease'
                          }}
                          onClick={() => setSelectedShipping(option.id)}
                        >
                          <Radio
                            value={option.id}
                            label={
                              <Group justify="space-between" style={{ width: '100%' }}>
                                <Group gap="sm">
                                  <Box style={{ color: 'var(--theme-primary)' }}>
                                    {option.icon}
                                  </Box>
                                  <div>
                                    <Text fw={500} size="sm" style={{ color: 'var(--theme-text)' }}>
                                      {option.name}
                                    </Text>
                                    <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
                                      {option.description}
                                    </Text>
                                    <Badge 
                                      variant="light" 
                                      size="xs" 
                                      style={{ 
                                        backgroundColor: 'var(--theme-primary-light)',
                                        color: 'var(--theme-primary)'
                                      }}
                                    >
                                      {option.estimatedDays}
                                    </Badge>
                                  </div>
                                </Group>
                                <Text fw={600} style={{ color: 'var(--theme-text)' }}>
                                  {option.price === 0 && calculateSubtotal() >= 50 ? 'FREE' : formatPrice(option.price)}
                                </Text>
                              </Group>
                            }
                            styles={{
                              label: { color: 'var(--theme-text)' },
                              radio: { 
                                '&:checked': { 
                                  backgroundColor: 'var(--theme-primary)',
                                  borderColor: 'var(--theme-primary)'
                                }
                              }
                            }}
                          />
                        </Card>
                      ))}
                    </Stack>
                  </Radio.Group>
                </Card>
              </Stack>
            </GridCol>

            {/* Right Column - Order Summary (Sticky) */}
            <GridCol span={{ base: 12, lg: 4 }}>
              <Box style={{ position: 'sticky', top: '20px' }}>
                <Card shadow="sm" padding="lg" radius="md" withBorder style={{ 
                  backgroundColor: 'var(--theme-card)', 
                  borderColor: 'var(--theme-border)' 
                }}>
                  <Group gap="sm" mb="md">
                    <IconShoppingCart size={20} style={{ color: 'var(--theme-primary)' }} />
                    <Title order={3} style={{ color: 'var(--theme-text)' }}>Order Summary</Title>
                  </Group>
                  
                  <Stack gap="md">
                    {cartItems.map((item) => (
                      <Group key={item.product_id} wrap="nowrap" align="flex-start">
                        <Image
                          src={item.thumbnail_url}
                          alt={item.name}
                          w={50}
                          h={50}
                          fit="cover"
                          radius="md"
                          style={{ flexShrink: 0 }}
                        />
                        <div style={{ flex: 1 }}>
                          <Text fw={500} size="sm" lineClamp={2} style={{ color: 'var(--theme-text)' }}>
                            {item.name}
                          </Text>
                          <Text size="xs" style={{ color: 'var(--theme-text-muted)' }}>
                            Qty: {item.quantity}
                          </Text>
                          <Text size="sm" fw={600} style={{ color: 'var(--theme-text)' }}>
                            {formatPrice(item.price * item.quantity)}
                          </Text>
                        </div>
                      </Group>
                    ))}

                    <Divider />

                    {/* Pricing Summary */}
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text style={{ color: 'var(--theme-text)' }}>Subtotal:</Text>
                        <Text fw={600} style={{ color: 'var(--theme-text)' }}>
                          {formatPrice(calculateSubtotal())}
                        </Text>
                      </Group>

                      <Group justify="space-between">
                        <Text style={{ color: 'var(--theme-text)' }}>Shipping:</Text>
                        <Text fw={600} style={{ color: 'var(--theme-text)' }}>
                          {getShippingCost() === 0 ? 'FREE' : formatPrice(getShippingCost())}
                        </Text>
                      </Group>

                      <Divider />

                      <Group justify="space-between">
                        <Text size="lg" fw={700} style={{ color: 'var(--theme-text)' }}>Total:</Text>
                        <Text size="lg" fw={700} style={{
                          background: 'var(--theme-primary-gradient)',
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                        }}>
                          {formatPrice(calculateTotal())}
                        </Text>
                      </Group>
                    </Stack>

                    <Divider />

                    {/* Action Buttons */}
                    <Stack gap="sm">
                      <Button
                        size="lg"
                        loading={isPlacingOrder}
                        onClick={handlePlaceOrder}
                        fullWidth
                        style={{
                          background: 'var(--theme-primary-gradient)',
                          border: 'none',
                          fontWeight: 600,
                          fontSize: '16px',
                          height: '50px'
                        }}
                      >
                        {isPlacingOrder ? 'Processing...' : `Place Order - ${formatPrice(calculateTotal())}`}
                      </Button>

                      <Button
                        variant="outline"
                        leftSection={<IconArrowLeft size={16} />}
                        component={Link}
                        href={`/store/${storeSlug}/cart`}
                        fullWidth
                        style={{
                          borderColor: 'var(--theme-border)',
                          color: 'var(--theme-text)',
                          backgroundColor: 'transparent'
                        }}
                      >
                        Back to Cart
                      </Button>
                    </Stack>
                  </Stack>
                </Card>
              </Box>
            </GridCol>
          </Grid>
        </Container>
      </div>
    </StoreThemeProvider>
  );
}