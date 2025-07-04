'use client';

import { useState, useEffect } from 'react';
import { Card, Group, Text, Badge, Button, NumberInput, Image, Grid, Container, Title, Loader, Center, Alert, Pagination } from '@mantine/core';
import { IconMinus, IconPlus, IconShoppingCart, IconCheck } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

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


export default function StorePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, Product[]>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [inventoryData, setInventoryData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [pageSize] = useState(50);

  // Fetch products from ShipStation API
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const query = new URLSearchParams({
          page: currentPage.toString(),
          page_size: pageSize.toString(),
          sort_dir: 'ASC',
          sort_by: 'SKU',
          show_inactive: 'false'
        }).toString();

        const resp = await fetch(`/api/products?${query}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!resp.ok) {
          throw new Error(`HTTP error! status: ${resp.status}`);
        }

        const data = await resp.json();
        
        // Check if response contains an error
        if (data.error) {
          throw new Error(data.message || data.error);
        }
        
        // Update pagination info
        setTotalPages(data.pages || 1);
        setTotalProducts(data.total || data.products?.length || 0);
        
        console.log('Pagination info:', { 
          currentPage: data.page || 1, 
          totalPages: data.pages || 1, 
          totalProducts: data.total || data.products?.length || 0, 
          pageSize: data.page_size || pageSize,
          actualProductsReceived: data.products?.length || 0
        });
        
        // Filter and transform products for marketplace use
        const marketplaceProducts = data.products
          .filter((product: Product) => product.thumbnail_url) // Only show products with images
          .map((product: Product) => ({
            ...product,
            price: product.customs_value?.amount || 29.99, // Use customs value or default price
            available_stock: Math.floor(Math.random() * 50) + 1, // Random stock for demo
            thumbnail_url: product.thumbnail_url || "/placeholder-product.jpg",
            category: product.product_category?.name || "Other" // Use product_category.name or default to "Other"
          }));

        setProducts(marketplaceProducts);
        
        // Group products by category
        const categorizedProducts = marketplaceProducts.reduce((acc: Record<string, Product[]>, product: Product) => {
          const category = product.category || "Other";
          if (!acc[category]) {
            acc[category] = [];
          }
          acc[category].push(product);
          return acc;
        }, {});
        
        setProductsByCategory(categorizedProducts);
        
        // If API didn't provide total, estimate based on current page data
        if (!data.total && marketplaceProducts.length > 0) {
          const estimatedTotal = currentPage === 1 ? marketplaceProducts.length : currentPage * pageSize;
          setTotalProducts(estimatedTotal);
          console.log('Estimated total products:', estimatedTotal);
        }
        
        // Fetch inventory for each product
        await fetchInventoryForProducts(marketplaceProducts);
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

    const fetchInventoryForProducts = async (productList: Product[]) => {
      try {
        // Get all SKUs from products for matching later
        const productSkus = productList.map(product => product.sku).filter(Boolean);
        console.log('Product SKUs to match:', productSkus);
        
        // Fetch ALL inventory data without SKU filter
        console.log('Fetching all inventory data...');
        
        const response = await fetch(`/api/inventory?group_by=warehouse`);
        
        if (response.ok) {
          const inventoryResponse = await response.json();
          console.log('All inventory response:', inventoryResponse);
          
          // Create inventory map from response
          const inventoryMap: Record<string, number> = {};
          
          if (inventoryResponse.inventory && Array.isArray(inventoryResponse.inventory)) {
            inventoryResponse.inventory.forEach((item: InventoryItem) => {
              if (item.sku) {
                // Sum available inventory across all warehouses for this SKU
                inventoryMap[item.sku] = (inventoryMap[item.sku] || 0) + (item.available || 0);
              }
            });
          }
          
          console.log('All inventory map from API:', inventoryMap);
          
          // Create final map with only our product SKUs, defaulting missing ones to 0
          const finalInventoryMap: Record<string, number> = {};
          productSkus.forEach(sku => {
            finalInventoryMap[sku] = inventoryMap[sku] || 0;
            if (inventoryMap[sku] !== undefined) {
              console.log(`Matched SKU ${sku}: ${inventoryMap[sku]} available`);
            } else {
              console.log(`No inventory found for SKU ${sku}, defaulting to 0`);
            }
          });
          
          console.log('Final matched inventory map:', finalInventoryMap);
          setInventoryData(finalInventoryMap);
        } else {
          const errorData = await response.json();
          console.error('Error fetching all inventory:', response.status, errorData);
          
          // Fallback: set all product SKUs to 0 inventory
          const fallbackMap = productSkus.reduce((acc, sku) => {
            acc[sku] = 0;
            return acc;
          }, {} as Record<string, number>);
          
          setInventoryData(fallbackMap);
        }
      } catch (error) {
        console.error('Error in fetchInventoryForProducts:', error);
        
        // Fallback: set all product SKUs to 0 inventory
        const productSkus = productList.map(product => product.sku).filter(Boolean);
        const fallbackMap = productSkus.reduce((acc, sku) => {
          acc[sku] = 0;
          return acc;
        }, {} as Record<string, number>);
        
        setInventoryData(fallbackMap);
      }
    };

    fetchProducts();
  }, [currentPage, pageSize]);

  const handlePageChange = (page: number) => {
    setLoading(true);
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getQuantity = (productId: string) => quantities[productId] || 1;

  const updateQuantity = (productId: string, value: number) => {
    setQuantities(prev => ({
      ...prev,
      [productId]: Math.max(1, value)
    }));
  };

  const addToCart = (product: Product) => {
    const quantity = getQuantity(product.product_id);
    
    console.log('Adding to cart:', { product: product.name, quantity });
    
    // Get existing cart from localStorage
    const existingCartString = localStorage.getItem('cart');
    console.log('Existing cart string from localStorage:', existingCartString);
    
    const existingCart = JSON.parse(existingCartString || '[]') as CartItem[];
    console.log('Parsed existing cart:', existingCart);
    
    // Check if product already exists in cart
    const existingItemIndex = existingCart.findIndex(item => item.product_id === product.product_id);
    console.log('Existing item index:', existingItemIndex);
    
    if (existingItemIndex >= 0) {
      // Update quantity of existing item
      existingCart[existingItemIndex].quantity += quantity;
      console.log('Updated existing item quantity:', existingCart[existingItemIndex]);
    } else {
      // Add new item to cart
      const cartItem: CartItem = {
        product_id: product.product_id,
        name: product.name,
        price: product.price || 0,
        quantity: quantity,
        thumbnail_url: product.thumbnail_url || "/placeholder-product.jpg"
      };
      existingCart.push(cartItem);
      console.log('Added new item to cart:', cartItem);
    }
    
    console.log('Final cart before saving:', existingCart);
    
    // Save updated cart to localStorage
    localStorage.setItem('cart', JSON.stringify(existingCart));
    
    // Verify it was saved
    const savedCart = localStorage.getItem('cart');
    console.log('Verified saved cart:', savedCart);
    
    // Show success toast
    notifications.show({
      title: 'Added to Cart!',
      message: `${product.name} has been added to your cart.`,
      color: 'green',
      icon: <IconCheck size="1rem" />,
      autoClose: 3000,
    });
    
    // Double-check the cart was actually saved
    setTimeout(() => {
      const doubleCheckCart = localStorage.getItem('cart');
      console.log('Store page: Double-checking cart after 100ms:', doubleCheckCart);
    }, 100);
    
    // Update cart count (emit custom event to notify other components)
    window.dispatchEvent(new CustomEvent('cartUpdated', { detail: existingCart }));
    console.log('Dispatched cartUpdated event with:', existingCart);
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
          <Loader size="lg" />
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
              Premium Products
            </Title>
            <Text size="xl" c="dimmed" style={{ 
              fontSize: '1.25rem',
              lineHeight: 1.6,
              maxWidth: '600px',
              margin: '0 auto'
            }}>
              Discover our carefully curated selection of high-quality products, 
              designed to meet your every need with style and functionality.
            </Text>
          </div>
        </Container>
      </div>

      <Container size="xl" py="lg">
        {/* Product Count and Pagination Info */}
        {!error && !loading && (
          <div style={{ marginBottom: '2rem' }}>
            <Group justify="space-between" align="center">
              <Text size="lg" c="dimmed">
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

        {error ? (
          <Alert color="red" title="Unable to Load Products" mb="md">
            <Text size="sm" mb="md">{error}</Text>
            <Text size="xs" c="dimmed">
              Please check your ShipStation API configuration or try again later.
            </Text>
          </Alert>
        ) : products.length === 0 ? (
          <Alert color="blue" title="No Products Available" mb="md">
            <Text size="sm">No products found in your ShipStation catalog.</Text>
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
                  borderBottom: '3px solid #22c55e',
                  background: 'linear-gradient(90deg, rgba(34, 197, 94, 0.1) 0%, rgba(34, 197, 94, 0.05) 50%, transparent 100%)',
                  borderRadius: '8px 8px 0 0'
                }}>
                  <Title order={2} c="dark" style={{ 
                    margin: 0,
                    fontSize: '1.8rem',
                    fontWeight: 700,
                    color: '#1f2937',
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
                    <Grid.Col key={product.product_id} span={{ base: 12, sm: 6, md: 4 }}>
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
                          background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
                          border: '1px solid #e9ecef',
                          ':hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
                            borderColor: '#22c55e'
                          }
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
                        <Card.Section style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
                          <Image
                            src={product.thumbnail_url}
                            height={284}
                            width={284}
                            fit="contain"
                            alt={product.name}
                            fallbackSrc="https://via.placeholder.com/284x284?text=No+Image"
                            style={{ maxHeight: '284px', maxWidth: '284px', objectFit: 'contain', borderRadius: '8px' }}
                          />
                        </Card.Section>

                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                          <Text fw={500} size="lg" lineClamp={1} mt="md" mb="xs">
                            {product.name}
                          </Text>

                          {product.description && (
                            <Text size="sm" c="dimmed" lineClamp={2} mb="md">
                              {product.description}
                            </Text>
                          )}

                          <Group justify="space-between" align="center" mb="md">
                            <Text size="xl" fw={700} c="blue">
                              {formatPrice(product.price || 0)}
                            </Text>
                            {(() => {
                              const stockLevel = inventoryData[product.sku];
                              const isOutOfStock = stockLevel === undefined || stockLevel === 0;
                              
                              return (
                                <Badge 
                                  color={isOutOfStock ? "red" : "blue"} 
                                  variant={isOutOfStock ? "filled" : "light"}
                                >
                                  {isOutOfStock ? "Out of Stock" : `${stockLevel} left`}
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
                                max={inventoryData[product.sku] || 0}
                                size="xs"
                                w={60}
                                hideControls
                              />
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => updateQuantity(product.product_id, getQuantity(product.product_id) + 1)}
                                disabled={getQuantity(product.product_id) >= (inventoryData[product.sku] || 0)}
                              >
                                <IconPlus size={14} />
                              </Button>
                            </Group>
                          </Group>

                          {(() => {
                            const stockLevel = inventoryData[product.sku];
                            const isOutOfStock = stockLevel === undefined || stockLevel === 0;
                            
                            return (
                              <Button
                                fullWidth
                                leftSection={<IconShoppingCart size={16} />}
                                onClick={() => addToCart(product)}
                                disabled={isOutOfStock}
                                color={isOutOfStock ? "gray" : undefined}
                                style={{
                                  background: isOutOfStock ? '#6c757d' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                  border: 'none',
                                  fontWeight: 600,
                                  transition: 'all 0.3s ease',
                                  ':hover': {
                                    transform: 'translateY(-2px)',
                                    boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
                                  }
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
                    </Grid.Col>
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
            borderTop: '1px solid #e9ecef'
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
                      border: '1px solid #e9ecef',
                      '&[data-active]': {
                        background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        borderColor: '#22c55e',
                        color: 'white',
                        fontWeight: 600,
                      },
                      '&:hover:not([data-active])': {
                        backgroundColor: '#f0fdf4',
                        borderColor: '#22c55e',
                        color: '#22c55e',
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
    </div>
  );
}