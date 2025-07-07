'use client';

import React, { useState, useEffect } from 'react';
import { Container, Title, Text, Badge, Button, Group, Stack, Grid, Image, Card, NumberInput, GridCol, CardSection } from '@mantine/core';
import { IconShoppingCart, IconHeart, IconShare, IconMinus, IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface CartItem {
  product_id: string | number;
  name: string;
  price: number;
  quantity: number;
  thumbnail_url: string;
}

interface InventoryData {
  [sku: string]: number;
}

interface ProductPageClientProps {
  product: Record<string, unknown>;
  store: Record<string, unknown>;
}

export function ProductPageClient({ product, store }: ProductPageClientProps) {
  const [quantity, setQuantity] = useState(1);
  const [inventory, setInventory] = useState<InventoryData>({});
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

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
    };

    loadCartData();
  }, []);

  // Fetch inventory data
  useEffect(() => {
    const fetchInventory = async () => {
      if (!store?.id) return;
      
      try {
        const response = await fetch(`/api/stores/${store.id}/inventory`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            const inventoryMap = data.data.reduce((acc: InventoryData, item: Record<string, unknown>) => {
              acc[item.sku] = item.available || 0;
              return acc;
            }, {});
            setInventory(inventoryMap);
          }
        }
      } catch (error) {
        console.error('Error fetching inventory:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInventory();
  }, [store?.id]);

  // Calculate available stock considering cart contents
  const getAvailableStock = () => {
    const totalInventory = inventory[product.sku] || 0;
    const cartQuantity = cartItems.find(item => item.product_id === product.product_id)?.quantity || 0;
    return Math.max(0, totalInventory - cartQuantity);
  };

  // Check if product is in stock
  const isInStock = () => {
    return getAvailableStock() > 0 && product.active;
  };

  // Handle quantity change
  const handleQuantityChange = (value: number | string) => {
    const numValue = typeof value === 'string' ? parseInt(value) || 1 : value;
    const maxQuantity = getAvailableStock();
    const clampedValue = Math.max(1, Math.min(numValue, maxQuantity));
    setQuantity(clampedValue);
  };

  // Add to cart functionality
  const addToCart = () => {
    if (!isInStock()) {
      notifications.show({
        title: 'Out of Stock',
        message: 'This product is currently out of stock.',
        color: 'red',
      });
      return;
    }

    const availableStock = getAvailableStock();
    if (quantity > availableStock) {
      notifications.show({
        title: 'Insufficient Stock',
        message: `Only ${availableStock} items available.`,
        color: 'red',
      });
      return;
    }

    try {
      const cartItem: CartItem = {
        product_id: product.product_id,
        name: product.name,
        price: product.customs_value?.amount || 29.99,
        quantity,
        thumbnail_url: product.thumbnail_url || '/placeholder-product.svg'
      };

      // Get existing cart or initialize empty array
      const existingCart = cartItems;
      const existingItemIndex = existingCart.findIndex(item => item.product_id === product.product_id);
      
      let updatedCart: CartItem[];
      if (existingItemIndex !== -1) {
        // Update existing item quantity
        const newQuantity = existingCart[existingItemIndex].quantity + quantity;
        if (newQuantity > availableStock) {
          notifications.show({
            title: 'Insufficient Stock',
            message: `Cannot add ${quantity} more. Only ${availableStock - existingCart[existingItemIndex].quantity} additional items available.`,
            color: 'red',
          });
          return;
        }
        
        updatedCart = [...existingCart];
        updatedCart[existingItemIndex] = { ...updatedCart[existingItemIndex], quantity: newQuantity };
      } else {
        // Add new item to cart
        updatedCart = [...existingCart, cartItem];
      }

      // Save to localStorage
      localStorage.setItem('cart', JSON.stringify(updatedCart));
      setCartItems(updatedCart);

      // Dispatch cart update event
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: updatedCart }));

      // Reset quantity to 1
      setQuantity(1);

      // Show success notification
      notifications.show({
        title: 'Added to Cart',
        message: `${quantity} × ${product.name} added to your cart.`,
        color: 'green',
        icon: <IconShoppingCart size="1rem" />,
      });

    } catch (error) {
      console.error('Error adding to cart:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to add item to cart. Please try again.',
        color: 'red',
      });
    }
  };

  if (loading) {
    return (
      <Container size="xl" py="xl">
        <Text>Loading...</Text>
      </Container>
    );
  }

  const availableStock = getAvailableStock();
  const maxQuantity = Math.max(1, availableStock);
  const productPrice = product.customs_value?.amount || 29.99;

  return (
    <Container size="xl" py="xl">
      <Grid>
        <GridCol span={{ base: 12, md: 6 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <CardSection>
              <Image
                src={product.thumbnail_url || "/placeholder-product.svg"}
                height={500}
                alt={product.name}
                fit="contain"
                fallbackSrc="https://via.placeholder.com/500x500?text=No+Image"
              />
            </CardSection>
          </Card>
        </GridCol>
        
        <GridCol span={{ base: 12, md: 6 }}>
          <Stack gap="lg">
            <div>
              <Title order={1} size="h2" mb="sm" style={{ color: 'var(--theme-text)' }}>
                {product.name}
              </Title>
              
              <Group gap="sm" mb="md">
                <Badge 
                  variant="light" 
                  style={{ 
                    backgroundColor: 'var(--theme-background-secondary)', 
                    color: 'var(--theme-text)',
                    borderColor: 'var(--theme-border)'
                  }}
                >
                  SKU: {product.sku}
                </Badge>
                <Badge 
                  variant="light"
                  style={{ 
                    backgroundColor: isInStock() ? 'var(--theme-success)' : 'var(--theme-error)', 
                    color: 'white'
                  }}
                >
                  {isInStock() ? `${availableStock} Available` : "Out of Stock"}
                </Badge>
              </Group>
              
              <Text 
                size="xl" 
                fw={700} 
                mb="lg"
                style={{
                  background: 'var(--theme-primary-gradient)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                ${productPrice.toFixed(2)}
              </Text>
            </div>
            
            {product.description && (
              <div>
                <Title order={3} size="h4" mb="sm" style={{ color: 'var(--theme-text)' }}>Description</Title>
                <Text style={{ color: 'var(--theme-text-secondary)' }}>{product.description}</Text>
              </div>
            )}
            
            {product.product_category && (
              <div>
                <Title order={3} size="h4" mb="sm" style={{ color: 'var(--theme-text)' }}>Category</Title>
                <Badge size="lg" variant="light" style={{ 
                  backgroundColor: 'var(--theme-background-secondary)', 
                  color: 'var(--theme-text)',
                  borderColor: 'var(--theme-border)'
                }}>
                  {product.product_category.name}
                </Badge>
              </div>
            )}
            
            {(product.weight || product.dimensions) && (
              <div>
                <Title order={3} size="h4" mb="sm" style={{ color: 'var(--theme-text)' }}>Specifications</Title>
                <Stack gap="xs">
                  {product.weight && (
                    <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                      <strong style={{ color: 'var(--theme-text)' }}>Weight:</strong> {product.weight.value} {product.weight.unit}
                    </Text>
                  )}
                  {product.dimensions && (
                    <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
                      <strong style={{ color: 'var(--theme-text)' }}>Dimensions:</strong> {product.dimensions.length}&quot; × {product.dimensions.width}&quot; × {product.dimensions.height}&quot; {product.dimensions.unit}
                    </Text>
                  )}
                </Stack>
              </div>
            )}
            
            <div>
              <Group gap="sm" mb="md">
                <Text fw={500} style={{ color: 'var(--theme-text)' }}>Quantity:</Text>
                <Group gap={5}>
                  <Button 
                    variant="outline" 
                    size="xs"
                    disabled={quantity <= 1}
                    onClick={() => handleQuantityChange(quantity - 1)}
                    style={{
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                      backgroundColor: 'transparent'
                    }}
                  >
                    <IconMinus size={14} />
                  </Button>
                  <NumberInput
                    value={quantity}
                    onChange={handleQuantityChange}
                    min={1}
                    max={maxQuantity}
                    size="xs"
                    w={60}
                    hideControls
                    styles={{
                      input: {
                        backgroundColor: 'var(--theme-background-secondary)',
                        borderColor: 'var(--theme-border)',
                        color: 'var(--theme-text)'
                      }
                    }}
                  />
                  <Button 
                    variant="outline" 
                    size="xs"
                    disabled={quantity >= maxQuantity}
                    onClick={() => handleQuantityChange(quantity + 1)}
                    style={{
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                      backgroundColor: 'transparent'
                    }}
                  >
                    <IconPlus size={14} />
                  </Button>
                </Group>
                {availableStock < 10 && availableStock > 0 && (
                  <Text size="sm" style={{ color: 'var(--theme-warning)' }}>
                    Only {availableStock} left!
                  </Text>
                )}
              </Group>
              
              <Group gap="sm">
                <Button 
                  size="lg" 
                  leftSection={<IconShoppingCart size={20} />}
                  disabled={!isInStock()}
                  onClick={addToCart}
                  style={{
                    background: isInStock() ? 'var(--theme-primary-gradient)' : 'var(--theme-disabled)',
                    border: 'none',
                    fontWeight: 600,
                    color: isInStock() ? 'var(--theme-text-on-primary)' : 'var(--theme-text-muted)'
                  }}
                >
                  {isInStock() ? 'Add to Cart' : 'Out of Stock'}
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  leftSection={<IconHeart size={20} />}
                  style={{
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                    backgroundColor: 'transparent',
                    '&:hover': {
                      backgroundColor: 'var(--theme-hover-overlay)'
                    }
                  }}
                >
                  Add to Wishlist
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  leftSection={<IconShare size={20} />}
                  style={{
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                    backgroundColor: 'transparent',
                    '&:hover': {
                      backgroundColor: 'var(--theme-hover-overlay)'
                    }
                  }}
                >
                  Share
                </Button>
              </Group>
            </div>
          </Stack>
        </GridCol>
      </Grid>
    </Container>
  );
}