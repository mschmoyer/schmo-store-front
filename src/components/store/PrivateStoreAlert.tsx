'use client';

import { Alert } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

interface PrivateStoreAlertProps {
  storeSlug: string;
  isPrivate: boolean;
}

/**
 * Alert component that shows when a store is in private mode
 * @param storeSlug - The store's slug to check ownership
 * @param isPrivate - Whether the store is private
 */
export function PrivateStoreAlert({ storeSlug, isPrivate }: PrivateStoreAlertProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkOwnership = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        if (!token) {
          setIsLoading(false);
          return;
        }

        const response = await fetch('/api/admin/auth/verify', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data.user.store?.slug === storeSlug) {
            setIsOwner(true);
          }
        }
      } catch (error) {
        console.error('Error checking store ownership:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isPrivate) {
      checkOwnership();
    } else {
      setIsLoading(false);
    }
  }, [storeSlug, isPrivate]);

  // Don't show anything if store is public or still loading
  if (!isPrivate || isLoading) {
    return null;
  }

  return (
    <Alert
      variant="light"
      color={isOwner ? "blue" : "orange"}
      icon={isOwner ? <IconEye size={16} /> : <IconEyeOff size={16} />}
      title={isOwner ? "Store Preview Mode" : "Private Store"}
      styles={{
        root: {
          borderRadius: 0,
          border: 'none',
          borderBottom: `2px solid var(--mantine-color-${isOwner ? 'blue' : 'orange'}-3)`,
        }
      }}
    >
      {isOwner 
        ? "You are viewing your store in preview mode. This store is currently private and not visible to the public."
        : "This store is currently private and not available for public viewing."
      }
    </Alert>
  );
}