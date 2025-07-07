'use client';

import { Group, Container, Text, ActionIcon, Badge, Box } from '@mantine/core';
import { IconShoppingCart, IconUser } from '@tabler/icons-react';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function TopNav() {
  const [cartCount, setCartCount] = useState(0);
  const pathname = usePathname();
  
  // Extract store slug from pathname
  const getStoreSlug = () => {
    // Handle different URL patterns:
    // /[storeSlug] -> extract storeSlug
    // /store/[storeSlug] -> extract storeSlug  
    // /blog/[storeSlug] -> extract storeSlug
    const pathSegments = pathname?.split('/').filter(Boolean) || [];
    
    if (pathSegments.length === 1) {
      // Direct store slug: /demo-store
      return pathSegments[0];
    } else if (pathSegments.length >= 2) {
      // Nested routes: /store/demo-store, /blog/demo-store
      if (pathSegments[0] === 'store' || pathSegments[0] === 'blog') {
        return pathSegments[1];
      }
      // For admin or other routes, no store context
      return null;
    }
    
    return null;
  };
  
  const storeSlug = getStoreSlug();

  useEffect(() => {
    // Get cart count from localStorage
    const getCartCount = () => {
      if (typeof window !== 'undefined') {
        const cart = localStorage.getItem('cart');
        console.log('TopNav: Getting cart from localStorage:', cart);
        if (cart) {
          try {
            const cartData = JSON.parse(cart);
            console.log('TopNav: Parsed cart data:', cartData);
            const count = Array.isArray(cartData) 
              ? cartData.reduce((sum, item) => sum + (item.quantity || 1), 0)
              : 0;
            console.log('TopNav: Calculated cart count:', count);
            setCartCount(count);
          } catch (error) {
            console.error('TopNav: Error parsing cart data:', error);
            setCartCount(0);
          }
        } else {
          console.log('TopNav: No cart found in localStorage');
          setCartCount(0);
        }
      }
    };

    getCartCount();

    // Listen for storage changes to update cart count
    const handleStorageChange = (event?: Event | CustomEvent) => {
      console.log('TopNav: handleStorageChange called', event);
      getCartCount();
    };

    window.addEventListener('storage', handleStorageChange);
    
    // Custom event for cart updates within the same tab
    window.addEventListener('cartUpdated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('cartUpdated', handleStorageChange);
    };
  }, []);

  return (
    <Box
      style={{
        borderBottom: `1px solid var(--theme-border)`,
        background: `var(--theme-header-gradient)`,
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <Container size="xl" py="md">
        <Group justify="space-between" align="center">
          {/* Logo Section */}
          <Link href={storeSlug ? `/store/${storeSlug}` : '/store'} style={{ textDecoration: 'none' }}>
            <Group gap="sm" align="center" style={{ 
              transition: 'transform 0.2s ease'
            }}>
              <div style={{ 
                padding: '8px', 
                borderRadius: '50%', 
                backgroundColor: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.3s ease'
              }}>
                <Image
                  src="/logo.svg"
                  alt="Store Logo"
                  width={32}
                  height={32}
                  style={{ 
                    cursor: 'pointer',
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
                  }}
                />
              </div>
              <Text
                size="lg"
                fw={700}
                style={{ 
                  cursor: 'pointer',
                  textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  letterSpacing: '0.5px',
                  color: 'var(--theme-text-on-primary)'
                }}
                visibleFrom="sm"
              >
                Schmo Store
              </Text>
            </Group>
          </Link>

          {/* Navigation Links */}
          <Group gap="lg" visibleFrom="sm">
            <Link href={storeSlug ? `/store/${storeSlug}` : '/store'} style={{ textDecoration: 'none' }}>
              <Text
                size="md"
                fw={500}
                style={{
                  color: 'var(--theme-text-on-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  padding: '8px 16px',
                  borderRadius: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--theme-hoverOverlay)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Shop
              </Text>
            </Link>
            <Link href={storeSlug ? `/blog/${storeSlug}` : '/blog'} style={{ textDecoration: 'none' }}>
              <Text
                size="md"
                fw={500}
                style={{
                  color: 'var(--theme-text-on-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  padding: '8px 16px',
                  borderRadius: '8px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--theme-hoverOverlay)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Blog
              </Text>
            </Link>
          </Group>

          {/* Account and Cart Section */}
          <Group gap="sm">
            {/* Account Icon */}
            <Link href={storeSlug ? `/store/${storeSlug}/account` : '/account'} style={{ textDecoration: 'none' }}>
              <ActionIcon
                variant="subtle"
                size="lg"
                style={{ 
                  cursor: 'pointer',
                  backgroundColor: 'var(--theme-hoverOverlay)',
                  backdropFilter: 'blur(10px)',
                  border: `1px solid var(--theme-hoverOverlay)`,
                  borderRadius: '12px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--theme-hoverOverlay)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--theme-hoverOverlay)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <IconUser size={24} color="var(--theme-text-on-primary)" style={{ 
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
                }} />
              </ActionIcon>
            </Link>

            {/* Cart Icon */}
            <Link href={storeSlug ? `/store/${storeSlug}/cart` : '/cart'} style={{ textDecoration: 'none' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  style={{ 
                    cursor: 'pointer',
                    backgroundColor: 'var(--theme-hoverOverlay)',
                    backdropFilter: 'blur(10px)',
                    border: `1px solid var(--theme-hoverOverlay)`,
                    borderRadius: '12px',
                    transition: 'all 0.3s ease',
                    ':hover': {
                      backgroundColor: 'var(--theme-hoverOverlay)',
                      transform: 'translateY(-2px)'
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--theme-hoverOverlay)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--theme-hoverOverlay)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <IconShoppingCart size={24} color="var(--theme-text-on-primary)" style={{ 
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
                  }} />
                </ActionIcon>
                {cartCount > 0 && (
                  <Badge
                    size="xs"
                    variant="filled"
                    color="red"
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      minWidth: 20,
                      height: 20,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      fontWeight: 'bold',
                      padding: 0,
                      zIndex: 10,
                      backgroundColor: 'var(--theme-error)',
                      boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                      animation: 'pulse 2s infinite',
                      border: '2px solid var(--theme-text-on-primary)'
                    }}
                  >
                    {cartCount > 99 ? '99+' : cartCount}
                  </Badge>
                )}
              </div>
            </Link>
          </Group>
        </Group>
      </Container>
      
      {/* Add CSS animations */}
      <style jsx>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        
        .logo-hover:hover {
          transform: scale(1.05);
        }
        
        .cart-hover:hover {
          transform: translateY(-2px);
          background-color: rgba(255,255,255,0.2);
        }
      `}</style>
    </Box>
  );
}