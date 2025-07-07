'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Group, Text, Badge, Button, NumberInput, Image, Grid, Container, Title, Loader, Center, Alert, Pagination, CardSection, GridCol } from '@mantine/core';
import { IconMinus, IconPlus, IconShoppingCart, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import Link from 'next/link';
import { useVisitorTracking } from '@/hooks/useVisitorTracking';
import { RebelShopFooter } from '@/components/store/RebelShopFooter';

interface Product {
  product_id: string;
  sku: string;
  name: string;
  description?: string;
  price?: number;
  available_stock?: number;
  thumbnail_url?: string;
  category?: string;
  product_category?: {
    product_category_id: number;
    name: string;
  };
  weight?: {
    value: number;
    unit: string;
  };
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: string;
  };
  warehouse_location?: string;
  customs_country_code?: string;
  customs_description?: string;
  customs_value?: {
    amount: number;
    currency: string;
  };
  create_date?: string;
  modify_date?: string;
  active?: boolean;
}

interface CartItem {
  product_id: string | number;
  name: string;
  price: number;
  quantity: number;
  thumbnail_url: string;
}

interface InventoryItem {
  sku: string;
  available: number;
  on_hand: number;
  allocated: number;
}

interface Store {
  id: string;
  store_name: string;
  store_slug: string;
  store_description: string;
  hero_title: string;
  hero_description: string;
  theme_name: string;
  currency: string;
  is_active: boolean;
  is_public: boolean;
  meta_title: string;
  meta_description: string;
}

interface StorePageClientProps {
  store: Store;
  storeSlug: string;
}

