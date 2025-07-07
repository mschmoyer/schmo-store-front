'use client';

import { Card, Text, Title, ThemeIcon, Stack } from '@mantine/core';
import { ReactNode } from 'react';

interface FeatureCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  color?: string;
}

export function FeatureCard({ icon, title, description, color = 'blue' }: FeatureCardProps) {
  return (
    <Card 
      shadow="sm" 
      padding="lg" 
      radius="md" 
      withBorder 
      className="h-full transition-all duration-200 hover:shadow-lg hover:scale-105"
    >
      <Stack gap="md">
        <ThemeIcon size="xl" radius="md" color={color}>
          {icon}
        </ThemeIcon>
        
        <div>
          <Title order={3} size="h4" className="mb-2 text-gray-900 dark:text-white">
            {title}
          </Title>
          <Text size="sm" className="text-gray-600 dark:text-gray-300 leading-relaxed">
            {description}
          </Text>
        </div>
      </Stack>
    </Card>
  );
}