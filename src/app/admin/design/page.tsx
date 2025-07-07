'use client';

import React, { useEffect, useState } from 'react';
import { 
  Stack, 
  Title, 
  Text, 
  Card, 
  TextInput, 
  Textarea, 
  Button, 
  Group,
  Alert,
  Loader,
  rem
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconPalette, IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { ThemeSelector } from '@/components/admin/ThemeSelector';

interface StoreConfig {
  name: string;
  description: string;
  heroTitle: string;
  heroDescription: string;
  themeId: string;
}

export default function DesignPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const form = useForm<StoreConfig>({
    initialValues: {
      name: '',
      description: '',
      heroTitle: '',
      heroDescription: '',
      themeId: 'default',
    },
    validate: {
      name: (value) => (!value ? 'Store name is required' : null),
    },
  });
  
  useEffect(() => {
    const fetchStoreConfig = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        if (!token) return;
        
        const response = await fetch('/api/admin/store-config', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const store = data.data.store;
            form.setValues({
              name: store.name || '',
              description: store.description || '',
              heroTitle: store.heroTitle || '',
              heroDescription: store.heroDescription || '',
              themeId: store.themeId || 'default',
            });
          } else {
            setError(data.error || 'Failed to load store configuration');
          }
        } else {
          setError('Failed to load store configuration');
        }
      } catch (err) {
        setError('An error occurred while loading store configuration');
        console.error('Store config error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchStoreConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  const handleSubmit = async (values: StoreConfig) => {
    setSaving(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;
      
      const response = await fetch('/api/admin/store-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: values.name,
          description: values.description,
          hero_title: values.heroTitle,
          hero_description: values.heroDescription,
          theme_id: values.themeId,
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          notifications.show({
            title: 'Success',
            message: 'Store configuration updated successfully',
            color: 'green',
            icon: <IconCheck style={{ width: rem(18), height: rem(18) }} />,
          });
        } else {
          setError(data.error || 'Failed to update store configuration');
        }
      } else {
        setError('Failed to update store configuration');
      }
    } catch (err) {
      setError('An error occurred while updating store configuration');
      console.error('Store config update error:', err);
    } finally {
      setSaving(false);
    }
  };
  
  const handleThemeSelect = (themeId: string) => {
    form.setFieldValue('themeId', themeId);
  };
  
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <Loader size="lg" />
        <Text mt="md" c="dimmed">
          Loading store configuration...
        </Text>
      </div>
    );
  }
  
  return (
    <Stack gap="lg">
      <div>
        <Title order={1} mb="xs">
          <Group gap="sm">
            <IconPalette style={{ width: rem(28), height: rem(28) }} />
            Page Design
          </Group>
        </Title>
        <Text c="dimmed">
          Customize your store&apos;s appearance, theme, and content to match your brand.
        </Text>
      </div>
      
      {error && (
        <Alert
          icon={<IconAlertCircle size="1rem" />}
          color="red"
          variant="light"
          mb="md"
        >
          {error}
        </Alert>
      )}
      
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="lg">
          {/* Store Information */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={3} mb="md">
              Store Information
            </Title>
            
            <Stack gap="md">
              <TextInput
                label="Store Name"
                placeholder="Your Amazing Store"
                required
                {...form.getInputProps('name')}
              />
              
              <Textarea
                label="Store Description"
                placeholder="Brief description of your store..."
                rows={3}
                {...form.getInputProps('description')}
              />
            </Stack>
          </Card>
          
          {/* Hero Section */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={3} mb="md">
              Homepage Hero Section
            </Title>
            
            <Stack gap="md">
              <TextInput
                label="Hero Title"
                placeholder="Welcome to Our Store"
                {...form.getInputProps('heroTitle')}
              />
              
              <Textarea
                label="Hero Description"
                placeholder="Discover amazing products and exceptional service..."
                rows={3}
                {...form.getInputProps('heroDescription')}
              />
            </Stack>
          </Card>
          
          {/* Theme Selection */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={3} mb="md">
              Theme Selection
            </Title>
            <Text size="sm" c="dimmed" mb="lg">
              Choose a theme that matches your brand and style. You can change this at any time.
            </Text>
            
            <ThemeSelector
              selectedTheme={form.values.themeId}
              onThemeSelect={handleThemeSelect}
              loading={saving}
            />
          </Card>
          
          {/* Save Button */}
          <Group justify="flex-end">
            <Button
              type="submit"
              loading={saving}
              leftSection={<IconCheck style={{ width: rem(16), height: rem(16) }} />}
            >
              Save Changes
            </Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}