'use client';

import { Container, Title, Text, Card, Stack, Button, Group, Divider } from '@mantine/core';
import { IconArrowLeft, IconUser, IconSettings, IconShoppingCart, IconCreditCard } from '@tabler/icons-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function StoreAccountPage() {
  const params = useParams();
  const storeSlug = params.storeSlug as string;

  return (
    <div>
      {/* Hero Section */}
      <div style={{
        background: 'var(--theme-hero-gradient)',
        borderBottom: '1px solid var(--theme-border)',
        padding: '3rem 0',
        marginBottom: '2rem'
      }}>
        <Container size="xl">
          <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <Title order={1} style={{ 
              fontSize: '3rem',
              fontWeight: 800,
              background: 'var(--gradient-text)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1rem',
              letterSpacing: '-0.5px'
            }}>
              My Account
            </Title>
            <Text size="xl" style={{ 
              fontSize: '1.25rem',
              lineHeight: 1.6,
              maxWidth: '600px',
              margin: '0 auto',
              color: 'var(--text-secondary)'
            }}>
              Manage your account settings, view order history, and update your preferences.
            </Text>
          </div>
        </Container>
      </div>

      <Container size="xl" py="lg">
        <Group justify="space-between" mb="xl">
          <Button
            variant="outline"
            leftSection={<IconArrowLeft size={16} />}
            component={Link}
            href={`/store/${storeSlug}`}
            style={{
              borderColor: 'var(--primary-500)',
              color: 'var(--primary-500)',
              transition: 'var(--transition-default)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--primary-500)';
              e.currentTarget.style.color = 'var(--text-inverse)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--primary-500)';
            }}
          >
            Back to Store
          </Button>
        </Group>

        <Stack gap="lg">
          {/* Account Overview */}
          <Card shadow="sm" padding="lg" radius="md" withBorder style={{
            background: 'var(--gradient-surface)',
            border: '1px solid var(--border)',
          }}>
            <Group gap="md" mb="md">
              <div style={{
                padding: '12px',
                borderRadius: '50%',
                backgroundColor: 'var(--surface-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconUser size={32} color="var(--primary-500)" />
              </div>
              <div>
                <Title order={2} style={{ margin: 0, color: 'var(--text-primary)' }}>Welcome Back!</Title>
                <Text style={{ color: 'var(--text-secondary)' }}>Manage your account and preferences</Text>
              </div>
            </Group>
            
            <Text size="sm" mb="lg" style={{ color: 'var(--text-secondary)' }}>
              This is a placeholder account page. In a full implementation, this would show user profile information, 
              order history, saved addresses, payment methods, and account settings.
            </Text>
          </Card>

          {/* Quick Actions */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '1rem' 
          }}>
            {/* Profile Settings */}
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{
              background: 'var(--gradient-surface)',
              border: '1px solid var(--border)',
              transition: 'var(--transition-default)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
              e.currentTarget.style.borderColor = 'var(--border-focus)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
            >
              <Group gap="md" mb="sm">
                <IconSettings size={24} color="var(--primary-500)" />
                <Title order={4} style={{ color: 'var(--text-primary)' }}>Profile Settings</Title>
              </Group>
              <Text size="sm" style={{ color: 'var(--text-secondary)' }}>
                Update your personal information, email preferences, and account security settings.
              </Text>
            </Card>

            {/* Order History */}
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{
              background: 'var(--gradient-surface)',
              border: '1px solid var(--border)',
              transition: 'var(--transition-default)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
              e.currentTarget.style.borderColor = 'var(--border-focus)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
            >
              <Group gap="md" mb="sm">
                <IconShoppingCart size={24} color="var(--primary-500)" />
                <Title order={4} style={{ color: 'var(--text-primary)' }}>Order History</Title>
              </Group>
              <Text size="sm" style={{ color: 'var(--text-secondary)' }}>
                View your past orders, track shipments, and reorder your favorite items.
              </Text>
            </Card>

            {/* Payment Methods */}
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{
              background: 'var(--gradient-surface)',
              border: '1px solid var(--border)',
              transition: 'var(--transition-default)',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
              e.currentTarget.style.borderColor = 'var(--border-focus)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
            >
              <Group gap="md" mb="sm">
                <IconCreditCard size={24} color="var(--primary-500)" />
                <Title order={4} style={{ color: 'var(--text-primary)' }}>Payment Methods</Title>
              </Group>
              <Text size="sm" style={{ color: 'var(--text-secondary)' }}>
                Manage your saved payment methods and billing addresses for faster checkout.
              </Text>
            </Card>
          </div>

          <Divider my="xl" />

          {/* Coming Soon Features */}
          <Card shadow="sm" padding="lg" radius="md" withBorder style={{
            background: 'var(--gradient-surface)',
            border: '1px solid var(--border)',
          }}>
            <Title order={3} mb="md" style={{ color: 'var(--text-primary)' }}>Coming Soon</Title>
            <Text mb="lg" style={{ color: 'var(--text-secondary)' }}>
              We&apos;re working on adding these features to enhance your account experience:
            </Text>
            
            <Stack gap="sm">
              <Text size="sm" style={{ color: 'var(--text-secondary)' }}>• User authentication and login system</Text>
              <Text size="sm" style={{ color: 'var(--text-secondary)' }}>• Detailed order tracking and history</Text>
              <Text size="sm" style={{ color: 'var(--text-secondary)' }}>• Saved addresses and payment methods</Text>
              <Text size="sm" style={{ color: 'var(--text-secondary)' }}>• Wishlist and favorite products</Text>
              <Text size="sm" style={{ color: 'var(--text-secondary)' }}>• Email notifications and preferences</Text>
              <Text size="sm" style={{ color: 'var(--text-secondary)' }}>• Loyalty rewards and points system</Text>
            </Stack>
          </Card>

          {/* Quick Navigation */}
          <Group justify="center" mt="xl">
            <Button
              component={Link}
              href={`/store/${storeSlug}`}
              variant="outline"
              style={{
                borderColor: 'var(--primary-500)',
                color: 'var(--primary-500)',
                transition: 'var(--transition-default)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--primary-500)';
                e.currentTarget.style.color = 'var(--text-inverse)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--primary-500)';
              }}
            >
              Continue Shopping
            </Button>
            
            <Button
              component={Link}
              href={`/store/${storeSlug}/cart`}
              style={{
                background: 'var(--gradient-primary)',
                border: 'none',
                fontWeight: 600,
                transition: 'var(--transition-default)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              View Cart
            </Button>
          </Group>
        </Stack>
      </Container>
    </div>
  );
}