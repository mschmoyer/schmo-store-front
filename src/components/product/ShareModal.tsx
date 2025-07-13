'use client';

import React from 'react';
import { Modal, Stack, Button, Group, Text, CopyButton, ActionIcon, Tooltip } from '@mantine/core';
import { 
  IconBrandX, 
  IconBrandFacebook, 
  IconBrandPinterest, 
  IconBrandWhatsapp,
  IconMail,
  IconCopy,
  IconCheck
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

interface ShareModalProps {
  opened: boolean;
  onClose: () => void;
  productName: string;
  productUrl: string;
}

export function ShareModal({ opened, onClose, productName, productUrl }: ShareModalProps) {
  const shareUrl = typeof window !== 'undefined' ? window.location.origin + productUrl : productUrl;
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedName = encodeURIComponent(productName);
  
  const shareLinks = [
    {
      name: 'X (Twitter)',
      icon: IconBrandX,
      url: `https://twitter.com/intent/tweet?text=${encodedName}&url=${encodedUrl}`,
      color: '#000000'
    },
    {
      name: 'Facebook',
      icon: IconBrandFacebook,
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      color: '#1877f2'
    },
    {
      name: 'Pinterest',
      icon: IconBrandPinterest,
      url: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedName}`,
      color: '#e60023'
    },
    {
      name: 'WhatsApp',
      icon: IconBrandWhatsapp,
      url: `https://wa.me/?text=${encodedName}%20${encodedUrl}`,
      color: '#25d366'
    },
    {
      name: 'Email',
      icon: IconMail,
      url: `mailto:?subject=${encodedName}&body=Check%20out%20this%20product:%20${encodedUrl}`,
      color: '#6b7280'
    }
  ];

  const handleShare = (platform: string, url: string) => {
    window.open(url, '_blank', 'width=600,height=400');
    notifications.show({
      title: 'Shared!',
      message: `Product shared on ${platform}`,
      color: 'green',
    });
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: productName,
          url: shareUrl
        });
        notifications.show({
          title: 'Shared!',
          message: 'Product shared successfully',
          color: 'green',
        });
        onClose();
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Error sharing:', error);
        }
      }
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Share Product"
      size="sm"
      centered
      styles={{
        title: {
          color: 'var(--theme-text)',
          fontWeight: 600
        },
        header: {
          backgroundColor: 'var(--theme-background)',
          borderBottom: '1px solid var(--theme-border)'
        },
        content: {
          backgroundColor: 'var(--theme-background)'
        },
        body: {
          padding: '1.5rem'
        }
      }}
    >
      <Stack gap="lg">
        <Text size="sm" style={{ color: 'var(--theme-text-secondary)' }}>
          Share &quot;{productName}&quot; with your friends
        </Text>

        {typeof navigator !== 'undefined' && navigator.share && (
          <Button
            fullWidth
            size="md"
            onClick={handleNativeShare}
            style={{
              background: 'var(--theme-primary-gradient)',
              color: 'var(--theme-text-on-primary)',
              border: 'none',
              fontWeight: 600
            }}
          >
            Share via...
          </Button>
        )}

        <Stack gap="xs">
          {shareLinks.map((link) => (
            <Button
              key={link.name}
              variant="outline"
              fullWidth
              size="md"
              leftSection={<link.icon size={20} />}
              onClick={() => handleShare(link.name, link.url)}
              style={{
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-text)',
                backgroundColor: 'transparent',
                justifyContent: 'flex-start',
                '&:hover': {
                  backgroundColor: 'var(--theme-hover-overlay)'
                }
              }}
            >
              {link.name}
            </Button>
          ))}
        </Stack>

        <Group
          gap="xs"
          style={{
            padding: '0.75rem',
            backgroundColor: 'var(--theme-background-secondary)',
            borderRadius: '0.5rem',
            border: '1px solid var(--theme-border)'
          }}
        >
          <Text size="sm" style={{ flex: 1, color: 'var(--theme-text-secondary)' }}>
            {shareUrl}
          </Text>
          <CopyButton value={shareUrl} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy link'} withArrow position="top">
                <ActionIcon
                  color={copied ? 'teal' : 'gray'}
                  variant="subtle"
                  onClick={copy}
                >
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              </Tooltip>
            )}
          </CopyButton>
        </Group>
      </Stack>
    </Modal>
  );
}