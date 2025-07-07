'use client';

import React from 'react';
import { 
  Grid, 
  Card, 
  Text, 
  Button, 
  Group, 
  Badge,
  Box,
  Stack,
  ColorSwatch,
  rem
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';

interface Theme {
  id: string;
  name: string;
  displayName: string;
  description: string;
  previewImage?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  isPopular?: boolean;
  isPremium?: boolean;
}

interface ThemeSelectorProps {
  selectedTheme: string;
  onThemeSelect: (themeId: string) => void;
  loading?: boolean;
}

export function ThemeSelector({ selectedTheme, onThemeSelect, loading = false }: ThemeSelectorProps) {
  const themes: Theme[] = [
    {
      id: 'default',
      name: 'default',
      displayName: 'Default Green',
      description: 'Clean and vibrant green theme perfect for any store',
      colors: {
        primary: '#22c55e',
        secondary: '#10b981',
        accent: '#059669',
        background: '#ffffff',
        text: '#171717'
      },
      isPopular: true
    },
    {
      id: 'ocean',
      name: 'ocean',
      displayName: 'Ocean Blue',
      description: 'Cool and calming blue tones like the ocean',
      colors: {
        primary: '#3b82f6',
        secondary: '#06b6d4',
        accent: '#0891b2',
        background: '#ffffff',
        text: '#0f172a'
      },
      isPopular: true
    },
    {
      id: 'sunset',
      name: 'sunset',
      displayName: 'Sunset Orange',
      description: 'Warm orange tones inspired by sunset colors',
      colors: {
        primary: '#f97316',
        secondary: '#fb923c',
        accent: '#f59e0b',
        background: '#ffffff',
        text: '#1c1917'
      }
    },
    {
      id: 'purple',
      name: 'purple',
      displayName: 'Royal Purple',
      description: 'Elegant purple theme for a luxurious feel',
      colors: {
        primary: '#8b5cf6',
        secondary: '#a78bfa',
        accent: '#c084fc',
        background: '#ffffff',
        text: '#1e1b4b'
      }
    },
    {
      id: 'dark',
      name: 'dark',
      displayName: 'Dark Mode',
      description: 'Modern dark theme for a sleek appearance',
      colors: {
        primary: '#22c55e',
        secondary: '#10b981',
        accent: '#059669',
        background: '#0a0a0a',
        text: '#ededed'
      }
    },
    {
      id: 'rose',
      name: 'rose',
      displayName: 'Rose Pink',
      description: 'Beautiful pink theme with romantic vibes',
      colors: {
        primary: '#f43f5e',
        secondary: '#fb7185',
        accent: '#f472b6',
        background: '#ffffff',
        text: '#1f2937'
      }
    },
    {
      id: 'teal',
      name: 'teal',
      displayName: 'Teal Mint',
      description: 'Fresh teal colors for a modern, clean look',
      colors: {
        primary: '#14b8a6',
        secondary: '#5eead4',
        accent: '#2dd4bf',
        background: '#ffffff',
        text: '#134e4a'
      }
    },
    {
      id: 'amber',
      name: 'amber',
      displayName: 'Amber Gold',
      description: 'Rich golden amber tones for warmth and luxury',
      colors: {
        primary: '#f59e0b',
        secondary: '#fbbf24',
        accent: '#fcd34d',
        background: '#ffffff',
        text: '#1f2937'
      }
    },
    {
      id: 'slate',
      name: 'slate',
      displayName: 'Slate Gray',
      description: 'Professional gray theme for corporate stores',
      colors: {
        primary: '#475569',
        secondary: '#64748b',
        accent: '#94a3b8',
        background: '#ffffff',
        text: '#0f172a'
      }
    },
    {
      id: 'crimson',
      name: 'crimson',
      displayName: 'Crimson Red',
      description: 'Bold red theme for high-energy brands',
      colors: {
        primary: '#dc2626',
        secondary: '#ef4444',
        accent: '#f87171',
        background: '#ffffff',
        text: '#1f2937'
      }
    }
  ];
  
  return (
    <Grid>
      {themes.map((theme) => (
        <Grid.Col key={theme.id} span={{ base: 12, sm: 6, md: 4 }}>
          <Card 
            shadow="sm" 
            padding="lg" 
            radius="md" 
            withBorder
            style={{ 
              cursor: 'pointer',
              borderColor: selectedTheme === theme.id ? theme.colors.primary : undefined,
              borderWidth: selectedTheme === theme.id ? '2px' : '1px'
            }}
            onClick={() => onThemeSelect(theme.id)}
          >
            <Card.Section>
              <Box
                h={120}
                style={{
                  background: `linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {selectedTheme === theme.id && (
                  <Box
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      borderRadius: '50%',
                      width: '30px',
                      height: '30px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <IconCheck 
                      style={{ 
                        width: rem(16), 
                        height: rem(16),
                        color: theme.colors.primary
                      }} 
                    />
                  </Box>
                )}
                
                <Text
                  size="lg"
                  fw={700}
                  c="white"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                >
                  {theme.displayName}
                </Text>
              </Box>
            </Card.Section>
            
            <Stack gap="sm" mt="md">
              <Group justify="space-between" align="flex-start">
                <Text fw={500} size="sm">
                  {theme.displayName}
                </Text>
                <Group gap="xs">
                  {theme.isPopular && (
                    <Badge color="blue" variant="light" size="xs">
                      Popular
                    </Badge>
                  )}
                  {theme.isPremium && (
                    <Badge color="gold" variant="light" size="xs">
                      Premium
                    </Badge>
                  )}
                </Group>
              </Group>
              
              <Text size="xs" c="dimmed">
                {theme.description}
              </Text>
              
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  Colors:
                </Text>
                <Group gap={4}>
                  <ColorSwatch color={theme.colors.primary} size={16} />
                  <ColorSwatch color={theme.colors.secondary} size={16} />
                  <ColorSwatch color={theme.colors.accent} size={16} />
                  <ColorSwatch color={theme.colors.background} size={16} />
                  <ColorSwatch color={theme.colors.text} size={16} />
                </Group>
              </Group>
              
              <Button
                variant={selectedTheme === theme.id ? 'filled' : 'light'}
                color={theme.colors.primary}
                size="sm"
                fullWidth
                mt="xs"
                loading={loading}
                onClick={(e) => {
                  e.stopPropagation();
                  onThemeSelect(theme.id);
                }}
              >
                {selectedTheme === theme.id ? 'Selected' : 'Select Theme'}
              </Button>
            </Stack>
          </Card>
        </Grid.Col>
      ))}
    </Grid>
  );
}