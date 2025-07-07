'use client';

import { Box, SimpleGrid, Text, UnstyledButton, Group, Badge, Paper } from '@mantine/core';
import { IconCheck, IconPalette } from '@tabler/icons-react';
import { useState } from 'react';
import { themes, getThemeNames } from '@/lib/themes';

interface ThemeSelectorProps {
  value?: string;
  onChange?: (themeName: string) => void;
  size?: 'sm' | 'md' | 'lg';
  columns?: number;
  showNames?: boolean;
  allowNone?: boolean;
}

export default function ThemeSelector({
  value = 'default',
  onChange,
  size = 'md',
  columns = 3,
  showNames = true,
}: ThemeSelectorProps) {
  const [selectedTheme, setSelectedTheme] = useState(value);

  const handleThemeSelect = (themeName: string) => {
    setSelectedTheme(themeName);
    onChange?.(themeName);
  };

  const themeNames = getThemeNames();

  const getThemePreviewSize = () => {
    switch (size) {
      case 'sm': return { width: 80, height: 60 };
      case 'lg': return { width: 120, height: 90 };
      default: return { width: 100, height: 75 };
    }
  };

  const previewSize = getThemePreviewSize();

  return (
    <Box>
      {showNames && (
        <Group mb="md" align="center">
          <IconPalette size={20} style={{ color: 'var(--theme-text-secondary)' }} />
          <Text fw={600} style={{ color: 'var(--theme-text)' }}>
            Choose Your Store Theme
          </Text>
        </Group>
      )}

      <SimpleGrid cols={columns} spacing="md">
        {themeNames.map((themeName) => {
          const theme = themes[themeName];
          const isSelected = selectedTheme === themeName;

          return (
            <UnstyledButton
              key={themeName}
              onClick={() => handleThemeSelect(themeName)}
              style={{
                borderRadius: '12px',
                transition: 'all 0.2s ease',
                transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                filter: isSelected ? 'drop-shadow(0 4px 16px rgba(0, 0, 0, 0.1))' : 'none',
              }}
            >
              <Paper
                shadow={isSelected ? 'lg' : 'sm'}
                radius="md"
                p="sm"
                style={{
                  border: isSelected 
                    ? `2px solid ${theme.colors.primary}` 
                    : '2px solid var(--theme-border)',
                  backgroundColor: 'var(--theme-card)',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Theme Preview */}
                <Box
                  style={{
                    width: previewSize.width,
                    height: previewSize.height,
                    borderRadius: '8px',
                    overflow: 'hidden',
                    marginBottom: '8px',
                    position: 'relative',
                    background: theme.colors.heroGradient,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  {/* Mock header */}
                  <Box
                    style={{
                      height: '20%',
                      background: theme.colors.headerGradient,
                      position: 'relative',
                    }}
                  >
                    <Box
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '8px',
                        transform: 'translateY(-50%)',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: theme.colors.textOnPrimary,
                      }}
                    />
                  </Box>

                  {/* Mock content area */}
                  <Box p={4} style={{ height: '80%' }}>
                    {/* Mock primary button */}
                    <Box
                      style={{
                        width: '40%',
                        height: '8px',
                        backgroundColor: theme.colors.primary,
                        borderRadius: '2px',
                        marginBottom: '4px',
                      }}
                    />
                    
                    {/* Mock text lines */}
                    <Box
                      style={{
                        width: '60%',
                        height: '3px',
                        backgroundColor: theme.colors.textSecondary,
                        borderRadius: '1px',
                        marginBottom: '2px',
                        opacity: 0.6,
                      }}
                    />
                    <Box
                      style={{
                        width: '50%',
                        height: '3px',
                        backgroundColor: theme.colors.textMuted,
                        borderRadius: '1px',
                        marginBottom: '4px',
                        opacity: 0.4,
                      }}
                    />

                    {/* Mock secondary element */}
                    <Box
                      style={{
                        width: '30%',
                        height: '6px',
                        backgroundColor: theme.colors.secondary,
                        borderRadius: '2px',
                        marginTop: 'auto',
                      }}
                    />
                  </Box>

                  {/* Selected indicator */}
                  {isSelected && (
                    <Box
                      style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        backgroundColor: theme.colors.success,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                      }}
                    >
                      <IconCheck size={10} color="white" />
                    </Box>
                  )}
                </Box>

                {/* Theme Info */}
                <Box>
                  <Text
                    size="sm"
                    fw={isSelected ? 600 : 500}
                    style={{
                      color: isSelected ? theme.colors.primary : 'var(--theme-text)',
                      textAlign: 'center',
                      marginBottom: '4px',
                    }}
                  >
                    {theme.name}
                  </Text>

                  {/* Color palette preview */}
                  <Group gap={2} justify="center">
                    <Box
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: theme.colors.primary,
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                      }}
                    />
                    <Box
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: theme.colors.secondary,
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                      }}
                    />
                    <Box
                      style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: theme.colors.accent,
                        border: '1px solid rgba(0, 0, 0, 0.1)',
                      }}
                    />
                  </Group>

                  {isSelected && (
                    <Badge
                      size="xs"
                      color="green"
                      variant="filled"
                      style={{
                        marginTop: '8px',
                        alignSelf: 'center',
                        width: 'fit-content',
                        margin: '8px auto 0',
                      }}
                    >
                      Selected
                    </Badge>
                  )}
                </Box>
              </Paper>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}

