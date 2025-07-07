'use client';

import { Box, Loader, Text, Center, Stack } from '@mantine/core';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  message?: string;
  color?: string;
  variant?: 'oval' | 'bars' | 'dots';
  fullScreen?: boolean;
  overlay?: boolean;
}

export default function LoadingSpinner({
  size = 'md',
  message,
  color = 'blue',
  variant = 'oval',
  fullScreen = false,
  overlay = false,
}: LoadingSpinnerProps) {
  const content = (
    <Center style={{ height: fullScreen ? '100vh' : 'auto' }}>
      <Stack align="center" gap="md">
        <Loader
          size={size}
          color={color}
          type={variant}
          style={{
            filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.1))',
          }}
        />
        {message && (
          <Text
            size="sm"
            c="dimmed"
            style={{
              color: 'var(--theme-text-secondary)',
              textAlign: 'center',
              marginTop: '8px',
            }}
          >
            {message}
          </Text>
        )}
      </Stack>
    </Center>
  );

  if (overlay) {
    return (
      <Box
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Box
          style={{
            backgroundColor: 'var(--theme-card)',
            padding: '32px',
            borderRadius: '12px',
            border: '1px solid var(--theme-border)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          }}
        >
          {content}
        </Box>
      </Box>
    );
  }

  return content;
}

// Specific loading components for common use cases
export function PageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <LoadingSpinner
      size="xl"
      message={message}
      fullScreen
      color="blue"
    />
  );
}

export function ComponentLoader({ message }: { message?: string }) {
  return (
    <LoadingSpinner
      size="md"
      message={message}
      color="blue"
    />
  );
}

export function ButtonLoader() {
  return (
    <Loader size="xs" color="white" type="dots" />
  );
}

export function OverlayLoader({ message = 'Please wait...' }: { message?: string }) {
  return (
    <LoadingSpinner
      size="lg"
      message={message}
      overlay
      color="blue"
    />
  );
}