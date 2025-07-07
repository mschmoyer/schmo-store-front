'use client';

import { Text, Divider, Box } from '@mantine/core';
import { SocialShareGroup } from '@/components/ui/SocialShareButton';
import { EnhancedProduct } from '@/types/product';
import { SOCIAL_PLATFORMS, SocialPlatform, generateSocialSharingData, trackSocialShare } from '@/lib/social-share-utils';

interface ProductSharingProps {
  product: EnhancedProduct;
  baseUrl?: string;
  variant?: 'button' | 'icon';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  orientation?: 'horizontal' | 'vertical';
  showTitle?: boolean;
  customPlatforms?: SocialPlatform[];
}

export function ProductSharing({
  product,
  baseUrl = '',
  variant = 'icon',
  size = 'md',
  orientation = 'horizontal',
  showTitle = true,
  customPlatforms
}: ProductSharingProps) {
  // Don't show sharing if disabled for this product
  if (!product.social_sharing_enabled) {
    return null;
  }
  
  const defaultPlatforms: SocialPlatform[] = [
    SOCIAL_PLATFORMS.FACEBOOK,
    SOCIAL_PLATFORMS.TWITTER,
    SOCIAL_PLATFORMS.PINTEREST,
    SOCIAL_PLATFORMS.WHATSAPP,
    SOCIAL_PLATFORMS.EMAIL,
    SOCIAL_PLATFORMS.COPY_LINK
  ];
  
  const platforms = customPlatforms || defaultPlatforms;
  
  const sharingData = generateSocialSharingData(product, baseUrl);
  
  const handleShare = (platform: SocialPlatform) => {
    // Track the sharing event
    trackSocialShare(platform, product);
    
    // Send analytics event to our API
    fetch(`/api/products/${product.product_id}/analytics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: 'share',
        event_data: {
          platform,
          url: sharingData.url,
          title: sharingData.title,
          timestamp: new Date().toISOString()
        },
        user_agent: navigator.userAgent,
        referrer: document.referrer
      })
    }).catch(err => {
      console.warn('Failed to track sharing event:', err);
    });
  };
  
  return (
    <Box>
      {showTitle && (
        <>
          <Text size="sm" fw={500} mb="xs" c="dimmed">
            Share this product
          </Text>
          {orientation === 'horizontal' && <Divider mb="sm" />}
        </>
      )}
      
      <SocialShareGroup
        platforms={platforms}
        url={sharingData.url}
        title={sharingData.title}
        description={sharingData.description}
        variant={variant}
        size={size}
        orientation={orientation}
        showLabels={variant === 'button'}
        onShare={handleShare}
      />
      
      {orientation === 'vertical' && showTitle && <Divider mt="sm" />}
    </Box>
  );
}

interface ProductSharingStickyProps {
  product: EnhancedProduct;
  baseUrl?: string;
}

export function ProductSharingSticky({ product, baseUrl = '' }: ProductSharingStickyProps) {
  if (!product.social_sharing_enabled) {
    return null;
  }
  
  return (
    <Box
      style={{
        position: 'fixed',
        left: '20px',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 100,
        backgroundColor: 'var(--mantine-color-body)',
        border: '1px solid var(--mantine-color-default-border)',
        borderRadius: '12px',
        padding: '12px 8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        '@media (max-width: 768px)': {
          display: 'none'
        }
      }}
    >
      <ProductSharing
        product={product}
        baseUrl={baseUrl}
        variant="icon"
        size="sm"
        orientation="vertical"
        showTitle={false}
        customPlatforms={[
          SOCIAL_PLATFORMS.FACEBOOK,
          SOCIAL_PLATFORMS.TWITTER,
          SOCIAL_PLATFORMS.PINTEREST,
          SOCIAL_PLATFORMS.COPY_LINK
        ]}
      />
    </Box>
  );
}

interface ProductSharingModalProps {
  product: EnhancedProduct;
  baseUrl?: string;
}

export function ProductSharingModal({ 
  product, 
  baseUrl = ''
}: ProductSharingModalProps) {
  const sharingData = generateSocialSharingData(product, baseUrl);
  
  return (
    <Box p="lg">
      <Text size="lg" fw={600} mb="md">
        Share {product.display_name}
      </Text>
      
      <Box mb="lg">
        <Text size="sm" c="dimmed" mb="xs">
          Product URL:
        </Text>
        <Text
          size="sm"
          p="xs"
          style={{
            backgroundColor: 'var(--mantine-color-gray-1)',
            borderRadius: '4px',
            fontFamily: 'monospace',
            wordBreak: 'break-all'
          }}
        >
          {sharingData.url}
        </Text>
      </Box>
      
      <ProductSharing
        product={product}
        baseUrl={baseUrl}
        variant="button"
        size="md"
        orientation="vertical"
        showTitle={false}
      />
    </Box>
  );
}