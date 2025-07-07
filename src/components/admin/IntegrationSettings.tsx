'use client';

import React, { useState } from 'react';
import { 
  Card, 
  TextInput, 
  PasswordInput, 
  Button, 
  Group, 
  Stack, 
  Text, 
  Badge, 
  Alert,
  ThemeIcon,
  Box,
  rem,
  Switch,
  Select,
  Divider,
  Modal
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { 
  IconPlug, 
  IconCheck, 
  IconX, 
  IconAlertCircle,
  IconExternalLink,
  IconDatabase,
  IconPackage,
  IconChevronDown,
  IconChevronUp
} from '@tabler/icons-react';

interface Integration {
  id?: string;
  integrationType: 'shipengine' | 'stripe' | 'square' | 'paypal';
  isActive: boolean;
  hasApiKey: boolean;
  configuration: Record<string, unknown>;
  autoSyncEnabled?: boolean;
  autoSyncInterval?: '10min' | '1hour' | '1day';
}

interface IntegrationSettingsProps {
  integration: Integration;
  onUpdate: (integrationType: string, data: Record<string, unknown>) => Promise<void>;
  loading?: boolean;
}

export function IntegrationSettings({ integration, onUpdate, loading = false }: IntegrationSettingsProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState({ products: false, inventory: false });
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(integration.isActive); // Start expanded if active, collapsed if inactive
  
  const form = useForm({
    initialValues: {
      apiKey: '',
      webhookUrl: integration.configuration?.webhookUrl || '',
      isActive: integration.isActive,
      autoSyncEnabled: integration.autoSyncEnabled || false,
      autoSyncInterval: integration.autoSyncInterval || '1hour',
    },
    validate: {
      apiKey: (value) => (!value ? 'API key is required' : null),
    },
  });
  
  const integrationConfig = {
    shipengine: {
      name: 'ShipStation',
      description: 'Connect your ShipStation account to manage products and inventory',
      color: 'blue',
      icon: IconPlug,
      apiKeyLabel: 'ShipStation API Key',
      apiKeyPlaceholder: 'shipstation_live_...',
      docsUrl: 'https://docs.shipstation.com/',
      fields: [],
      supportsSyncing: true
    },
    stripe: {
      name: 'Stripe',
      description: 'Connect Stripe to process payments securely',
      color: 'indigo',
      icon: IconPlug,
      apiKeyLabel: 'Stripe Secret Key',
      apiKeyPlaceholder: 'sk_live_... or sk_test_...',
      docsUrl: 'https://stripe.com/docs/api',
      fields: [
        {
          key: 'webhookUrl',
          label: 'Webhook URL',
          placeholder: 'https://yourstore.com/api/webhooks/stripe',
          description: 'URL for Stripe to send webhook events'
        }
      ],
      supportsSyncing: false
    },
    square: {
      name: 'Square',
      description: 'Accept payments with Square - great for omnichannel businesses',
      color: 'dark',
      icon: IconPlug,
      apiKeyLabel: 'Square Access Token',
      apiKeyPlaceholder: 'sq0atp-...',
      docsUrl: 'https://developer.squareup.com/docs',
      fields: [
        {
          key: 'applicationId',
          label: 'Application ID',
          placeholder: 'sq0idp-...',
          description: 'Your Square application ID'
        }
      ],
      supportsSyncing: false
    },
    paypal: {
      name: 'PayPal',
      description: 'Accept PayPal payments - trusted by customers worldwide',
      color: 'blue',
      icon: IconPlug,
      apiKeyLabel: 'PayPal Client ID',
      apiKeyPlaceholder: 'AY...',
      docsUrl: 'https://developer.paypal.com/docs/api/',
      fields: [
        {
          key: 'clientSecret',
          label: 'Client Secret',
          placeholder: 'EL...',
          description: 'Your PayPal client secret'
        }
      ],
      supportsSyncing: false
    }
  };
  
  const config = integrationConfig[integration.integrationType];
  
  const handleTest = async () => {
    if (!form.values.apiKey) {
      notifications.show({
        title: 'Error',
        message: 'Please enter an API key first',
        color: 'red',
      });
      return;
    }
    
    setTesting(true);
    setTestResult(null);
    
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch('/api/admin/integrations/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          integrationType: integration.integrationType,
          apiKey: form.values.apiKey
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setTestResult({
          success: true,
          message: data.data?.message || 'Connection successful'
        });
        notifications.show({
          title: 'Success',
          message: data.data?.message || 'Connection test successful',
          color: 'green',
          icon: <IconCheck style={{ width: rem(18), height: rem(18) }} />,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Connection failed'
        });
        notifications.show({
          title: 'Connection Failed',
          message: data.error || 'Failed to connect to the API',
          color: 'red',
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: 'An error occurred while testing the connection'
      });
      notifications.show({
        title: 'Error',
        message: 'An error occurred while testing the connection',
        color: 'red',
      });
      console.error('Test integration error:', error);
    } finally {
      setTesting(false);
    }
  };
  
  const handleSync = async (type: 'products' | 'inventory') => {
    if (!integration.isActive || !integration.hasApiKey) {
      notifications.show({
        title: 'Error',
        message: 'Integration must be active and configured before syncing',
        color: 'red',
      });
      return;
    }
    
    setSyncing(prev => ({ ...prev, [type]: true }));
    
    try {
      const token = localStorage.getItem('admin_token');
      const response = await fetch(`/api/admin/sync/${type}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        const { addedCount, updatedCount, totalCount } = data.data;
        notifications.show({
          title: 'Sync Complete',
          message: `${type === 'products' ? 'Products' : 'Inventory'} sync completed: ${addedCount} added, ${updatedCount} updated (${totalCount} total)`,
          color: 'green',
          icon: <IconCheck style={{ width: rem(18), height: rem(18) }} />,
        });
      } else {
        notifications.show({
          title: 'Sync Failed',
          message: data.error || `Failed to sync ${type}`,
          color: 'red',
        });
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: `An error occurred while syncing ${type}`,
        color: 'red',
      });
      console.error(`Sync ${type} error:`, error);
    } finally {
      setSyncing(prev => ({ ...prev, [type]: false }));
    }
  };
  
  const handleSyncBoth = async () => {
    try {
      // Sync products first
      await handleSync('products');
      // Then sync inventory
      await handleSync('inventory');
    } catch (error) {
      console.error('Error syncing both:', error);
    }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      // Check if integration is being enabled for the first time
      const wasInactive = !integration.isActive;
      const willBeActive = values.isActive;
      const hasApiKey = values.apiKey;
      const supportsSync = config.supportsSyncing;
      
      await onUpdate(integration.integrationType, {
        apiKey: values.apiKey,
        configuration: {
          webhookUrl: values.webhookUrl,
        },
        isActive: values.isActive,
        autoSyncEnabled: values.autoSyncEnabled,
        autoSyncInterval: values.autoSyncInterval,
      });
      
      notifications.show({
        title: 'Success',
        message: `${config.name} integration updated successfully`,
        color: 'green',
        icon: <IconCheck style={{ width: rem(18), height: rem(18) }} />,
      });
      
      // If integration was just enabled and supports syncing, ask about initial sync
      if (wasInactive && willBeActive && hasApiKey && supportsSync) {
        setShowSyncModal(true);
      }
    } catch (error) {
      notifications.show({
        title: 'Error',
        message: `Failed to update ${config.name} integration`,
        color: 'red',
      });
      console.error('Update integration error:', error);
    }
  };
  
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Group>
            <ThemeIcon color={config.color} variant="light" size="lg">
              <config.icon style={{ width: rem(20), height: rem(20) }} />
            </ThemeIcon>
            <div>
              <Group gap="xs" align="center">
                <Text fw={600} size="lg">
                  {config.name}
                </Text>
                <Badge 
                  color={integration.isActive ? 'green' : 'gray'} 
                  variant="light"
                  leftSection={
                    integration.isActive 
                      ? <IconCheck style={{ width: rem(12), height: rem(12) }} />
                      : <IconX style={{ width: rem(12), height: rem(12) }} />
                  }
                >
                  {integration.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed">
                {config.description}
              </Text>
            </div>
          </Group>
          
          <Group gap="md">
            {/* Connect button for inactive integrations */}
            {!integration.isActive && (
              <Button
                variant="filled"
                color={config.color}
                size="sm"
                leftSection={<IconPlug style={{ width: rem(14), height: rem(14) }} />}
                onClick={() => setIsExpanded(true)}
              >
                Connect
              </Button>
            )}
            
            <Button
              variant="subtle"
              size="sm"
              rightSection={<IconExternalLink style={{ width: rem(14), height: rem(14) }} />}
              onClick={() => window.open(config.docsUrl, '_blank')}
            >
              Docs
            </Button>
            
            {/* Expand/Collapse button */}
            <Button
              variant="subtle"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              leftSection={
                isExpanded 
                  ? <IconChevronUp style={{ width: rem(14), height: rem(14) }} />
                  : <IconChevronDown style={{ width: rem(14), height: rem(14) }} />
              }
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </Button>
          </Group>
        </Group>
        
        
        {/* Collapsible configuration section */}
        {isExpanded && (
          <>
            {testResult && (
              <Alert
                color={testResult.success ? 'green' : 'red'}
                icon={
                  testResult.success 
                    ? <IconCheck size="1rem" />
                    : <IconAlertCircle size="1rem" />
                }
                variant="light"
              >
                {testResult.message}
              </Alert>
            )}
            
            <form onSubmit={form.onSubmit(handleSubmit)}>
              <Stack gap="md">
                <Group grow>
                  <PasswordInput
                    label={config.apiKeyLabel}
                    placeholder={config.apiKeyPlaceholder}
                    required
                    {...form.getInputProps('apiKey')}
                  />
                  <Box pt="xl">
                    <Button
                      variant="light"
                      onClick={handleTest}
                      loading={testing}
                      disabled={!form.values.apiKey}
                    >
                      Test Connection
                    </Button>
                  </Box>
                </Group>
                
                <Switch
                  label={`Enable ${config.name} integration`}
                  description="Activate this integration to start using its features"
                  {...form.getInputProps('isActive', { type: 'checkbox' })}
                />
                
                {config.fields.map((field) => (
                  <TextInput
                    key={field.key}
                    label={field.label}
                    placeholder={field.placeholder}
                    description={field.description}
                    {...form.getInputProps(field.key)}
                  />
                ))}
                
                
                {config.supportsSyncing && integration.isActive && integration.hasApiKey && (
                  <>
                    <Divider label="Data Synchronization" labelPosition="center" />
                    
                    <Group justify="space-between" align="flex-start">
                      <Stack gap="xs" style={{ flex: 0, minWidth: '200px' }}>
                        <Button
                          variant="filled"
                          color="blue"
                          leftSection={<IconPackage size={16} />}
                          onClick={() => handleSync('products')}
                          loading={syncing.products}
                          disabled={syncing.inventory}
                          fullWidth
                        >
                          Sync Products
                        </Button>
                        <Button
                          variant="filled"
                          color="blue"
                          leftSection={<IconDatabase size={16} />}
                          onClick={() => handleSync('inventory')}
                          loading={syncing.inventory}
                          disabled={syncing.products}
                          fullWidth
                        >
                          Sync Inventory
                        </Button>
                      </Stack>
                      
                      <Stack gap="xs" style={{ flex: 1, paddingLeft: '2rem' }}>
                        <Switch
                          label="Enable automatic sync"
                          description="Automatically sync products and inventory at regular intervals"
                          {...form.getInputProps('autoSyncEnabled', { type: 'checkbox' })}
                        />
                        
                        {form.values.autoSyncEnabled && (
                          <Select
                            label="Sync interval"
                            placeholder="Select sync frequency"
                            data={[
                              { value: '10min', label: 'Every 10 minutes' },
                              { value: '1hour', label: 'Every hour' },
                              { value: '1day', label: 'Once per day' }
                            ]}
                            {...form.getInputProps('autoSyncInterval')}
                            style={{ maxWidth: '250px' }}
                          />
                        )}
                      </Stack>
                    </Group>
                  </>
                )}
                
                <Group justify="space-between">
                  <Group>
                    <Text size="sm" c="dimmed">
                      Status:
                    </Text>
                    <Badge 
                      color={integration.hasApiKey ? 'green' : 'gray'} 
                      variant="light"
                    >
                      {integration.hasApiKey ? 'Configured' : 'Not Configured'}
                    </Badge>
                  </Group>
                  
                  <Button
                    type="submit"
                    loading={loading}
                    leftSection={<IconCheck style={{ width: rem(16), height: rem(16) }} />}
                  >
                    Save Integration
                  </Button>
                </Group>
              </Stack>
            </form>
          </>
        )}
      </Stack>
      
      <Modal
        opened={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        title="Initial Data Sync"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Your {config.name} integration is now active! Would you like to sync your products and inventory now to get started?
          </Text>
          
          <Group justify="flex-end" gap="sm">
            <Button 
              variant="default" 
              onClick={() => setShowSyncModal(false)}
            >
              Maybe Later
            </Button>
            <Button 
              color="blue"
              onClick={() => {
                setShowSyncModal(false);
                handleSyncBoth();
              }}
              loading={syncing.products || syncing.inventory}
            >
              Yes, Sync Now
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}