'use client';

import { Group, Container, Text, ActionIcon, Badge, Box, Select } from '@mantine/core';
import { IconShoppingCart, IconUser, IconPalette } from '@tabler/icons-react';
import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { getThemeNames, themes } from '@/lib/themes';

export default function TopNav() {
  const [cartCount, setCartCount] = useState(0);
  const { themeName, setTheme } = useTheme();

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

          {/* Theme Selector, Account and Cart Section */}
          <Group gap="sm">
            {/* Theme Selector */}
            <Select
              placeholder="Theme"
              data={getThemeNames().map(key => ({
                value: key,
                label: themes[key].name
              }))}
              value={themeName}
              onChange={(value) => value && setTheme(value)}
              leftSection={<IconPalette size={16} />}
              size="sm"
              w={140}
              comboboxProps={{
                transitionProps: { transition: 'pop', duration: 200 },
              }}
              styles={{
                input: {
                  backgroundColor: 'var(--theme-card)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid var(--theme-border)',
                  borderRadius: '8px',
                  color: 'var(--theme-text)',
                  '&::placeholder': {
                    color: 'var(--theme-text-muted)',
                    opacity: 0.7,
                  },
                },
                section: {
                  color: 'var(--theme-text)',
                },
                dropdown: {
                  backgroundColor: 'var(--theme-card)',
                  border: '1px solid var(--theme-border)',
                  color: 'var(--theme-text)',
                },
                option: {
                  color: 'var(--theme-text) !important',
                  backgroundColor: 'transparent',
                  '&[data-selected]': {
                    backgroundColor: 'var(--theme-background-tertiary) !important',
                    color: 'var(--theme-text) !important',
                    fontWeight: '600 !important',
                  },
                  '&[data-hovered]': {
                    backgroundColor: 'var(--theme-primary-dark) !important',
                    color: 'var(--theme-text-on-primary) !important',
                  },
                  '&:hover': {
                    backgroundColor: 'var(--theme-primary-dark) !important',
                    color: 'var(--theme-text-on-primary) !important',
                  },
                  '&:focus': {
                    backgroundColor: 'var(--theme-primary-dark) !important',
                    color: 'var(--theme-text-on-primary) !important',
                  },
                },
              }}
            />
            {/* Account Icon */}
            <Link href="/account" style={{ textDecoration: 'none' }}>
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
                <IconUser size={24} color="var(--theme-text-on-primary)" style={{ 
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