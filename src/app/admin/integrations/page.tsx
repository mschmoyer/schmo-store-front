'use client';

import React, { useEffect, useState } from 'react';
import { 
  Stack, 
  Title, 
  Text, 
  Alert
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { IntegrationSettings, type Integration } from '@/components/admin/IntegrationSettings';
import { IntegrationConfiguration } from '@/types/database';
import { StripeConnectCard } from '@/components/admin/StripeConnectCard';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { PanelSkeleton } from '@/components/admin/AdminSkeletons';

/**
 * An integration row as returned by the API.
 *
 * `integrationType` is the raw column value, which may still hold legacy
 * providers (e.g. `shipengine`) that the UI no longer supports.
 */
interface StoredIntegration {
  id?: string;
  integrationType: string;
  isActive: boolean;
  hasApiKey: boolean;
  configuration: IntegrationConfiguration;
  autoSyncEnabled?: boolean;
  autoSyncInterval?: '10min' | '1hour' | '1day';
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load the integration list.
   *
   * Hoisted out of the mount effect so a disconnect can refresh the cards
   * without a full page reload — the card's state is derived entirely from this
   * response, so a stale list would keep showing Disconnect for something that
   * is already gone.
   */
  const fetchIntegrations = React.useCallback(async () => {
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
                integrationType: 'shipstation',
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
            
            // Update with existing data (skip any shipengine integrations)
            existingIntegrations.forEach((existing: StoredIntegration) => {
              // Skip shipengine integrations since we no longer support them
              if (existing.integrationType === 'shipengine') {
                return;
              }

              const index = allIntegrations.findIndex(
                int => int.integrationType === existing.integrationType
              );
              if (index >= 0) {
                allIntegrations[index] = {
                  ...allIntegrations[index],
                  id: existing.id,
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
  }, []);

  useEffect(() => {
    // Awaited inside the effect rather than called from its body: the state this
    // sets lands after the request resolves, not synchronously on mount.
    void (async () => {
      await fetchIntegrations();
    })();
  }, [fetchIntegrations]);
  
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
      <Stack gap="lg">
        <AdminPageHeader title="Integrations" description="Connect the services that feed your store." />
        <PanelSkeleton height={140} label="Loading integrations" />
        <PanelSkeleton height={140} label="Loading integrations" />
      </Stack>
    );
  }
  
  return (
    <Stack gap="lg">
      <AdminPageHeader
        title="Integrations"
        description="Connect your store to the services that handle shipping, payments and inventory."
      />
      
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
          Shipping &amp; Fulfillment
        </Title>
        <Text size="sm" c="dimmed" mb="lg">
          Connect ShipStation to import your catalogue, send orders for fulfilment, and get
          tracking back.
        </Text>
        <Stack gap="lg">
          {integrations
            .filter(integration => ['shipstation'].includes(integration.integrationType))
            .map((integration) => (
              <IntegrationSettings
                key={integration.integrationType}
                integration={integration}
                onUpdate={handleUpdateIntegration}
                onDisconnected={fetchIntegrations}
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
          {/* Stripe is not a stored API key on this platform: payments run on the
              deployment's STRIPE_SECRET_KEY plus a Connect account per store. The
              generic card collected a per-store secret that no payment code read,
              so its "Active" badge was derived from a row with no bearing on
              whether the store could take money. */}
          <StripeConnectCard />

          {integrations
            .filter(integration => ['square', 'paypal'].includes(integration.integrationType))
            .map((integration) => (
              <IntegrationSettings
                key={integration.integrationType}
                integration={integration}
                onUpdate={handleUpdateIntegration}
                onDisconnected={fetchIntegrations}
                loading={saving}
              />
            ))}
        </Stack>
      </div>
    </Stack>
  );
}