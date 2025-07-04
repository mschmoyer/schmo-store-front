'use client';

import { Group, Container, Text, ActionIcon, Badge, Box } from '@mantine/core';
import { IconShoppingCart, IconUser } from '@tabler/icons-react';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';

export default function TopNav() {
  const [cartCount, setCartCount] = useState(0);

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
        borderBottom: '1px solid #e0e0e0',
        background: 'linear-gradient(135deg, #166534 0%, #22c55e 100%)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <Container size="xl" py="md">
        <Group justify="space-between" align="center">
          {/* Logo Section */}
          <Link href="/store" style={{ textDecoration: 'none' }}>
            <Group gap="sm" align="center" style={{ 
              transition: 'transform 0.2s ease',
              ':hover': { transform: 'scale(1.05)' }
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
                c="white"
                style={{ 
                  cursor: 'pointer',
                  textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  letterSpacing: '0.5px'
                }}
                visibleFrom="sm"
              >
                Schmo Store
              </Text>
            </Group>
          </Link>

          {/* Account and Cart Section */}
          <Group gap="sm">
            {/* Account Icon */}
            <Link href="/account" style={{ textDecoration: 'none' }}>
              <ActionIcon
                variant="subtle"
                size="lg"
                color="white"
                style={{ 
                  cursor: 'pointer',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '12px',
                  transition: 'all 0.3s ease',
                  ':hover': {
                    backgroundColor: 'rgba(255,255,255,0.2)',
                    transform: 'translateY(-2px)'
                  }
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <IconUser size={24} color="white" style={{ 
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))'
                }} />
              </ActionIcon>
            </Link>

            {/* Cart Icon */}
            <Link href="/cart" style={{ textDecoration: 'none' }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  color="white"
                  style={{ 
                    cursor: 'pointer',
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '12px',
                    transition: 'all 0.3s ease',
                    ':hover': {
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      transform: 'translateY(-2px)'
                    }
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <IconShoppingCart size={24} color="white" style={{ 
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
                      boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                      animation: 'pulse 2s infinite',
                      border: '2px solid white'
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