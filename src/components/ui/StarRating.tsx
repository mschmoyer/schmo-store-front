'use client';

import { useState } from 'react';
import { Group, Box } from '@mantine/core';
import { IconStar, IconStarFilled } from '@tabler/icons-react';

interface StarRatingProps {
  value: number;
  onChange?: (rating: number) => void;
  readonly?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  count?: number;
  allowHalf?: boolean;
  showCount?: boolean;
}

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = 'md',
  color = 'orange',
  count,
  allowHalf = false,
  showCount = false
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  
  const sizeMap = {
    xs: 12,
    sm: 16,
    md: 20,
    lg: 24,
    xl: 28
  };
  
  const iconSize = sizeMap[size];
  const displayValue = hoverValue !== null ? hoverValue : value;
  
  const handleStarClick = (rating: number) => {
    if (!readonly && onChange) {
      onChange(rating);
    }
  };
  
  const handleStarHover = (rating: number) => {
    if (!readonly) {
      setHoverValue(rating);
    }
  };
  
  const handleMouseLeave = () => {
    if (!readonly) {
      setHoverValue(null);
    }
  };
  
  const getStarFill = (starIndex: number): number => {
    const starValue = starIndex + 1;
    
    if (displayValue >= starValue) {
      return 1; // Full star
    } else if (allowHalf && displayValue >= starValue - 0.5) {
      return 0.5; // Half star
    } else {
      return 0; // Empty star
    }
  };
  
  const renderStar = (index: number) => {
    const fill = getStarFill(index);
    
    if (fill === 1) {
      return (
        <IconStarFilled
          size={iconSize}
          style={{ color: `var(--mantine-color-${color}-5)` }}
        />
      );
    } else if (fill === 0.5) {
      return (
        <Box style={{ position: 'relative', display: 'inline-block' }}>
          <IconStar
            size={iconSize}
            style={{ color: `var(--mantine-color-gray-3)` }}
          />
          <Box
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '50%',
              overflow: 'hidden'
            }}
          >
            <IconStarFilled
              size={iconSize}
              style={{ color: `var(--mantine-color-${color}-5)` }}
            />
          </Box>
        </Box>
      );
    } else {
      return (
        <IconStar
          size={iconSize}
          style={{ color: `var(--mantine-color-gray-3)` }}
        />
      );
    }
  };
  
  return (
    <Group gap={2} align="center">
      <Group gap={1}>
        {Array.from({ length: 5 }, (_, index) => (
          <Box
            key={index}
            onClick={() => handleStarClick(index + 1)}
            onMouseEnter={() => handleStarHover(index + 1)}
            onMouseLeave={handleMouseLeave}
            style={{
              cursor: readonly ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            {renderStar(index)}
          </Box>
        ))}
      </Group>
      
      {showCount && count !== undefined && (
        <span style={{ 
          fontSize: size === 'xs' ? '0.75rem' : 
                   size === 'sm' ? '0.875rem' : 
                   size === 'lg' ? '1.125rem' : 
                   size === 'xl' ? '1.25rem' : '1rem',
          color: 'var(--mantine-color-dimmed)',
          marginLeft: '0.5rem'
        }}>
          ({count})
        </span>
      )}
    </Group>
  );
}