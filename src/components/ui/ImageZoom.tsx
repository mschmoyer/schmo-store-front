'use client';

import { useState, useRef, useCallback } from 'react';
import { Box, Image, Modal, CloseButton, ActionIcon } from '@mantine/core';
import { IconZoomIn, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useIntersection } from '@mantine/hooks';

interface ImageZoomProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  zoomScale?: number;
  showZoomIcon?: boolean;
  gallery?: string[];
  initialIndex?: number;
}

export function ImageZoom({
  src,
  alt,
  width,
  height,
  className,
  zoomScale = 2,
  showZoomIcon = true,
  gallery = [],
  initialIndex = 0
}: ImageZoomProps) {
  const [modalOpened, setModalOpened] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref: intersectionRef, entry } = useIntersection({
    threshold: 0.1,
  });
  
  const images = gallery.length > 0 ? gallery : [src];
  const currentImage = images[currentIndex];
  
  const handleImageClick = useCallback(() => {
    setModalOpened(true);
    setZoomLevel(1);
  }, []);
  
  const handleModalClose = useCallback(() => {
    setModalOpened(false);
    setZoomLevel(1);
  }, []);
  
  const handleZoomClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (zoomLevel === 1) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      
      setZoomOrigin({ x, y });
      setZoomLevel(zoomScale);
    } else {
      setZoomLevel(1);
    }
  }, [zoomLevel, zoomScale]);
  
  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
    setZoomLevel(1);
  }, [images.length]);
  
  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
    setZoomLevel(1);
  }, [images.length]);
  
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleModalClose();
    } else if (event.key === 'ArrowLeft') {
      handlePrevious();
    } else if (event.key === 'ArrowRight') {
      handleNext();
    }
  }, [handleModalClose, handlePrevious, handleNext]);
  
  return (
    <>
      <Box
        ref={(node) => {
          containerRef.current = node;
          intersectionRef(node);
        }}
        style={{
          position: 'relative',
          cursor: 'zoom-in',
          borderRadius: '8px',
          overflow: 'hidden',
          ...((width || height) && {
            width: width ? `${width}px` : 'auto',
            height: height ? `${height}px` : 'auto',
          }),
        }}
        onClick={handleImageClick}
        className={className}
      >
        <Image
          src={entry?.isIntersecting ? src : undefined}
          alt={alt}
          width={width}
          height={height}
          fit="contain"
          style={{
            transition: 'transform 0.3s ease',
            ':hover': {
              transform: 'scale(1.02)',
            },
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        />
        
        {showZoomIcon && (
          <Box
            style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              borderRadius: '50%',
              padding: '0.5rem',
              opacity: 0,
              transition: 'opacity 0.2s ease',
            }}
            className="zoom-icon"
          >
            <IconZoomIn size={16} color="white" />
          </Box>
        )}
        
        <style jsx>{`
          .zoom-icon {
            opacity: 0;
          }
          
          ${containerRef.current ? `
            div:hover .zoom-icon {
              opacity: 1;
            }
          ` : ''}
        `}</style>
      </Box>
      
      <Modal
        opened={modalOpened}
        onClose={handleModalClose}
        size="xl"
        padding={0}
        withCloseButton={false}
        centered
        overlayProps={{
          backgroundOpacity: 0.9,
          blur: 3,
        }}
        onKeyDown={handleKeyDown}
      >
        <Box
          style={{
            position: 'relative',
            backgroundColor: 'black',
            minHeight: '60vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Close button */}
          <CloseButton
            size="lg"
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              zIndex: 1000,
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
            }}
            onClick={handleModalClose}
          />
          
          {/* Navigation buttons for gallery */}
          {images.length > 1 && (
            <>
              <ActionIcon
                size="xl"
                variant="filled"
                color="white"
                style={{
                  position: 'absolute',
                  left: '1rem',
                  zIndex: 1000,
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  color: 'black',
                }}
                onClick={handlePrevious}
              >
                <IconChevronLeft size={24} />
              </ActionIcon>
              
              <ActionIcon
                size="xl"
                variant="filled"
                color="white"
                style={{
                  position: 'absolute',
                  right: '1rem',
                  zIndex: 1000,
                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                  color: 'black',
                }}
                onClick={handleNext}
              >
                <IconChevronRight size={24} />
              </ActionIcon>
            </>
          )}
          
          {/* Image counter */}
          {images.length > 1 && (
            <Box
              style={{
                position: 'absolute',
                top: '1rem',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '1rem',
                fontSize: '0.875rem',
              }}
            >
              {currentIndex + 1} / {images.length}
            </Box>
          )}
          
          {/* Zoomable image */}
          <Box
            onClick={handleZoomClick}
            style={{
              cursor: zoomLevel === 1 ? 'zoom-in' : 'zoom-out',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            <Image
              src={currentImage}
              alt={alt}
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
                transform: `scale(${zoomLevel})`,
                transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                transition: 'transform 0.3s ease',
              }}
            />
          </Box>
          
          {/* Zoom instruction */}
          <Box
            style={{
              position: 'absolute',
              bottom: '1rem',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '1rem',
              fontSize: '0.75rem',
              opacity: 0.8,
            }}
          >
            {zoomLevel === 1 ? 'Click to zoom in' : 'Click to zoom out'}
          </Box>
        </Box>
      </Modal>
    </>
  );
}