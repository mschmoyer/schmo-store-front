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
  IconRefresh,
  IconChevronDown,
  IconChevronUp
} from '@tabler/icons-react';
import { IntegrationConfiguration } from '@/types/database';

export interface Integration {
  id?: string;
  integrationType: 'shipstation' | 'stripe' | 'square' | 'paypal';
  isActive: boolean;
  hasApiKey: boolean;
  hasApiSecret?: boolean;
  configuration: IntegrationConfiguration;
  autoSyncEnabled?: boolean;
  autoSyncInterval?: '10min' | '1hour' | '1day';
}

interface IntegrationUpdateData extends Partial<Integration> {
  apiKey?: string;
  apiSecret?: string;
}

interface IntegrationSettingsProps {
  integration: Integration;
  onUpdate: (integrationType: string, data: IntegrationUpdateData) => Promise<void>;
  /** Called after a successful disconnect so the page can refetch its list. */
  onDisconnected?: () => void;
  loading?: boolean;
}

export function IntegrationSettings({ integration, onUpdate, onDisconnected, loading = false }: IntegrationSettingsProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [syncing, setSyncing] = useState({ products: false, inventory: false });
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [testingStored, setTestingStored] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(integration.isActive); // Start expanded if active, collapsed if inactive
  
  const form = useForm({
    initialValues: {
      apiKey: '',
      webhookUrl: integration.configuration?.webhook_url || '',
      apiSecret: '',  // API secret is stored separately, not in configuration
      endpointUrl: integration.configuration?.api_url || '',
      applicationId: String(integration.configuration?.custom_fields?.application_id || ''),
      clientSecret: String(integration.configuration?.custom_fields?.client_secret || ''),
      isActive: integration.isActive,
      autoSyncEnabled: integration.autoSyncEnabled || false,
      autoSyncInterval: integration.autoSyncInterval || '1hour',
    },
    validate: {
      apiKey: (value) => (!value ? 'API key is required' : null),
      apiSecret: () => {
        return null;
      },
    },
  });
  
  const integrationConfig = {
    shipstation: {
      /**
       * Routes backing the header actions. `connectedTest` must verify the
       * *stored* credential — `/api/admin/integrations/test` cannot, because it
       * requires an apiKey in the body, so it only ever proves that a key the
       * merchant just typed works.
       */
      connectedTest: '/api/admin/integrations/shipstation/test',
      disconnect: '/api/admin/integrations/shipstation',
      // One credential now does everything: catalogue and inventory in, orders out
      // over `POST /v2/shipments`, tracking back from `GET /v2/shipments`.
      name: 'ShipStation',
      description:
        'Imports products and inventory, sends your orders for fulfilment, and brings tracking back.',
      icon: IconPlug,
      apiKeyLabel: 'ShipStation API Key',
      apiKeyPlaceholder: 'ukyI...',
      docsUrl: 'https://docs.shipstation.com/',
      fields: [],
      supportsSyncing: true
    },
    stripe: {
      name: 'Stripe',
      description: 'Connect Stripe to process payments securely',
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
  
  // Handle case where integration type is not found in config
  if (!config) {
    return (
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Alert color="red" icon={<IconAlertCircle size="1rem" />}>
          Unknown integration type: {integration.integrationType}
        </Alert>
      </Card>
    );
  }
  
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
      const response = await fetch('/api/admin/integrations/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          integrationType: integration.integrationType,
          apiKey: form.values.apiKey,
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
  
  /**
   * Whether this card should offer Test and Disconnect rather than Connect.
   *
   * Both need a credential to act on, so an integration that is merely toggled
   * active without a key still shows Connect — offering "Test" with nothing to
   * test would report a failure the merchant cannot act on.
   */
  const endpoints = config as { connectedTest?: string; disconnect?: string };
  const isConnected = integration.isActive && integration.hasApiKey;

  /**
   * Verify the credential that is actually stored.
   *
   * Sends no body: the route falls back to the saved key, which is the thing the
   * merchant wants reassurance about. A test that only checks freshly typed
   * input cannot tell them whether the integration is working right now.
   */
  const handleTestStored = async () => {
    if (!endpoints.connectedTest) return;
    setTestingStored(true);
    try {
      const response = await fetch(endpoints.connectedTest, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await response.json();
      const ok = response.ok && data.success !== false;
      notifications.show({
        title: ok ? `${config.name} is working` : `${config.name} test failed`,
        message:
          data.data?.message ??
          data.message ??
          data.error ??
          (ok ? 'The stored credentials still work.' : 'The stored credentials were rejected.'),
        color: ok ? 'green' : 'red',
        icon: ok ? <IconCheck style={{ width: rem(18), height: rem(18) }} /> : undefined,
      });
    } catch {
      notifications.show({
        title: 'Error',
        message: `We couldn't reach the server to test ${config.name}.`,
        color: 'red',
      });
    } finally {
      setTestingStored(false);
    }
  };

  /**
   * Remove the stored credential after an explicit confirmation.
   *
   * Disconnecting stops catalogue sync and order push, so it asks first — this
   * button sits next to Test and a misclick would otherwise silently break
   * fulfilment.
   */
  const handleDisconnect = async () => {
    if (!endpoints.disconnect) return;
    const confirmed = window.confirm(
      `Disconnect ${config.name}?\n\nYour stored credentials are deleted. Catalogue sync stops and new orders are no longer sent for fulfilment until you reconnect.`
    );
    if (!confirmed) return;

    setDisconnecting(true);
    try {
      const response = await fetch(endpoints.disconnect, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        notifications.show({
          title: 'Could not disconnect',
          message: data.error ?? 'The server refused the request.',
          color: 'red',
        });
        return;
      }
      notifications.show({
        title: `${config.name} disconnected`,
        message: data.message ?? 'The stored credentials have been removed.',
        color: 'green',
      });
      onDisconnected?.();
    } catch {
      notifications.show({
        title: 'Error',
        message: `We couldn't reach the server to disconnect ${config.name}.`,
        color: 'red',
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = async (type: 'products' | 'inventory' | 'all') => {
    if (!integration.isActive || !integration.hasApiKey) {
      notifications.show({
        title: 'Error',
        message: 'Integration must be active and configured before syncing',
        color: 'red',
      });
      return;
    }
    
    if (type === 'all') {
      // Handle unified sync - sync products, inventory, warehouses, and locations
      setSyncing({ products: true, inventory: true });
      
      try {
        const response = await fetch('/api/admin/sync/all', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        const data = await response.json();
        
        if (data.success) {
          const { products, inventory, warehouses, locations } = data.data;
          notifications.show({
            title: 'Sync Complete',
            message: `All data synced: ${products?.totalCount || 0} products, ${inventory?.totalCount || 0} inventory items, ${warehouses?.totalCount || 0} warehouses, ${locations?.totalCount || 0} locations`,
            color: 'green',
            icon: <IconCheck style={{ width: rem(18), height: rem(18) }} />,
          });
        } else {
          notifications.show({
            title: 'Sync Failed',
            message: data.error || 'Failed to sync data',
            color: 'red',
          });
        }
      } catch (error) {
        notifications.show({
          title: 'Error',
          message: 'An error occurred while syncing data',
          color: 'red',
        });
        console.error('Sync all error:', error);
      } finally {
        setSyncing({ products: false, inventory: false });
      }
    } else {
      // Handle individual sync types
      setSyncing(prev => ({ ...prev, [type]: true }));
      
      try {
        const response = await fetch(`/api/admin/sync/${type}`, {
          method: 'POST',
          headers: {
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
        apiKey: String(values.apiKey || ''),
        apiSecret: String(values.apiSecret || ''),
        configuration: {
          webhook_url: String(values.webhookUrl || ''),
          api_url: String(values.endpointUrl || ''),
          custom_fields: {
            application_id: String(values.applicationId || ''),
            client_secret: String(values.clientSecret || ''),
          },
        },
        isActive: Boolean(values.isActive),
        autoSyncEnabled: Boolean(values.autoSyncEnabled),
        autoSyncInterval: values.autoSyncInterval as '10min' | '1hour' | '1day',
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
            <ThemeIcon variant="light" size="lg">
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
            {/* A connected integration offers the two things you actually want from
                one: prove it still works, and take it out. Leaving only "Connect"
                on an active card gave a merchant no way to do either. */}
            {isConnected ? (
              <>
                <Button
                  variant="light"
                  color="green"
                  size="sm"
                  loading={testingStored}
                  leftSection={<IconCheck style={{ width: rem(14), height: rem(14) }} />}
                  onClick={handleTestStored}
                >
                  Test
                </Button>
                <Button
                  variant="light"
                  color="red"
                  size="sm"
                  loading={disconnecting}
                  leftSection={<IconX style={{ width: rem(14), height: rem(14) }} />}
                  onClick={handleDisconnect}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                variant="filled"
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
                      {/* Distinct from the header's Test, which checks the key already
                          stored. This one checks the key being typed, before saving. */}
                      Test this key
                    </Button>
                  </Box>
                </Group>
                
                <Switch
                  label={`Enable ${config.name} integration`}
                  description="Activate this integration to start using its features"
                  {...form.getInputProps('isActive', { type: 'checkbox' })}
                />
                
                {config.fields.filter(field => field.key !== 'apiSecret').map((field) => {
                  // Use PasswordInput for sensitive fields like secrets
                  const isSecret = field.key.toLowerCase().includes('secret');
                  const InputComponent = isSecret ? PasswordInput : TextInput;
                  
                  return (
                    <InputComponent
                      key={field.key}
                      label={field.label}
                      placeholder={field.placeholder}
                      description={field.description}
                      required={false}
                      {...form.getInputProps(field.key)}
                    />
                  );
                })}
                
                
                {config.supportsSyncing && integration.isActive && integration.hasApiKey && (
                  <>
                    <Divider label="Data Synchronization" labelPosition="center" />
                    
                    <Group justify="space-between" align="flex-start">
                      <Stack gap="xs" style={{ flex: 0, minWidth: '200px' }}>
                        <Button
                          variant="filled"
                          color="ink"
                          leftSection={<IconRefresh size={16} />}
                          onClick={() => handleSync('all')}
                          loading={syncing.products || syncing.inventory}
                          fullWidth
                        >
                          Sync Data
                        </Button>
                        <Text size="xs" c="dimmed" ta="center">
                          Syncs products, inventory, warehouses, and locations
                        </Text>
                      </Stack>
                      
                      <Stack gap="xs" style={{ flex: 1, paddingLeft: '2rem' }}>
                        <Switch
                          label="Enable automatic sync"
                          description="Automatically sync products, inventory, warehouses, and locations at regular intervals"
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
              color="ink"
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