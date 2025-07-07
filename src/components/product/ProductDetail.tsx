'use client';

import { useState, useEffect } from 'react';
import { 
  Container, 
  Grid, 
  Box, 
  Divider, 
  Tabs,
  Paper,
  Stack
} from '@mantine/core';
import { ProductGallery } from './ProductGallery';
import { ProductInfo } from './ProductInfo';
import { ProductReviews } from './ProductReviews';
import { ProductSharing, ProductSharingSticky } from './ProductSharing';
import { ProductRecommendations } from './ProductRecommendations';
import { ProductBreadcrumbs } from './ProductBreadcrumbs';
import { EnhancedProduct } from '@/types/product';
import { ReviewSummary, NewReview } from '@/types/review';

interface ProductDetailProps {
  product: EnhancedProduct;
  reviews: ReviewSummary;
  recommendations?: EnhancedProduct[];
  baseUrl?: string;
}

export function ProductDetail({ 
  product, 
  reviews, 
  recommendations = [],
  baseUrl = ''
}: ProductDetailProps) {
  // Use recommendations to avoid unused variable warning
  void recommendations;
  const [activeTab, setActiveTab] = useState<string | null>('description');
  
  // Track product view
  useEffect(() => {
    // Track product view event
    fetch(`/api/products/${product.product_id}/analytics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'view',
        event_data: {
          product_name: product.display_name,
          product_category: product.product_category?.name || product.category,
          price: product.display_price,
          timestamp: new Date().toISOString()
        },
        user_agent: navigator.userAgent,
        referrer: document.referrer
      })
    }).catch(err => {
      console.warn('Failed to track product view:', err);
    });
  }, [product.product_id, product.display_name, product.product_category, product.category, product.display_price]);
  
  const handleSubmitReview = async (review: NewReview) => {
    // TODO: Implement review submission API call
    // For now, just log the review
    console.log('Submitting review:', review);
    
    // In a real implementation, this would make an API call to submit the review
    // await fetch(`/api/products/${product.product_id}/reviews`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(review)
    // });
    
    throw new Error('Review submission not implemented yet. Database setup required.');
  };
  
  const handleHelpfulVote = async (reviewId: string, isHelpful: boolean) => {
    // TODO: Implement helpful vote API call
    console.log('Helpful vote:', { reviewId, isHelpful });
    
    // In a real implementation, this would make an API call
    // await fetch(`/api/products/${product.product_id}/reviews/${reviewId}/helpful`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ is_helpful: isHelpful })
    // });
  };
  
  return (
    <>
      {/* Sticky Social Sharing */}
      <ProductSharingSticky product={product} baseUrl={baseUrl} />
      
      <Container size="xl" py="lg">
        {/* Breadcrumbs */}
        <ProductBreadcrumbs product={product} />
        
        {/* Main Product Section */}
        <Grid gutter="xl" mb="xl">
          {/* Product Gallery */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <ProductGallery
              images={product.display_images}
              productName={product.display_name}
              onImageClick={(index) => {
                // Track gallery interaction
                fetch(`/api/products/${product.product_id}/analytics`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    event_type: 'gallery_interaction',
                    event_data: { image_index: index },
                    user_agent: navigator.userAgent
                  })
                }).catch(console.warn);
              }}
            />
          </Grid.Col>
          
          {/* Product Info */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <ProductInfo 
              product={product}
              onQuantityChange={(quantity) => {
                console.log('Quantity changed:', quantity);
              }}
              onAddToCart={(item) => {
                console.log('Added to cart:', item);
              }}
            />
          </Grid.Col>
        </Grid>
        
        {/* Social Sharing */}
        <Paper shadow="xs" radius="md" p="lg" withBorder mb="xl">
          <ProductSharing 
            product={product} 
            baseUrl={baseUrl}
            variant="button"
            size="sm"
            orientation="horizontal"
            showTitle={true}
          />
        </Paper>
        
        <Divider mb="xl" />
        
        {/* Detailed Information Tabs */}
        <Tabs value={activeTab} onChange={setActiveTab} mb="xl">
          <Tabs.List mb="lg">
            <Tabs.Tab value="description">
              Description
            </Tabs.Tab>
            
            {product.specifications && Object.keys(product.specifications).length > 0 && (
              <Tabs.Tab value="specifications">
                Specifications
              </Tabs.Tab>
            )}
            
            <Tabs.Tab value="reviews">
              Reviews ({reviews.total_reviews})
            </Tabs.Tab>
            
            {(product.shipping_info || product.return_policy || product.warranty_info) && (
              <Tabs.Tab value="policies">
                Policies
              </Tabs.Tab>
            )}
          </Tabs.List>
          
          <Tabs.Panel value="description">
            <Paper shadow="xs" radius="md" p="lg" withBorder>
              <Box
                style={{ lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{
                  __html: product.display_description || 'No description available.'
                }}
              />
              
              {product.features && product.features.length > 0 && (
                <Box mt="lg">
                  <h3>Key Features</h3>
                  <ul style={{ lineHeight: 1.6 }}>
                    {product.features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </Box>
              )}
            </Paper>
          </Tabs.Panel>
          
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <Tabs.Panel value="specifications">
              <Paper shadow="xs" radius="md" p="lg" withBorder>
                <Grid>
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <Grid.Col span={{ base: 12, sm: 6 }} key={key}>
                      <Box
                        style={{
                          padding: '1rem',
                          backgroundColor: 'var(--mantine-color-gray-0)',
                          borderRadius: '8px',
                          marginBottom: '0.5rem'
                        }}
                      >
                        <Box style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                          {key}
                        </Box>
                        <Box style={{ color: 'var(--mantine-color-dimmed)' }}>
                          {value}
                        </Box>
                      </Box>
                    </Grid.Col>
                  ))}
                </Grid>
              </Paper>
            </Tabs.Panel>
          )}
          
          <Tabs.Panel value="reviews">
            <ProductReviews
              productId={product.product_id}
              productName={product.display_name}
              reviews={reviews.recent_reviews || []}
              summary={reviews}
              onSubmitReview={handleSubmitReview}
              onHelpfulVote={handleHelpfulVote}
              showReviewForm={true}
            />
          </Tabs.Panel>
          
          {(product.shipping_info || product.return_policy || product.warranty_info) && (
            <Tabs.Panel value="policies">
              <Paper shadow="xs" radius="md" p="lg" withBorder>
                <Stack gap="lg">
                  {product.shipping_info && (
                    <Box>
                      <h3>Shipping Information</h3>
                      <Box style={{ lineHeight: 1.6 }}>
                        {product.shipping_info}
                      </Box>
                    </Box>
                  )}
                  
                  {product.return_policy && (
                    <Box>
                      <h3>Return Policy</h3>
                      <Box style={{ lineHeight: 1.6 }}>
                        {product.return_policy}
                      </Box>
                    </Box>
                  )}
                  
                  {product.warranty_info && (
                    <Box>
                      <h3>Warranty Information</h3>
                      <Box style={{ lineHeight: 1.6 }}>
                        {product.warranty_info}
                      </Box>
                    </Box>
                  )}
                </Stack>
              </Paper>
            </Tabs.Panel>
          )}
        </Tabs>
        
        <Divider mb="xl" />
        
        {/* Recommended Products */}
        <ProductRecommendations
          productId={product.product_id}
          category={product.product_category?.name || product.category}
          title="You May Also Like"
          limit={4}
        />
      </Container>
    </>
  );
}