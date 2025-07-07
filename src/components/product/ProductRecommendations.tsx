'use client';

import { useState, useEffect } from 'react';
import { 
  Box, 
  Title, 
  Grid, 
  Card, 
  Image, 
  Text, 
  Group, 
  Badge, 
  Button,
  Skeleton,
  Alert
} from '@mantine/core';
import { IconShoppingCart, IconEye, IconInfoCircle } from '@tabler/icons-react';
import Link from 'next/link';
import { Product } from '@/types/product';
import { formatPrice } from '@/lib/product-utils';

interface ProductRecommendationsProps {
  productId: string;
  category?: string;
  title?: string;
  limit?: number;
}

export function ProductRecommendations({
  productId,
  category,
  title = "You May Also Like",
  limit = 4
}: ProductRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch products from the main products API
        const query = new URLSearchParams({
          page: '1',
          page_size: (limit * 3).toString(), // Fetch more to filter
          sort_dir: 'ASC',
          sort_by: 'SKU',
          show_inactive: 'false'
        }).toString();

        const response = await fetch(`/api/products?${query}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.message || data.error);
        }

        if (!data.products || !Array.isArray(data.products)) {
          setRecommendations([]);
          return;
        }

        // Filter and transform products for recommendations
        const filteredProducts = data.products
          .filter((product: Product) => 
            product.product_id !== productId && // Exclude current product
            product.thumbnail_url && // Only products with images
            product.active !== false // Only active products
          )
          .map((product: Product) => ({
            ...product,
            price: product.customs_value?.amount || 29.99, // Use customs value or default price
            available_stock: Math.floor(Math.random() * 50) + 1, // Random stock for demo
            thumbnail_url: product.thumbnail_url || "/placeholder-product.svg",
            category: product.product_category?.name || "Other"
          }))
          .slice(0, limit); // Limit results

        setRecommendations(filteredProducts);
        
      } catch (err) {
        console.error('Error fetching recommendations:', err);
        setError(err instanceof Error ? err.message : 'Failed to load recommendations');
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendations();
  }, [productId, category, limit]);
  
  const handleAddToCart = (product: Product) => {
    const cartItem = {
      product_id: product.product_id,
      name: product.name,
      price: product.price || 0,
      quantity: 1,
      thumbnail_url: product.thumbnail_url || "/placeholder-product.svg"
    };
    
    // Get existing cart from localStorage
    const existingCartString = localStorage.getItem('cart');
    const existingCart = JSON.parse(existingCartString || '[]');
    
    // Check if product already exists in cart
    const existingItemIndex = existingCart.findIndex((item: { product_id: string; quantity: number }) => item.product_id === product.product_id);
    
    if (existingItemIndex >= 0) {
      // Update quantity of existing item
      existingCart[existingItemIndex].quantity += 1;
    } else {
      // Add new item to cart
      existingCart.push(cartItem);
    }
    
    // Save updated cart to localStorage
    localStorage.setItem('cart', JSON.stringify(existingCart));
    
    // Update cart count (emit custom event to notify other components)
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: existingCart }));
  };
  
  if (loading) {
    return (
      <Box>
        <Title order={3} mb="lg">
          {title}
        </Title>
        <Grid>
          {Array.from({ length: limit }, (_, index) => (
            <Grid.Col key={index} span={{ base: 12, sm: 6, md: 3 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Card.Section>
                  <Skeleton height={200} />
                </Card.Section>
                <Skeleton height={20} mt="md" />
                <Skeleton height={16} mt="xs" />
                <Skeleton height={30} mt="md" />
              </Card>
            </Grid.Col>
          ))}
        </Grid>
      </Box>
    );
  }
  
  if (error) {
    return (
      <Alert icon={<IconInfoCircle size="1rem" />} color="yellow">
        <Text size="sm">Unable to load product recommendations: {error}</Text>
      </Alert>
    );
  }
  
  if (recommendations.length === 0) {
    return null; // Don't show anything if no recommendations
  }
  
  return (
    <Box>
      <Title order={3} mb="lg">
        {title}
      </Title>
      
      <Grid>
        {recommendations.map((product) => (
          <Grid.Col key={product.product_id} span={{ base: 12, sm: 6, md: 3 }}>
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
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--mantine-shadow-sm)';
              }}
            >
              <Card.Section 
                component={Link}
                href={`/store/${product.product_id}`}
                style={{ textDecoration: 'none' }}
              >
                <Image
                  src={product.thumbnail_url}
                  height={180}
                  alt={product.name}
                  fit="contain"
                />
              </Card.Section>

              <Box style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Text 
                  fw={500} 
                  size="sm" 
                  lineClamp={2} 
                  mt="md" 
                  mb="xs"
                  component={Link}
                  href={`/store/${product.product_id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  {product.name}
                </Text>

                {product.category && product.category !== 'Other' && (
                  <Badge variant="light" size="xs" mb="xs">
                    {product.category}
                  </Badge>
                )}

                <div style={{ flexGrow: 1 }} />

                <Group justify="space-between" align="center" mb="md">
                  <Text size="lg" fw={700} c="blue">
                    {formatPrice(product.price || 0)}
                  </Text>
                  
                  <Badge color="green" variant="light" size="xs">
                    In Stock
                  </Badge>
                </Group>

                <Group gap="xs">
                  <Button
                    component={Link}
                    href={`/store/${product.product_id}`}
                    variant="outline"
                    size="xs"
                    flex={1}
                    leftSection={<IconEye size={14} />}
                  >
                    View
                  </Button>
                  
                  <Button
                    size="xs"
                    flex={1}
                    leftSection={<IconShoppingCart size={14} />}
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddToCart(product);
                    }}
                  >
                    Add
                  </Button>
                </Group>
              </Box>
            </Card>
          </Grid.Col>
        ))}
      </Grid>
    </Box>
  );
}