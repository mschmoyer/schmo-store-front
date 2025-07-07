'use client';

import { Breadcrumbs, Anchor, Text } from '@mantine/core';
import { IconHome, IconBuildingStore } from '@tabler/icons-react';
import Link from 'next/link';
import { EnhancedProduct } from '@/types/product';

interface ProductBreadcrumbsProps {
  product: EnhancedProduct;
}

export function ProductBreadcrumbs({ product }: ProductBreadcrumbsProps) {
  const category = product.product_category?.name || product.category;
  
  const items = [
    {
      title: 'Home',
      href: '/',
      icon: <IconHome size={14} />
    },
    {
      title: 'Store',
      href: '/store',
      icon: <IconBuildingStore size={14} />
    }
  ];
  
  // Add category if available and meaningful
  if (category && category !== 'Other') {
    items.push({
      title: category,
      href: `/store?category=${encodeURIComponent(category)}`,
      icon: null
    });
  }
  
  // Add current product (not clickable)
  items.push({
    title: product.display_name,
    href: '',
    icon: null
  });
  
  return (
    <Breadcrumbs
      separatorMargin="xs"
      mb="lg"
      styles={{
        breadcrumb: {
          fontSize: '0.875rem',
          color: 'var(--mantine-color-dimmed)',
        },
        separator: {
          color: 'var(--mantine-color-dimmed)',
        }
      }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        
        if (isLast) {
          // Last item (current product) - not clickable
          return (
            <Text 
              key={item.title}
              size="sm" 
              c="dark"
              fw={500}
              lineClamp={1}
              style={{ maxWidth: '200px' }}
            >
              {item.title}
            </Text>
          );
        }
        
        return (
          <Anchor
            key={item.title}
            component={Link}
            href={item.href}
            size="sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              textDecoration: 'none',
              color: 'var(--mantine-color-dimmed)',
              transition: 'color 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--mantine-color-primary-6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--mantine-color-dimmed)';
            }}
          >
            {item.icon}
            <span>{item.title}</span>
          </Anchor>
        );
      })}
    </Breadcrumbs>
  );
}