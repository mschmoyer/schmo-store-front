'use client';

import { useState } from 'react';
import { 
  Title, 
  Text, 
  Group, 
  Badge, 
  Button, 
  NumberInput, 
  Box,
  Divider,
  List,
  Alert,
  Paper,
  Grid,
  Stack
} from '@mantine/core';
import { 
  IconShoppingCart, 
  IconMinus, 
  IconPlus, 
  IconCheck, 
  IconTruck,
  IconShield,
  IconRefresh,
  IconInfoCircle
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { StarRating } from '@/components/ui/StarRating';
import { EnhancedProduct } from '@/types/product';
import { CartItem } from '@/types/product';
import { 
  formatPrice, 
  getDiscountInfo, 
  getProductAvailability 
} from '@/lib/product-utils';
import sanitizeHtml from 'sanitize-html';

interface ProductInfoProps {
  product: EnhancedProduct;
  onQuantityChange?: (quantity: number) => void;
  onAddToCart?: (item: CartItem) => void;
}

export function ProductInfo({ 
  product, 
  onQuantityChange, 
  onAddToCart 
}: ProductInfoProps) {
  const [quantity, setQuantity] = useState(1);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  
  const availability = getProductAvailability(product, product.stock_level);
  const discountInfo = getDiscountInfo(product);
  
  const handleQuantityChange = (value: number) => {
    const newQuantity = Math.max(1, Math.min(value, availability.stock_level));
    setQuantity(newQuantity);
    onQuantityChange?.(newQuantity);
  };
  
  const handleAddToCart = async () => {
    setIsAddingToCart(true);
    
    try {
      const cartItem: CartItem = {
        product_id: product.product_id,
        name: product.display_name,
        price: product.display_price,
        quantity: quantity,
        thumbnail_url: product.display_images[0]?.url || '/placeholder-product.svg',
        sku: product.sku,
        max_quantity: availability.stock_level
      };
      
      // Get existing cart from localStorage
      const existingCartString = localStorage.getItem('cart');
      const existingCart = JSON.parse(existingCartString || '[]') as CartItem[];
      
      // Check if product already exists in cart
      const existingItemIndex = existingCart.findIndex(item => item.product_id === product.product_id);
      
      if (existingItemIndex >= 0) {
        // Update quantity of existing item
        existingCart[existingItemIndex].quantity += quantity;
      } else {
        // Add new item to cart
        existingCart.push(cartItem);
      }
      
      // Save updated cart to localStorage
      localStorage.setItem('cart', JSON.stringify(existingCart));
      
      // Call callback if provided
      onAddToCart?.(cartItem);
      
      // Show success notification
      notifications.show({
        title: 'Added to Cart!',
        message: `${product.display_name} has been added to your cart.`,
        color: 'green',
        icon: <IconCheck size="1rem" />,
        autoClose: 3000,
      });
      
      // Update cart count (emit custom event to notify other components)
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: existingCart }));
      
      // Track add to cart event
      fetch(`/api/products/${product.product_id}/analytics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'add_to_cart',
          event_data: {
            quantity,
            price: product.display_price,
            total_value: product.display_price * quantity,
            timestamp: new Date().toISOString()
          },
          user_agent: navigator.userAgent,
          referrer: document.referrer
        })
      }).catch(err => {
        console.warn('Failed to track add to cart event:', err);
      });
      
    } catch (error) {
      console.error('Error adding to cart:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to add item to cart. Please try again.',
        color: 'red',
        autoClose: 5000,
      });
    } finally {
      setIsAddingToCart(false);
    }
  };
  
  return (
    <Stack gap="lg">
      {/* Product Title and Category */}
      <Box>
        <Group justify="space-between" align="flex-start" mb="xs">
          <Title order={1} size="h2" style={{ lineHeight: 1.2 }}>
            {product.display_name}
          </Title>
          
          {product.featured_product && (
            <Badge variant="gradient" gradient={{ from: 'orange', to: 'red' }}>
              Featured
            </Badge>
          )}
        </Group>
        
        {product.brand && (
          <Text size="lg" c="dimmed" mb="xs">
            by {product.brand}
          </Text>
        )}
        
        {(product.product_category?.name || product.category) && (
          <Badge variant="light" size="sm">
            {product.product_category?.name || product.category}
          </Badge>
        )}
      </Box>
      
      {/* Rating and Reviews */}
      {(product?.review_count ?? 0) > 0 && (
        <Group gap="sm">
          <StarRating 
            value={product.average_rating || 0} 
            readonly 
            size="sm"
            showCount
            count={product.review_count}
          />
        </Group>
      )}
      
      {/* Price and Discount */}
      <Box>
        <Group align="center" gap="md">
          <Text size="xl" fw={700} c="dark">
            {formatPrice(product.display_price)}
          </Text>
          
          {discountInfo && (
            <>
              <Text size="lg" td="line-through" c="dimmed">
                {formatPrice(discountInfo.original_price)}
              </Text>
              <Badge color="red" variant="filled">
                Save {discountInfo.percentage}%
              </Badge>
            </>
          )}
        </Group>
        
        {discountInfo && (
          <Text size="sm" c="green" fw={500}>
            You save {formatPrice(discountInfo.savings)}
          </Text>
        )}
      </Box>
      
      {/* Availability */}
      <Alert
        icon={availability.is_in_stock ? <IconCheck size="1rem" /> : <IconInfoCircle size="1rem" />}
        color={availability.is_in_stock ? "green" : "red"}
        variant="light"
      >
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            {availability.stock_message}
          </Text>
          {availability.is_low_stock && (
            <Text size="xs" c="orange">
              Only {availability.stock_level} left!
            </Text>
          )}
        </Group>
      </Alert>
      
      {/* Quantity and Add to Cart */}
      {availability.is_in_stock && (
        <Paper shadow="xs" radius="md" p="md" withBorder>
          <Group justify="space-between" mb="md">
            <Text size="sm" fw={500}>
              Quantity:
            </Text>
            <Group gap={5}>
              <Button
                variant="outline"
                size="xs"
                onClick={() => handleQuantityChange(quantity - 1)}
                disabled={quantity <= 1}
              >
                <IconMinus size={14} />
              </Button>
              <NumberInput
                value={quantity}
                onChange={(value) => handleQuantityChange(Number(value) || 1)}
                min={1}
                max={availability.stock_level}
                size="xs"
                w={80}
                hideControls
                styles={{
                  input: {
                    textAlign: 'center'
                  }
                }}
              />
              <Button
                variant="outline"
                size="xs"
                onClick={() => handleQuantityChange(quantity + 1)}
                disabled={quantity >= availability.stock_level}
              >
                <IconPlus size={14} />
              </Button>
            </Group>
          </Group>
          
          <Button
            fullWidth
            size="lg"
            leftSection={<IconShoppingCart size={20} />}
            onClick={handleAddToCart}
            loading={isAddingToCart}
            style={{
              background: 'var(--mantine-color-primary-6)',
              transition: 'all 0.3s ease',
            }}
          >
            Add to Cart - {formatPrice(product.display_price * quantity)}
          </Button>
        </Paper>
      )}
      
      <Divider />
      
      {/* Product Description */}
      {product.display_description && (
        <Box>
          <Title order={3} size="h4" mb="sm">
            Description
          </Title>
          <Box
            style={{ lineHeight: 1.6 }}
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(product.display_description, {
                allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6'],
                allowedAttributes: {
                  '*': ['class', 'id']
                }
              })
            }}
          />
        </Box>
      )}
      
      {/* Features */}
      {product.features && product.features.length > 0 && (
        <Box>
          <Title order={3} size="h4" mb="sm">
            Key Features
          </Title>
          <List
            spacing="xs"
            size="sm"
            icon={<IconCheck size={14} color="var(--mantine-color-green-6)" />}
          >
            {product.features.map((feature, index) => (
              <List.Item key={index}>
                {feature}
              </List.Item>
            ))}
          </List>
        </Box>
      )}
      
      {/* Specifications */}
      {product.specifications && Object.keys(product.specifications).length > 0 && (
        <Box>
          <Title order={3} size="h4" mb="sm">
            Specifications
          </Title>
          <Grid>
            {Object.entries(product.specifications).map(([key, value]) => (
              <Grid.Col span={{ base: 12, sm: 6 }} key={key}>
                <Group justify="space-between">
                  <Text size="sm" c="dimmed">
                    {key}:
                  </Text>
                  <Text size="sm" fw={500}>
                    {value}
                  </Text>
                </Group>
              </Grid.Col>
            ))}
          </Grid>
        </Box>
      )}
      
      <Divider />
      
      {/* Product Policies */}
      <Grid>
        {product.shipping_info && (
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Group gap="xs" mb="xs">
              <IconTruck size={16} color="var(--mantine-color-blue-6)" />
              <Text size="sm" fw={500}>
                Shipping
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {product.shipping_info}
            </Text>
          </Grid.Col>
        )}
        
        {product.return_policy && (
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Group gap="xs" mb="xs">
              <IconRefresh size={16} color="var(--mantine-color-green-6)" />
              <Text size="sm" fw={500}>
                Returns
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {product.return_policy}
            </Text>
          </Grid.Col>
        )}
        
        {product.warranty_info && (
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Group gap="xs" mb="xs">
              <IconShield size={16} color="var(--mantine-color-orange-6)" />
              <Text size="sm" fw={500}>
                Warranty
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {product.warranty_info}
            </Text>
          </Grid.Col>
        )}
      </Grid>
    </Stack>
  );
}