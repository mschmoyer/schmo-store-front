'use client';

import { Button, ActionIcon, Tooltip, Group, Text } from '@mantine/core';
import { 
  IconBrandFacebook, 
  IconBrandTwitter, 
  IconBrandPinterest, 
  IconBrandLinkedin,
  IconBrandWhatsapp,
  IconMail,
  IconLink,
  IconShare
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { SocialPlatform, SOCIAL_PLATFORMS } from '@/lib/social-share-utils';

interface SocialShareButtonProps {
  platform: SocialPlatform;
  url: string;
  title?: string;
  description?: string;
  variant?: 'button' | 'icon';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showLabel?: boolean;
  onClick?: () => void;
}

const platformConfig = {
  [SOCIAL_PLATFORMS.FACEBOOK]: {
    icon: IconBrandFacebook,
    label: 'Facebook',
    color: '#1877F2',
  },
  [SOCIAL_PLATFORMS.TWITTER]: {
    icon: IconBrandTwitter,
    label: 'Twitter',
    color: '#1DA1F2',
  },
  [SOCIAL_PLATFORMS.PINTEREST]: {
    icon: IconBrandPinterest,
    label: 'Pinterest',
    color: '#BD081C',
  },
  [SOCIAL_PLATFORMS.LINKEDIN]: {
    icon: IconBrandLinkedin,
    label: 'LinkedIn',
    color: '#0A66C2',
  },
  [SOCIAL_PLATFORMS.WHATSAPP]: {
    icon: IconBrandWhatsapp,
    label: 'WhatsApp',
    color: '#25D366',
  },
  [SOCIAL_PLATFORMS.EMAIL]: {
    icon: IconMail,
    label: 'Email',
    color: '#EA4335',
  },
  [SOCIAL_PLATFORMS.COPY_LINK]: {
    icon: IconLink,
    label: 'Copy Link',
    color: '#6B7280',
  },
  [SOCIAL_PLATFORMS.INSTAGRAM]: {
    icon: IconShare,
    label: 'Instagram',
    color: '#E4405F',
  },
  [SOCIAL_PLATFORMS.TIKTOK]: {
    icon: IconShare,
    label: 'TikTok',
    color: '#000000',
  },
};

export function SocialShareButton({
  platform,
  url,
  title = '',
  description = '',
  variant = 'icon',
  size = 'md',
  showLabel = false,
  onClick
}: SocialShareButtonProps) {
  const config = platformConfig[platform];
  const IconComponent = config.icon;
  
  const generateSharingUrl = (platform: SocialPlatform): string => {
    const encodedUrl = encodeURIComponent(url);
    const encodedDescription = encodeURIComponent(description);
    
    switch (platform) {
      case SOCIAL_PLATFORMS.FACEBOOK:
        return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      
      case SOCIAL_PLATFORMS.TWITTER:
        const twitterText = `${title} ${description}`.trim();
        return `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodedUrl}`;
      
      case SOCIAL_PLATFORMS.PINTEREST:
        return `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedDescription}`;
      
      case SOCIAL_PLATFORMS.LINKEDIN:
        return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
      
      case SOCIAL_PLATFORMS.WHATSAPP:
        const whatsappText = `${title} - ${description} ${url}`;
        return `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
      
      case SOCIAL_PLATFORMS.EMAIL:
        const emailSubject = `Check out: ${title}`;
        const emailBody = `I found this and thought you might be interested:\n\n${title}\n${description}\n\nCheck it out: ${url}`;
        return `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      
      default:
        return url;
    }
  };
  
  const handleClick = async () => {
    if (onClick) {
      onClick();
    }
    
    if (platform === SOCIAL_PLATFORMS.COPY_LINK) {
      try {
        await navigator.clipboard.writeText(url);
        notifications.show({
          title: 'Copied!',
          message: 'Link copied to clipboard',
          color: 'green',
          autoClose: 2000,
        });
      } catch (err) {
        console.error('Failed to copy:', err);
        notifications.show({
          title: 'Error',
          message: 'Failed to copy link',
          color: 'red',
          autoClose: 3000,
        });
      }
      return;
    }
    
    const sharingUrl = generateSharingUrl(platform);
    
    // Open in new window
    const windowFeatures = 'width=600,height=400,scrollbars=yes,resizable=yes';
    window.open(sharingUrl, '_blank', windowFeatures);
  };
  
  if (variant === 'button') {
    return (
      <Button
        onClick={handleClick}
        leftSection={<IconComponent size={16} />}
        variant="outline"
        size={size}
        style={{
          borderColor: config.color,
          color: config.color,
          '--button-hover': `${config.color}15`,
        }}
      >
        {showLabel ? config.label : `Share on ${config.label}`}
      </Button>
    );
  }
  
  return (
    <Tooltip label={`Share on ${config.label}`} position="top">
      <ActionIcon
        onClick={handleClick}
        variant="outline"
        size={size}
        style={{
          borderColor: config.color,
          color: config.color,
          '--button-hover': `${config.color}15`,
        }}
      >
        <IconComponent size={size === 'xs' ? 12 : size === 'sm' ? 14 : size === 'lg' ? 20 : size === 'xl' ? 24 : 16} />
      </ActionIcon>
    </Tooltip>
  );
}

interface SocialShareGroupProps {
  platforms: SocialPlatform[];
  url: string;
  title?: string;
  description?: string;
  variant?: 'button' | 'icon';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  showLabels?: boolean;
  orientation?: 'horizontal' | 'vertical';
  gap?: number;
  onShare?: (platform: SocialPlatform) => void;
}

export function SocialShareGroup({
  platforms,
  url,
  title = '',
  description = '',
  variant = 'icon',
  size = 'md',
  showLabels = false,
  orientation = 'horizontal',
  gap = 8,
  onShare
}: SocialShareGroupProps) {
  return (
    <Group
      gap={gap}
      align="center"
      style={{
        flexDirection: orientation === 'vertical' ? 'column' : 'row',
      }}
    >
      {showLabels && variant === 'icon' && (
        <Text size="sm" c="dimmed">
          Share:
        </Text>
      )}
      
      {platforms.map((platform) => (
        <SocialShareButton
          key={platform}
          platform={platform}
          url={url}
          title={title}
          description={description}
          variant={variant}
          size={size}
          showLabel={showLabels}
          onClick={() => onShare?.(platform)}
        />
      ))}
    </Group>
  );
}