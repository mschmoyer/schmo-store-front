'use client';

import { useState, useCallback } from 'react';
import { Box, Group, Image, ActionIcon, Paper, Skeleton } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconMaximize } from '@tabler/icons-react';
import { useIntersection } from '@mantine/hooks';
import { ImageZoom } from '@/components/ui/ImageZoom';
import { ProductImage } from '@/types/product';

interface ProductGalleryProps {
  images: ProductImage[];
  productName: string;
  onImageClick?: (index: number) => void;
}

export function ProductGallery({ images, productName, onImageClick }: ProductGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState<Record<number, boolean>>({});
  const { ref: intersectionRef, entry } = useIntersection({
    threshold: 0.1,
  });
  
  const currentImage = images[currentIndex];
  const hasMultipleImages = images.length > 1;
  
  const handlePrevious = useCallback(() => {
    setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length]);
  
  const handleNext = useCallback(() => {
    setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length]);
  
  const handleThumbnailClick = useCallback((index: number) => {
    setCurrentIndex(index);
    onImageClick?.(index);
  }, [onImageClick]);
  
  const handleImageLoad = (index: number) => {
    setImageLoading(prev => ({ ...prev, [index]: false }));
  };
  
  const handleImageLoadStart = (index: number) => {
    setImageLoading(prev => ({ ...prev, [index]: true }));
  };
  
  if (!images || images.length === 0) {
    return (
      <Box ref={intersectionRef}>
        <Paper shadow="sm" radius="md" p="lg" withBorder>
          <Skeleton height={400} radius="md" />
        </Paper>
      </Box>
    );
  }
  
  return (
    <Box ref={intersectionRef}>
      {/* Main Image Display */}
      <Paper shadow="sm" radius="md" withBorder mb="md" style={{ position: 'relative', overflow: 'hidden' }}>
        {imageLoading[currentIndex] && (
          <Box 
            style={{ 
              position: 'absolute', 
              top: 0, 
              left: 0, 
              right: 0, 
              bottom: 0, 
              zIndex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Skeleton height={400} width="100%" radius="md" />
          </Box>
        )}
        
        <ImageZoom
          src={entry?.isIntersecting ? currentImage.url : ''}
          alt={currentImage.alt || productName}
          width={500}
          height={400}
          gallery={images.map(img => img.url)}
          initialIndex={currentIndex}
          showZoomIcon={true}
        />
        
        {/* Navigation Arrows for Multiple Images */}
        {hasMultipleImages && (
          <>
            <ActionIcon
              size="lg"
              variant="filled"
              color="white"
              style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                color: 'black',
                zIndex: 2,
              }}
              onClick={handlePrevious}
            >
              <IconChevronLeft size={20} />
            </ActionIcon>
            
            <ActionIcon
              size="lg"
              variant="filled"
              color="white"
              style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                color: 'black',
                zIndex: 2,
              }}
              onClick={handleNext}
            >
              <IconChevronRight size={20} />
            </ActionIcon>
          </>
        )}
        
        {/* Image Counter */}
        {hasMultipleImages && (
          <Box
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              padding: '0.25rem 0.75rem',
              borderRadius: '1rem',
              fontSize: '0.75rem',
              zIndex: 2,
            }}
          >
            {currentIndex + 1} / {images.length}
          </Box>
        )}
        
        {/* Full Screen Icon */}
        <ActionIcon
          size="sm"
          variant="filled"
          color="dark"
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            zIndex: 2,
          }}
          onClick={() => onImageClick?.(currentIndex)}
        >
          <IconMaximize size={14} />
        </ActionIcon>
      </Paper>
      
      {/* Thumbnail Navigation */}
      {hasMultipleImages && (
        <Group gap="xs" justify="center">
          {images.map((image, index) => (
            <Paper
              key={image.id || index}
              shadow={index === currentIndex ? "md" : "xs"}
              radius="sm"
              p={2}
              withBorder
              style={{
                cursor: 'pointer',
                border: index === currentIndex 
                  ? '2px solid var(--mantine-color-primary-5)' 
                  : '1px solid var(--mantine-color-default-border)',
                transition: 'all 0.2s ease',
                opacity: index === currentIndex ? 1 : 0.7,
                transform: index === currentIndex ? 'scale(1.05)' : 'scale(1)',
              }}
              onClick={() => handleThumbnailClick(index)}
              onMouseEnter={(e) => {
                if (index !== currentIndex) {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }
              }}
              onMouseLeave={(e) => {
                if (index !== currentIndex) {
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              {imageLoading[index] ? (
                <Skeleton width={60} height={60} radius="sm" />
              ) : (
                <Image
                  src={entry?.isIntersecting ? image.url : ''}
                  alt={image.alt || `${productName} view ${index + 1}`}
                  width={60}
                  height={60}
                  fit="cover"
                  radius="sm"
                  onLoad={() => handleImageLoad(index)}
                  onLoadStart={() => handleImageLoadStart(index)}
                />
              )}
            </Paper>
          ))}
        </Group>
      )}
      
      {/* Image Caption */}
      {currentImage.caption && (
        <Box mt="xs" ta="center">
          <Box 
            component="p" 
            style={{ 
              fontSize: '0.875rem', 
              color: 'var(--mantine-color-dimmed)',
              margin: 0,
              fontStyle: 'italic'
            }}
          >
            {currentImage.caption}
          </Box>
        </Box>
      )}
    </Box>
  );
}