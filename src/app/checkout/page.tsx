'use client';

import { useState, useEffect } from 'react';
import { Container, Title, Grid, Card, Group, Text, Image, Button, Stack, Alert, Divider, TextInput, Select, Radio, Badge, Center, Loader } from '@mantine/core';
import { IconArrowLeft, IconCheck, IconTruck, IconClock } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

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
                typeof item.price === 'number' &&
                typeof item.quantity === 'number' &&
                typeof item.thumbnail_url === 'string'
              );
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
        total: calculateTotal()
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
        
        // Show success notification with order details
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
          router.push('/store');
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

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Center>
          <Stack align="center">
            <Loader size="lg" />
            <Text>Loading checkout...</Text>
          </Stack>
        </Center>
      </Container>
    );
  }

  if (cartItems.length === 0) {
    return (
      <Container size="xl" py="xl">
        <Stack align="center" gap="lg">
          <Alert color="blue" title="Your cart is empty">
            <Text size="sm" mb="md">You need items in your cart to proceed with checkout.</Text>
          </Alert>
          <Button
            component={Link}
            href="/store"
            leftSection={<IconArrowLeft size={16} />}
            style={{
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              border: 'none',
              fontWeight: 600,
            }}
          >
            Continue Shopping
          </Button>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="xl" py="xl">
      <Title order={1} mb="xl" ta="center" style={{
        background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        fontSize: '2.5rem',
        fontWeight: 800,
      }}>
        Checkout
      </Title>

      <Grid gutter="xl">
        {/* Left Column - Order Summary */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="lg">
            {/* Cart Items */}
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title order={3} mb="md">Order Summary</Title>
              <Stack gap="md">
                {cartItems.map((item) => (
                  <Group key={item.product_id} wrap="nowrap" align="flex-start">
                    <Image
                      src={item.thumbnail_url}
                      alt={item.name}
                      w={60}
                      h={60}
                      fit="cover"
                      radius="md"
                      style={{ flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <Text fw={500} size="sm" lineClamp={2}>
                        {item.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Quantity: {item.quantity}
                      </Text>
                      <Text size="sm" fw={600}>
                        {formatPrice(item.price * item.quantity)}
                      </Text>
                    </div>
                  </Group>
                ))}

                <Divider />

                {/* Subtotal */}
                <Group justify="space-between">
                  <Text>Subtotal:</Text>
                  <Text fw={600}>{formatPrice(calculateSubtotal())}</Text>
                </Group>

                {/* Shipping */}
                <Group justify="space-between">
                  <Text>Shipping:</Text>
                  <Text fw={600}>
                    {getShippingCost() === 0 ? 'FREE' : formatPrice(getShippingCost())}
                  </Text>
                </Group>

                <Divider />

                {/* Total */}
                <Group justify="space-between">
                  <Text size="lg" fw={700}>Total:</Text>
                  <Text size="lg" fw={700} style={{
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                    {formatPrice(calculateTotal())}
                  </Text>
                </Group>
              </Stack>
            </Card>

            {/* Shipping Options */}
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Title order={4} mb="md">Shipping Options</Title>
              <Radio.Group
                value={selectedShipping}
                onChange={setSelectedShipping}
              >
                <Stack gap="sm">
                  {shippingOptions.map((option) => (
                    <Card key={option.id} padding="sm" withBorder style={{ 
                      cursor: 'pointer',
                      borderColor: selectedShipping === option.id ? '#22c55e' : '#e9ecef',
                      backgroundColor: selectedShipping === option.id ? '#f0fdf4' : 'white',
                    }}>
                      <Radio
                        value={option.id}
                        label={
                          <Group justify="space-between" style={{ width: '100%' }}>
                            <Group gap="sm">
                              {option.icon}
                              <div>
                                <Text fw={500} size="sm">{option.name}</Text>
                                <Text size="xs" c="dimmed">{option.description}</Text>
                                <Badge variant="light" color="blue" size="xs">
                                  {option.estimatedDays}
                                </Badge>
                              </div>
                            </Group>
                            <Text fw={600}>
                              {option.price === 0 && calculateSubtotal() >= 50 ? 'FREE' : formatPrice(option.price)}
                            </Text>
                          </Group>
                        }
                      />
                    </Card>
                  ))}
                </Stack>
              </Radio.Group>
            </Card>

            {/* Action Buttons */}
            <Group justify="space-between">
              <Button
                variant="outline"
                leftSection={<IconArrowLeft size={16} />}
                component={Link}
                href="/cart"
                style={{
                  borderColor: '#6b7280',
                  color: '#6b7280',
                }}
              >
                Back to Cart
              </Button>

              <Button
                size="lg"
                loading={isPlacingOrder}
                onClick={handlePlaceOrder}
                style={{
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  border: 'none',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                }}
              >
                {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
              </Button>
            </Group>
          </Stack>
        </Grid.Col>

        {/* Right Column - Customer Information */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={3} mb="md">Customer Information</Title>
            
            <Stack gap="md">
              {/* Personal Information */}
              <div>
                <Text fw={500} mb="sm">Personal Information</Text>
                <Grid>
                  <Grid.Col span={6}>
                    <TextInput
                      label="First Name"
                      placeholder="Enter your first name"
                      value={customerInfo.firstName}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                      error={formErrors.firstName}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <TextInput
                      label="Last Name"
                      placeholder="Enter your last name"
                      value={customerInfo.lastName}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                      error={formErrors.lastName}
                      required
                    />
                  </Grid.Col>
                </Grid>
                
                <Grid mt="sm">
                  <Grid.Col span={6}>
                    <TextInput
                      label="Email"
                      placeholder="Enter your email"
                      type="email"
                      value={customerInfo.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      error={formErrors.email}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <TextInput
                      label="Phone"
                      placeholder="Enter your phone number"
                      value={customerInfo.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      error={formErrors.phone}
                      required
                    />
                  </Grid.Col>
                </Grid>
              </div>

              <Divider />

              {/* Shipping Address */}
              <div>
                <Text fw={500} mb="sm">Shipping Address</Text>
                <TextInput
                  label="Address"
                  placeholder="Enter your street address"
                  value={customerInfo.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  error={formErrors.address}
                  required
                  mb="sm"
                />
                
                <Grid>
                  <Grid.Col span={4}>
                    <TextInput
                      label="City"
                      placeholder="City"
                      value={customerInfo.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      error={formErrors.city}
                      required
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
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
                    />
                  </Grid.Col>
                  <Grid.Col span={4}>
                    <TextInput
                      label="ZIP Code"
                      placeholder="ZIP"
                      value={customerInfo.zipCode}
                      onChange={(e) => handleInputChange('zipCode', e.target.value)}
                      error={formErrors.zipCode}
                      required
                    />
                  </Grid.Col>
                </Grid>
              </div>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Container>
  );
}