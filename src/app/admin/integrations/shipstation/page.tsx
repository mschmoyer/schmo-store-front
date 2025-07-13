'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { 
  Stack, 
  Title, 
  Text, 
  Card,
  Group,
  TextInput,
  PasswordInput,
  Button,
  Alert,
  Switch,
  Loader,
  ActionIcon,
  Code,
  rem,
  Divider,
  Paper,
  List,
  ThemeIcon
} from '@mantine/core';
import { 
  IconShip, 
  IconAlertCircle, 
  IconCheck, 
  IconCopy,
  IconRefresh,
  IconExternalLink,
  IconKey,
  IconSettings,
  IconInfoCircle,
  IconCircleCheck,
  IconCircleX
} from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { 
  generateSecurePassword, 
  generateSecureApiKey, 
  generateStoreUsername, 
  generateEndpointUrl,
  copyToClipboard as copyTextToClipboard
} from '@/lib/shipstation/utils';

interface ShipStationConfig {
  id?: string;
  isActive: boolean;
  username: string;
  password: string;
  apiKey: string;
  apiSecret: string;
  endpointUrl: string;
  storeId?: string;
  autoSyncEnabled: boolean;
  autoSyncInterval: '10min' | '1hour' | '1day';
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export default function ShipStationIntegrationPage() {
  const [config, setConfig] = useState<ShipStationConfig>({
    isActive: false,
    username: '',
    password: '',
    apiKey: '',
    apiSecret: '',
    endpointUrl: '',
    autoSyncEnabled: false,
    autoSyncInterval: '1hour'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ShipStationConfig>({
    initialValues: config,
    validate: {
      username: (value) => value.trim() === '' ? 'Username is required' : null,
      password: (value) => value.trim() === '' ? 'Password is required' : null,
      apiKey: (value) => {
        // Skip validation if using existing masked key
        if (hasExistingConfig && !apiKeyModified && value === '••••••••••••••••') return null;
        return value.trim() === '' ? 'API Key is required' : null;
      },
      apiSecret: () => null, // API Secret is optional for ShipStation
      endpointUrl: (value) => {
        if (value.trim() === '') return 'Endpoint URL is required';
        try {
          new URL(value);
          return null;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    }
  });

  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;
      
      const response = await fetch('/api/admin/integrations/shipstation', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          const configData = data.data;
          setConfig(configData);
          
          // Check if we have existing API credentials
          if (configData.apiKey) {
            setHasExistingConfig(true);
            setOriginalApiKey(configData.apiKey);
            if (configData.apiSecret) {
              setOriginalApiSecret(configData.apiSecret);
            }
            
            // Set form values with masked API credentials
            form.setValues({
              ...configData,
              apiKey: '••••••••••••••••',
              apiSecret: configData.apiSecret ? '••••••••••••••••' : configData.apiSecret || ''
            });
          } else {
            form.setValues(configData);
          }
        }
      } else {
        setError('Failed to load ShipStation configuration');
      }
    } catch (err) {
      setError('An error occurred while loading configuration');
      console.error('ShipStation config error:', err);
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const generateCredentials = () => {
    const newCredentials = {
      username: generateStoreUsername(config.storeId),
      password: generateSecurePassword(24),
      apiKey: generateSecureApiKey(32),
      apiSecret: generateSecureApiKey(32)
    };

    form.setFieldValue('username', newCredentials.username);
    form.setFieldValue('password', newCredentials.password);
    form.setFieldValue('apiKey', newCredentials.apiKey);
    form.setFieldValue('apiSecret', newCredentials.apiSecret);

    // Generate endpoint URL if not set
    if (!form.values.endpointUrl) {
      const baseUrl = window.location.origin;
      form.setFieldValue('endpointUrl', generateEndpointUrl(baseUrl, config.storeId));
    }

    
    notifications.show({
      title: 'Credentials Generated',
      message: 'New secure credentials have been generated. Make sure to save them!',
      color: 'green',
      icon: <IconCheck size="1rem" />
    });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await copyTextToClipboard(text);
      notifications.show({
        title: 'Copied!',
        message: `${label} copied to clipboard`,
        color: 'blue',
        icon: <IconCopy size="1rem" />
      });
    } catch {
      notifications.show({
        title: 'Copy Failed',
        message: 'Failed to copy to clipboard',
        color: 'red',
        icon: <IconAlertCircle size="1rem" />
      });
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;
      
      const response = await fetch('/api/admin/integrations/shipstation/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: form.values.username,
          password: form.values.password,
          apiKey: apiKeyModified ? form.values.apiKey : originalApiKey,
          apiSecret: apiSecretModified ? form.values.apiSecret : originalApiSecret,
          endpointUrl: form.values.endpointUrl
        })
      });
      
      const data = await response.json();
      setTestResult(data);
      
      if (data.success) {
        notifications.show({
          title: 'Connection Successful',
          message: 'ShipStation connection test passed',
          color: 'green',
          icon: <IconCheck size="1rem" />
        });
      } else {
        notifications.show({
          title: 'Connection Failed',
          message: data.message || 'Connection test failed',
          color: 'red',
          icon: <IconAlertCircle size="1rem" />
        });
      }
    } catch {
      const errorMessage = 'Connection test failed';
      setTestResult({
        success: false,
        message: errorMessage
      });
      notifications.show({
        title: 'Test Error',
        message: errorMessage,
        color: 'red',
        icon: <IconAlertCircle size="1rem" />
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (values: ShipStationConfig) => {
    setSaving(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;
      
      const response = await fetch('/api/admin/integrations/shipstation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...values,
          apiKey: apiKeyModified ? values.apiKey : originalApiKey,
          apiSecret: apiSecretModified ? values.apiSecret : (originalApiSecret || values.apiSecret)
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setConfig(data.data);
          
          // Update original credentials if they were changed
          if (apiKeyModified && data.data.apiKey) {
            setOriginalApiKey(data.data.apiKey);
            setApiKeyModified(false);
          }
          if (apiSecretModified && data.data.apiSecret) {
            setOriginalApiSecret(data.data.apiSecret);
            setApiSecretModified(false);
          }
          
          // Set form back to masked values if we have credentials
          if (data.data.apiKey) {
            setHasExistingConfig(true);
            form.setFieldValue('apiKey', '••••••••••••••••');
            if (data.data.apiSecret) {
              form.setFieldValue('apiSecret', '••••••••••••••••');
            }
          }
          
          notifications.show({
            title: 'Configuration Saved',
            message: 'ShipStation integration settings have been saved successfully',
            color: 'green',
            icon: <IconCheck size="1rem" />
          });
        } else {
          throw new Error(data.error || 'Failed to save configuration');
        }
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while saving configuration';
      setError(errorMessage);
      notifications.show({
        title: 'Save Failed',
        message: errorMessage,
        color: 'red',
        icon: <IconAlertCircle size="1rem" />
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <Loader size="lg" />
        <Text mt="md" c="dimmed">
          Loading ShipStation configuration...
        </Text>
      </div>
    );
  }

  return (
    <Stack gap="lg">
      <div>
        <Title order={1} mb="xs">
          <Group gap="sm">
            <IconShip style={{ width: rem(28), height: rem(28) }} />
            ShipStation Integration
          </Group>
        </Title>
        <Text c="dimmed">
          Configure your ShipStation Custom Store integration for automated order fulfillment.
        </Text>
      </div>

      {error && (
        <Alert
          icon={<IconAlertCircle size="1rem" />}
          color="red"
          variant="light"
        >
          {error}
        </Alert>
      )}

      <Card shadow="sm" padding="lg">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            // If we have existing config and API key is not modified, bypass validation
            if (hasExistingConfig && !apiKeyModified && form.values.apiKey === '••••••••••••••••') {
              const validationErrors = form.validate();
              // Remove apiKey error if it exists since we're using the stored value
              delete validationErrors.apiKey;
              
              if (Object.keys(validationErrors).length === 0) {
                handleSubmit(form.values);
              }
            } else {
              form.onSubmit(handleSubmit)(e);
            }
          }}
          noValidate={hasExistingConfig && !apiKeyModified}
        >
          <Stack gap="md">
            <Group justify="space-between" mb="md">
              <div>
                <Text fw={500} size="lg">Integration Settings</Text>
                <Text size="sm" c="dimmed">
                  Configure your ShipStation Custom Store connection
                </Text>
              </div>
              <Switch
                label="Enable Integration"
                description="Toggle to enable/disable ShipStation integration"
                checked={form.values.isActive}
                onChange={(event) => form.setFieldValue('isActive', event.currentTarget.checked)}
              />
            </Group>

            <Divider />

            <Group justify="space-between" align="flex-end">
              <div style={{ flex: 1 }}>
                <Text fw={500} mb="sm">
                  <Group gap="xs">
                    <IconKey size="1rem" />
                    Store Credentials
                  </Group>
                </Text>
                <Text size="sm" c="dimmed" mb="md">
                  These credentials will be used by ShipStation to connect to your store.
                </Text>
              </div>
              <Button
                variant="outline"
                leftSection={<IconRefresh size="1rem" />}
                onClick={generateCredentials}
                size="sm"
              >
                Generate New Credentials
              </Button>
            </Group>

            <Group grow>
              <TextInput
                label="Username"
                placeholder="Enter username"
                description="Username for ShipStation to access your store"
                rightSection={
                  <ActionIcon
                    variant="subtle"
                    onClick={() => copyToClipboard(form.values.username, 'Username')}
                    disabled={!form.values.username}
                  >
                    <IconCopy size="1rem" />
                  </ActionIcon>
                }
                {...form.getInputProps('username')}
              />
              <PasswordInput
                label="Password"
                placeholder="Enter password"
                description="Password for ShipStation authentication"
                rightSection={
                  <ActionIcon
                    variant="subtle"
                    onClick={() => copyToClipboard(form.values.password, 'Password')}
                    disabled={!form.values.password}
                  >
                    <IconCopy size="1rem" />
                  </ActionIcon>
                }
                {...form.getInputProps('password')}
              />
            </Group>

            {hasExistingConfig && !apiKeyModified && (
              <Alert icon={<IconInfoCircle size="1rem" />} color="blue" variant="light" mb="sm">
                <Text size="sm">
                  Your existing API key is securely stored. To update it, click on the field and enter a new value.
                </Text>
              </Alert>
            )}

            <Group grow>
              <TextInput
                label="API Key"
                placeholder={hasExistingConfig && !apiKeyModified ? "Using existing API key" : "Enter API key"}
                description="API key for programmatic access"
                rightSection={
                  <ActionIcon
                    variant="subtle"
                    onClick={() => {
                      const keyToCopy = apiKeyModified ? form.values.apiKey : originalApiKey;
                      if (keyToCopy && keyToCopy !== '••••••••••••••••') {
                        copyToClipboard(keyToCopy, 'API Key');
                      }
                    }}
                    disabled={!form.values.apiKey || form.values.apiKey === '••••••••••••••••'}
                  >
                    <IconCopy size="1rem" />
                  </ActionIcon>
                }
                value={form.values.apiKey}
                error={form.errors.apiKey}
                onChange={(e) => {
                  form.setFieldValue('apiKey', e.target.value);
                  setApiKeyModified(true);
                }}
                onFocus={() => {
                  if (hasExistingConfig && form.values.apiKey === '••••••••••••••••' && !apiKeyModified) {
                    form.setFieldValue('apiKey', '');
                  }
                }}
                onBlur={() => {
                  if (hasExistingConfig && form.values.apiKey === '' && !apiKeyModified) {
                    form.setFieldValue('apiKey', '••••••••••••••••');
                  }
                  form.validateField('apiKey');
                }}
                required={!hasExistingConfig || apiKeyModified}
              />
              <TextInput
                label="API Secret"
                placeholder={hasExistingConfig && !apiSecretModified ? "Using existing API secret (optional)" : "Enter API secret (optional)"}
                description="API secret for secure authentication (optional)"
                rightSection={
                  <ActionIcon
                    variant="subtle"
                    onClick={() => {
                      const secretToCopy = apiSecretModified ? form.values.apiSecret : originalApiSecret;
                      if (secretToCopy && secretToCopy !== '••••••••••••••••') {
                        copyToClipboard(secretToCopy, 'API Secret');
                      }
                    }}
                    disabled={!form.values.apiSecret || form.values.apiSecret === '••••••••••••••••'}
                  >
                    <IconCopy size="1rem" />
                  </ActionIcon>
                }
                value={form.values.apiSecret}
                error={form.errors.apiSecret}
                onChange={(e) => {
                  form.setFieldValue('apiSecret', e.target.value);
                  setApiSecretModified(true);
                }}
                onFocus={() => {
                  if (hasExistingConfig && form.values.apiSecret === '••••••••••••••••' && !apiSecretModified) {
                    form.setFieldValue('apiSecret', '');
                  }
                }}
                onBlur={() => {
                  if (hasExistingConfig && form.values.apiSecret === '' && !apiSecretModified) {
                    form.setFieldValue('apiSecret', '••••••••••••••••');
                  }
                }}
              />
            </Group>

            <TextInput
              label="Endpoint URL"
              placeholder="https://your-store.com/api/shipstation/webhooks"
              description="The URL ShipStation will use to connect to your store"
              rightSection={
                <ActionIcon
                  variant="subtle"
                  onClick={() => copyToClipboard(form.values.endpointUrl, 'Endpoint URL')}
                  disabled={!form.values.endpointUrl}
                >
                  <IconCopy size="1rem" />
                </ActionIcon>
              }
              {...form.getInputProps('endpointUrl')}
            />

            <Divider />

            <div>
              <Text fw={500} mb="sm">
                <Group gap="xs">
                  <IconSettings size="1rem" />
                  Sync Settings
                </Group>
              </Text>
              <Group>
                <Switch
                  label="Auto-sync enabled"
                  description="Automatically sync orders and inventory"
                  checked={form.values.autoSyncEnabled}
                  onChange={(event) => form.setFieldValue('autoSyncEnabled', event.currentTarget.checked)}
                />
              </Group>
            </div>

            <Group justify="space-between" mt="md">
              <Button
                variant="outline"
                leftSection={<IconExternalLink size="1rem" />}
                onClick={testConnection}
                loading={testing}
                disabled={!form.values.username || !form.values.password}
              >
                Test Connection
              </Button>
              <Group>
                <Button
                  variant="outline"
                  onClick={() => {
                    form.reset();
                    // Reset modification flags
                    setApiKeyModified(false);
                    setApiSecretModified(false);
                    // Restore masked values if we have existing config
                    if (hasExistingConfig) {
                      form.setFieldValue('apiKey', '••••••••••••••••');
                      form.setFieldValue('apiSecret', '••••••••••••••••');
                    }
                  }}
                  disabled={saving}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  loading={saving}
                  leftSection={<IconCheck size="1rem" />}
                >
                  Save Configuration
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Card>

      {/* Connection Test Result */}
      {testResult && (
        <Card shadow="sm" padding="lg">
          <Group gap="sm" mb="md">
            <ThemeIcon
              size="lg"
              variant="light"
              color={testResult.success ? 'green' : 'red'}
            >
              {testResult.success ? (
                <IconCircleCheck size="1rem" />
              ) : (
                <IconCircleX size="1rem" />
              )}
            </ThemeIcon>
            <div>
              <Text fw={500}>
                Connection Test {testResult.success ? 'Passed' : 'Failed'}
              </Text>
              <Text size="sm" c="dimmed">
                {testResult.message}
              </Text>
            </div>
          </Group>
          {testResult.details && (
            <Code block mt="sm">
              {JSON.stringify(testResult.details, null, 2)}
            </Code>
          )}
        </Card>
      )}

      {/* Setup Instructions */}
      <Card shadow="sm" padding="lg">
        <Group gap="sm" mb="md">
          <IconInfoCircle size="1.2rem" />
          <Text fw={500}>Setup Instructions</Text>
        </Group>
        <Text size="sm" c="dimmed" mb="md">
          Follow these steps to configure ShipStation Custom Store integration:
        </Text>
        <List size="sm" spacing="xs">
          <List.Item>
            Generate new credentials using the button above
          </List.Item>
          <List.Item>
            Copy the generated credentials to your clipboard
          </List.Item>
          <List.Item>
            Log into your ShipStation account and go to Settings &gt; Selling Channels
          </List.Item>
          <List.Item>
            Click &quot;Connect a Store or Marketplace&quot; and select &quot;Custom Store&quot;
          </List.Item>
          <List.Item>
            Enter your store information and paste the credentials
          </List.Item>
          <List.Item>
            Test the connection to ensure everything is working properly
          </List.Item>
          <List.Item>
            Save your configuration and enable the integration
          </List.Item>
        </List>
        <Paper p="md" withBorder mt="md" bg="blue.0">
          <Text size="sm" fw={500} c="blue.7" mb="xs">
            Important Notes:
          </Text>
          <List size="xs" spacing="xs">
            <List.Item>
              Keep your credentials secure and don&apos;t share them publicly
            </List.Item>
            <List.Item>
              The endpoint URL must be publicly accessible by ShipStation
            </List.Item>
            <List.Item>
              Test your connection before enabling the integration
            </List.Item>
          </List>
        </Paper>
      </Card>
    </Stack>
  );
}