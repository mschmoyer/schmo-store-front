'use client';

import React, { useEffect, useState } from 'react';
import { 
  Stack, 
  Title, 
  Text, 
  Alert,
  Loader,
  Group,
  rem
} from '@mantine/core';
import { IconPlug, IconAlertCircle } from '@tabler/icons-react';
import { IntegrationSettings } from '@/components/admin/IntegrationSettings';

interface Integration {
  id?: string;
  integrationType: 'shipstation-v2' | 'shipstation-v1' | 'stripe' | 'square' | 'paypal';
  isActive: boolean;
  hasApiKey: boolean;
  configuration: Record<string, unknown>;
  autoSyncEnabled?: boolean;
  autoSyncInterval?: '10min' | '1hour' | '1day';
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchIntegrations = async () => {
      try {
        const token = localStorage.getItem('admin_token');
        if (!token) return;
        
        const response = await fetch('/api/admin/integrations', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Ensure we have all integrations, even if not configured
            const existingIntegrations = data.data.integrations;
            const allIntegrations: Integration[] = [
              {
                integrationType: 'shipstation-v2',
                isActive: false,
                hasApiKey: false,
                configuration: {},
                autoSyncEnabled: false,
                autoSyncInterval: '1hour'
              },
              {
                integrationType: 'shipstation-v1',
                isActive: false,
                hasApiKey: false,
                configuration: {},
                autoSyncEnabled: false,
                autoSyncInterval: '1hour'
              },
              {
                integrationType: 'stripe',
                isActive: false,
                hasApiKey: false,
                configuration: {},
                autoSyncEnabled: false,
                autoSyncInterval: '1hour'
              },
              {
                integrationType: 'square',
                isActive: false,
                hasApiKey: false,
                configuration: {},
                autoSyncEnabled: false,
                autoSyncInterval: '1hour'
              },
              {
                integrationType: 'paypal',
                isActive: false,
                hasApiKey: false,
                configuration: {},
                autoSyncEnabled: false,
                autoSyncInterval: '1hour'
              }
            ];
            
            // Update with existing data
            existingIntegrations.forEach((existing: Integration) => {
              const index = allIntegrations.findIndex(
                int => int.integrationType === existing.integrationType
              );
              if (index >= 0) {
                allIntegrations[index] = {
                  id: existing.id,
                  integrationType: existing.integrationType,
                  isActive: existing.isActive,
                  hasApiKey: existing.hasApiKey,
                  configuration: existing.configuration || {},
                  autoSyncEnabled: existing.autoSyncEnabled || false,
                  autoSyncInterval: existing.autoSyncInterval || '1hour'
                };
              }
            });
            
            setIntegrations(allIntegrations);
          } else {
            setError(data.error || 'Failed to load integrations');
          }
        } else {
          setError('Failed to load integrations');
        }
      } catch (err) {
        setError('An error occurred while loading integrations');
        console.error('Integrations error:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchIntegrations();
  }, []);
  
  const handleUpdateIntegration = async (integrationType: string, data: Partial<Integration>) => {
    setSaving(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('admin_token');
      if (!token) return;
      
      const response = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          integrationType,
          ...data
        })
      });
      
      if (response.ok) {
        const responseData = await response.json();
        if (responseData.success) {
          // Update the integration in state
          setIntegrations(prev => prev.map(integration => 
            integration.integrationType === integrationType
              ? {
                  ...integration,
                  ...responseData.data.integration,
                  integrationType: responseData.data.integration.integrationType
                }
              : integration
          ));
        } else {
          throw new Error(responseData.error || 'Failed to update integration');
        }
      } else {
        throw new Error('Failed to update integration');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred while updating integration';
      setError(errorMessage);
      throw err;
    } finally {
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <Loader size="lg" />
        <Text mt="md" c="dimmed">
          Loading integrations...
        </Text>
      </div>
    );
  }
  
  return (
    <Stack gap="lg">
      <div>
        <Title order={1} mb="xs">
          <Group gap="sm">
            <IconPlug style={{ width: rem(28), height: rem(28) }} />
            Integrations
          </Group>
        </Title>
        <Text c="dimmed">
          Connect your store to external services for shipping, payments, and more.
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
      
      {/* Shipping Integrations */}
      <div>
        <Title order={2} size="h3" mb="md">
          Shipping & Fulfillment
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Connect your shipping provider to sync products and manage inventory automatically.
        </Text>
        <Stack gap="lg">
          {integrations
            .filter(integration => ['shipstation-v2', 'shipstation-v1'].includes(integration.integrationType))
            .map((integration) => (
              <IntegrationSettings
                key={integration.integrationType}
                integration={integration}
                onUpdate={handleUpdateIntegration}
                loading={saving}
              />
            ))}
        </Stack>
      </div>
      
      {/* Payment Integrations */}
      <div>
        <Title order={2} size="h3" mb="md">
          Payment Processing
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Choose your payment processors to accept credit cards, digital wallets, and more.
        </Text>
        <Stack gap="lg">
          {integrations
            .filter(integration => ['stripe', 'square', 'paypal'].includes(integration.integrationType))
            .map((integration) => (
              <IntegrationSettings
                key={integration.integrationType}
                integration={integration}
                onUpdate={handleUpdateIntegration}
                loading={saving}
              />
            ))}
        </Stack>
      </div>
    </Stack>
  );
}