export default function StorePageClient({ store, storeSlug }: StorePageClientProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, Product[]>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [inventoryData, setInventoryData] = useState<Record<string, number>>({});
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [pageSize] = useState(50);

  // Track visitor for this store
  useVisitorTracking({
    storeId: store?.id,
    pagePath: `/store/${storeSlug}`,
    enabled: !!store?.id
  });

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

    // Listen for cart updates
    const handleCartUpdate = (event: CustomEvent) => {
      setCartItems(event.detail || []);
    };

    window.addEventListener('cartUpdated', handleCartUpdate as EventListener);
    return () => {
      window.removeEventListener('cartUpdated', handleCartUpdate as EventListener);
    };
  }, []);

  const fetchInventoryForProducts = useCallback(async (productList: Product[]) => {
    try {
      if (!store) return;
      
      // Get inventory for this store's products
      const response = await fetch(`/api/stores/${store.id}/inventory`);
      
      if (response.ok) {
        const inventoryResponse = await response.json();
        
        // Create inventory map from response
        const inventoryMap: Record<string, number> = {};
        
        if (inventoryResponse.inventory && Array.isArray(inventoryResponse.inventory)) {
          inventoryResponse.inventory.forEach((item: InventoryItem) => {
            if (item.sku) {
              inventoryMap[item.sku] = (inventoryMap[item.sku] || 0) + (item.available || 0);
            }
          });
        }
        
        // Create final map with only our product SKUs, defaulting missing ones to 0
        const finalInventoryMap: Record<string, number> = {};
        productList.forEach(product => {
          if (product.sku) {
            finalInventoryMap[product.sku] = inventoryMap[product.sku] || 0;
          }
        });
        
        setInventoryData(finalInventoryMap);
      } else {
        // Fallback: set all product SKUs to 0 inventory
        const fallbackMap = productList.reduce((acc, product) => {
          if (product.sku) {
            acc[product.sku] = 0;
          }
          return acc;
        }, {} as Record<string, number>);
        
        setInventoryData(fallbackMap);
      }
    } catch (error) {
      console.error('Error in fetchInventoryForProducts:', error);
      
      // Fallback: set all product SKUs to 0 inventory
      const fallbackMap = productList.reduce((acc, product) => {
        if (product.sku) {
          acc[product.sku] = 0;
        }
        return acc;
      }, {} as Record<string, number>);
      
      setInventoryData(fallbackMap);
    }
  }, [store]);

  // Fetch products from database (store-specific)
  useEffect(() => {
    const fetchProducts = async () => {
      if (!store) return;
      
      try {
        setLoading(true);
        const query = new URLSearchParams({
          store_id: store.id,
          page: currentPage.toString(),
          page_size: pageSize.toString(),
          active_only: 'true'
        }).toString();

        const resp = await fetch(`/api/stores/${store.id}/products?${query}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!resp.ok) {
          throw new Error(`HTTP error! status: ${resp.status}`);
        }

        const data = await resp.json();
        
        if (data.error) {
          throw new Error(data.message || data.error);
        }
        
        // Update pagination info
        setTotalPages(data.pages || 1);
        setTotalProducts(data.total || data.products?.length || 0);
        
        // Transform products for marketplace use
        const storeProducts = (data.products || []).map((product: Record<string, unknown>) => ({
          ...product,
          price: product.base_price || product.sale_price || 29.99,
          available_stock: Math.floor(Math.random() * 50) + 1, // Will be replaced with real inventory
          thumbnail_url: product.featured_image_url || "/placeholder-product.svg",
          category: product.category || "Other"
        }));

        setProducts(storeProducts);
        
        // Group products by category
        const categorizedProducts = storeProducts.reduce((acc: Record<string, Product[]>, product: Product) => {
          const category = product.category || "Other";
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(product);
          return acc;
        }, {});
        
        setProductsByCategory(categorizedProducts);
        
        // Fetch inventory for each product
        await fetchInventoryForProducts(storeProducts);
      } catch (error) {
        console.error('Error fetching products:', error);
        if (error instanceof Error) {
          setError(error.message);
        } else {
          setError('Failed to load products. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    if (store) {
      fetchProducts();
    }
  }, [store, currentPage, pageSize, fetchInventoryForProducts]);

  const handlePageChange = (page: number) => {
    setLoading(true);
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getQuantity = (productId: string) => quantities[productId] || 1;

  // Calculate cart-aware available stock for a product
  const getCartAwareStock = (product: Product) => {
    const totalInventory = inventoryData[product.sku || ''] || 0;
    const cartQuantity = cartItems.find(item => item.product_id === product.product_id)?.quantity || 0;
    return Math.max(0, totalInventory - cartQuantity);
  };

  const updateQuantity = (productId: string, value: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, value)
    }));
  };

  const addToCart = (product: Product) => {
    try {
      console.log('Adding to cart:', product);
      const quantity = getQuantity(product.product_id);
      console.log('Quantity:', quantity);

      // Check cart-aware stock availability
      const availableStock = getCartAwareStock(product);
      if (availableStock <= 0) {
        notifications.show({
          title: 'Out of Stock',
          message: 'This product is currently out of stock.',
          color: 'red',
          autoClose: 3000,
        });
        return;
      }

      if (quantity > availableStock) {
        notifications.show({
          title: 'Insufficient Stock',
          message: `Only ${availableStock} items available.`,
          color: 'red',
          autoClose: 3000,
        });
        return;
      }
      
      // Get existing cart from localStorage
      const existingCartString = localStorage.getItem('cart');
      const existingCart = JSON.parse(existingCartString || '[]') as CartItem[];
      console.log('Existing cart:', existingCart);
      
      // Check if product already exists in cart
      const existingItemIndex = existingCart.findIndex(item => item.product_id === product.product_id);
      
      if (existingItemIndex >= 0) {
        // Check if adding to existing item would exceed available stock
        const newTotalQuantity = existingCart[existingItemIndex].quantity + quantity;
        if (newTotalQuantity > availableStock) {
          notifications.show({
            title: 'Insufficient Stock',
            message: `Cannot add ${quantity} more. Only ${availableStock - existingCart[existingItemIndex].quantity} additional items available.`,
            color: 'red',
            autoClose: 3000,
          });
          return;
        }
        
        // Update quantity of existing item
        existingCart[existingItemIndex].quantity += quantity;
        console.log('Updated existing item:', existingCart[existingItemIndex]);
      } else {
        // Add new item to cart
        const cartItem: CartItem = {
          product_id: product.product_id,
          name: product.name,
          price: product.price || 0,
          quantity: quantity,
          thumbnail_url: product.thumbnail_url || "/placeholder-product.svg"
        };
        existingCart.push(cartItem);
        console.log('Added new item:', cartItem);
      }
      
      // Save updated cart to localStorage
      localStorage.setItem('cart', JSON.stringify(existingCart));
      console.log('Saved cart to localStorage:', existingCart);
      
      // Update local cart state
      setCartItems(existingCart);
      
      // Show success toast
      notifications.show({
        title: 'Added to Cart!',
        message: `${product.name} has been added to your cart.`,
        color: 'green',
        icon: <IconCheck size="1rem" />,
        autoClose: 3000,
      });
      
      // Update cart count (emit custom event to notify other components)
      window.dispatchEvent(new CustomEvent('cartUpdated', { detail: existingCart }));
      console.log('Cart update event dispatched');
      
    } catch (error) {
      console.error('Error adding to cart:', error);
      notifications.show({
        title: 'Error',
        message: 'Failed to add item to cart. Please try again.',
        color: 'red',
        autoClose: 3000,
      });
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: store?.currency || 'USD'
    }).format(price);
  };

  // Show loading state
  if (loading) {
    return (
      <div style={{ 
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Container size="xl">
          <Center>
            <div style={{ textAlign: 'center' }}>
              <Loader size="lg" color="dark" />
              <Text mt="md" c="dark">Loading products...</Text>
            </div>
          </Center>
        </Container>
      </div>
    );
  }

  if (error) {
    return (
      <Container size="xl">
        <Alert color="red" title="Error Loading Products">
          <Text size="sm">{error}</Text>
        </Alert>
      </Container>
    );
  }

  return (
    <>
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
              {store.hero_title || store.store_name}
            </Title>
            <Text size="xl" style={{ 
              fontSize: '1.25rem',
              lineHeight: 1.6,
              maxWidth: '600px',
              margin: '0 auto',
              color: 'var(--theme-text-secondary)'
            }}>
              {store.hero_description || store.store_description || 'Discover our carefully curated selection of high-quality products.'}
            </Text>
          </div>
        </Container>
      </div>

      <Container size="xl" py="lg">
        {/* Product Count and Pagination Info */}
        {!error && !loading && (
          <div style={{ marginBottom: '2rem' }}>
            <Group justify="space-between" align="center">
              <Text size="lg" style={{ color: 'var(--theme-text-muted)' }}>
                Showing {products.length} of {totalProducts} products
                {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
              </Text>
              {totalPages > 1 && (
                <Text size="sm" c="dimmed">
                  {pageSize} products per page
                </Text>
              )}
            </Group>
          </div>
        )}

        {products.length === 0 ? (
          <Alert color="blue" title="No Products Available" mb="md">
            <Text size="sm">No products found in this store.</Text>
          </Alert>
        ) : (
          <>
            {Object.entries(productsByCategory).map(([category, categoryProducts]) => (
              <div key={category} style={{ marginBottom: '3rem' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  marginBottom: '1.5rem',
                  padding: '1rem 0',
                  borderBottom: '3px solid var(--theme-primary)',
                  background: 'var(--theme-background-secondary)',
                  borderRadius: '8px 8px 0 0'
                }}>
                  <Title order={2} c="dark" style={{ 
                    margin: 0,
                    fontSize: '1.8rem',
                    fontWeight: 700,
                    color: 'var(--theme-text)',
                    textShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    letterSpacing: '0.5px'
                  }}>
                    {category}
                  </Title>
                  <Badge 
                    variant="light" 
                    color="green" 
                    size="sm" 
                    style={{ marginLeft: '1rem' }}
                  >
                    {categoryProducts.length} {categoryProducts.length === 1 ? 'product' : 'products'}
                  </Badge>
                </div>
                <Grid>
                  {categoryProducts.map((product: Product) => (
                    <GridCol key={product.product_id} span={{ base: 12, sm: 6, md: 4 }}>
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
                        <CardSection 
                          component={Link}
                          href={`/store/${storeSlug}/product/${product.product_id}`}
                          style={{ 
                            height: '300px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            padding: '8px',
                            textDecoration: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <Image
                            src={product.thumbnail_url}
                            height={284}
                            width={284}
                            fit="contain"
                            alt={product.name}
                            fallbackSrc="/placeholder-product.svg"
                            style={{ maxHeight: '284px', maxWidth: '284px', objectFit: 'contain', borderRadius: '8px' }}
                          />
                        </CardSection>

                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <Text fw={500} size="lg" lineClamp={1} mt="md" mb="xs" style={{ color: 'var(--theme-text)' }}>
                            {product.name}
                          </Text>

                          {product.description && (
                            <Text size="sm" c="dimmed" lineClamp={2} mb="md">
                              {product.description}
                            </Text>
                          )}

                          <Group justify="space-between" align="center" mb="md">
                            <Text size="xl" fw={700} style={{ color: 'var(--theme-primary)' }}>
                              {formatPrice(product.price || 0)}
                            </Text>
                            {(() => {
                              const cartAwareStock = getCartAwareStock(product);
                              const isOutOfStock = cartAwareStock <= 0;
                              
                              return (
                                <Badge 
                                  color={isOutOfStock ? "red" : "blue"} 
                                  variant={isOutOfStock ? "filled" : "light"}
                                >
                                  {isOutOfStock ? "Out of Stock" : `${cartAwareStock} left`}
                                </Badge>
                              );
                            })()}
                          </Group>

                          <div style={{ flexGrow: 1 }} />

                          <Group justify="space-between" mb="md">
                            <Text size="sm" fw={500}>
                              Quantity:
                            </Text>
                            <Group gap={5}>
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => updateQuantity(product.product_id, getQuantity(product.product_id) - 1)}
                                disabled={getQuantity(product.product_id) <= 1}
                              >
                                <IconMinus size={14} />
                              </Button>
                              <NumberInput
                                value={getQuantity(product.product_id)}
                                onChange={(value) => updateQuantity(product.product_id, Number(value) || 1)}
                                min={1}
                                max={getCartAwareStock(product)}
                                size="xs"
                                w={60}
                                hideControls
                              />
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => updateQuantity(product.product_id, getQuantity(product.product_id) + 1)}
                                disabled={getQuantity(product.product_id) >= getCartAwareStock(product)}
                              >
                                <IconPlus size={14} />
                              </Button>
                            </Group>
                          </Group>

                          {(() => {
                            const cartAwareStock = getCartAwareStock(product);
                            const isOutOfStock = cartAwareStock <= 0;
                            
                            return (
                              <Button
                                fullWidth
                                leftSection={<IconShoppingCart size={16} />}
                                onClick={() => addToCart(product)}
                                disabled={isOutOfStock}
                                color={isOutOfStock ? "gray" : undefined}
                                style={{
                                  background: isOutOfStock ? 'var(--theme-disabled)' : 'var(--theme-primary-gradient)',
                                  border: 'none',
                                  fontWeight: 600,
                                  transition: 'all 0.3s ease',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isOutOfStock) {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.3)';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!isOutOfStock) {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                  }
                                }}
                              >
                                {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                              </Button>
                            );
                          })()}
                        </div>
                      </Card>
                    </GridCol>
                  ))}
                </Grid>
              </div>
            ))}
          </>
        )}

        {/* Pagination */}
        {!error && !loading && totalPages > 1 && (
          <div style={{ 
            marginTop: '3rem', 
            padding: '2rem 0',
            borderTop: '1px solid var(--theme-border)'
          }}>
            <Group justify="center" gap="lg">
              <div style={{ textAlign: 'center' }}>
                <Text size="sm" c="dimmed" mb="md">
                  Page {currentPage} of {totalPages} ({totalProducts} total products)
                </Text>
                <Pagination
                  value={currentPage}
                  onChange={handlePageChange}
                  total={totalPages}
                  size="lg"
                  radius="md"
                  styles={{
                    control: {
                      border: '1px solid var(--theme-border)',
                      '&[dataActive]': {
                        background: 'var(--theme-primary-gradient)',
                        borderColor: 'var(--theme-primary)',
                        color: 'white',
                        fontWeight: 600,
                      },
                      '&:hover:not([dataActive])': {
                        backgroundColor: 'var(--theme-background-secondary)',
                        borderColor: 'var(--theme-primary)',
                        color: 'var(--theme-primary)',
                      },
                      transition: 'all 0.2s ease',
                    }
                  }}
                />
              </div>
            </Group>
          </div>
        )}
      </Container>
      
      {/* RebelCart Footer */}
      <RebelShopFooter />
    </>
  );
}