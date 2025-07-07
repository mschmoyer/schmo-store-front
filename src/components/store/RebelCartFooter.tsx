'use client';

import React from 'react';
import Link from 'next/link';
import { Text } from '@mantine/core';
import { RebelCartLogo } from '@/components/ui/RebelCartLogo';

export function RebelCartFooter() {
  return (
    <footer className="mt-16 py-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-center">
          <Link 
            href="/" 
            className="flex items-center gap-2 opacity-60 hover:opacity-80 transition-opacity duration-200"
          >
            <Text size="xs" c="dimmed">
              Powered by
            </Text>
            <RebelCartLogo 
              size={20} 
              showText={false}
            />
            <Text size="xs" fw={500} c="dimmed">
              RebelCart
            </Text>
          </Link>
        </div>
      </div>
    </footer>
  );
}