// Compact theme selector for forms
export function CompactThemeSelector({
  value,
  onChange,
}: {
  value?: string;
  onChange?: (themeName: string) => void;
}) {
  return (
    <ThemeSelector
      value={value}
      onChange={onChange}
      size="sm"
      columns={4}
      showNames={false}
    />
  );
}

// Theme preview card
export function ThemePreviewCard({ 
  themeName, 
  isSelected,
  onClick 
}: { 
  themeName: string;
  isSelected?: boolean;
  onClick?: () => void;
}) {
  const theme = themes[themeName];

  return (
    <UnstyledButton onClick={onClick} style={{ width: '100%' }}>
      <Paper
        shadow={isSelected ? 'lg' : 'sm'}
        radius="lg"
        p="lg"
        style={{
          border: isSelected 
            ? `3px solid ${theme.colors.primary}` 
            : '1px solid var(--theme-border)',
          backgroundColor: 'var(--theme-card)',
          position: 'relative',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          transform: isSelected ? 'scale(1.02)' : 'scale(1)',
        }}
      >
        {/* Full theme preview */}
        <Box
          style={{
            width: '100%',
            height: '200px',
            borderRadius: '12px',
            overflow: 'hidden',
            background: theme.colors.heroGradient,
            border: `1px solid ${theme.colors.border}`,
            marginBottom: '16px',
            position: 'relative',
          }}
        >
          {/* Header with gradient */}
          <Box
            style={{
              height: '25%',
              background: theme.colors.headerGradient,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: '16px',
            }}
          >
            <Box
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                backgroundColor: theme.colors.textOnPrimary,
                marginRight: '8px',
              }}
            />
            <Box
              style={{
                width: '60px',
                height: '8px',
                backgroundColor: theme.colors.textOnPrimary,
                borderRadius: '2px',
                opacity: 0.9,
              }}
            />
          </Box>

          {/* Content area */}
          <Box p="md" style={{ height: '75%' }}>
            <Box
              style={{
                width: '80%',
                height: '16px',
                backgroundColor: theme.colors.primary,
                borderRadius: '4px',
                marginBottom: '12px',
              }}
            />
            
            <Box
              style={{
                width: '100%',
                height: '6px',
                backgroundColor: theme.colors.textSecondary,
                borderRadius: '2px',
                marginBottom: '4px',
                opacity: 0.7,
              }}
            />
            <Box
              style={{
                width: '85%',
                height: '6px',
                backgroundColor: theme.colors.textMuted,
                borderRadius: '2px',
                marginBottom: '12px',
                opacity: 0.5,
              }}
            />

            <Group gap="xs">
              <Box
                style={{
                  width: '40px',
                  height: '20px',
                  backgroundColor: theme.colors.secondary,
                  borderRadius: '4px',
                }}
              />
              <Box
                style={{
                  width: '40px',
                  height: '20px',
                  backgroundColor: theme.colors.accent,
                  borderRadius: '4px',
                }}
              />
            </Group>
          </Box>

          {isSelected && (
            <Box
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: theme.colors.success,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
              }}
            >
              <IconCheck size={14} color="white" />
            </Box>
          )}
        </Box>

        {/* Theme details */}
        <Text
          size="lg"
          fw={700}
          style={{
            color: isSelected ? theme.colors.primary : 'var(--theme-text)',
            marginBottom: '8px',
            textAlign: 'center',
          }}
        >
          {theme.name}
        </Text>

        <Group justify="center" gap="xs">
          {[theme.colors.primary, theme.colors.secondary, theme.colors.accent].map((color, index) => (
            <Box
              key={index}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                backgroundColor: color,
                border: '2px solid rgba(0, 0, 0, 0.1)',
              }}
            />
          ))}
        </Group>

        {isSelected && (
          <Badge
            size="sm"
            color="green"
            variant="filled"
            style={{
              marginTop: '12px',
              alignSelf: 'center',
              width: 'fit-content',
              margin: '12px auto 0',
            }}
          >
            Currently Selected
          </Badge>
        )}
      </Paper>
    </UnstyledButton>
  );
}