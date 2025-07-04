'use client';

import { Container, Title, Text, Card, Stack, Button, Group, Divider } from '@mantine/core';
import { IconArrowLeft, IconUser, IconSettings, IconShoppingCart, IconCreditCard } from '@tabler/icons-react';
import Link from 'next/link';

export default function AccountPage() {
  return (
    <div>
      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #f7fdf7 0%, #ecfdf5 50%, #f0fdf4 100%)',
        borderBottom: '1px solid #d1fae5',
        padding: '3rem 0',
        marginBottom: '2rem'
      }}>
        <Container size="xl">
          <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
            <Title order={1} style={{ 
              fontSize: '3rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '1rem',
              letterSpacing: '-0.5px'
            }}>
              My Account
            </Title>
            <Text size="xl" c="dimmed" style={{ 
              fontSize: '1.25rem',
              lineHeight: 1.6,
              maxWidth: '600px',
              margin: '0 auto'
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
            href="/store"
            style={{
              borderColor: '#22c55e',
              color: '#22c55e',
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#22c55e';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#22c55e';
            }}
          >
            Back to Store
          </Button>
        </Group>

        <Stack gap="lg">
          {/* Account Overview */}
          <Card shadow="sm" padding="lg" radius="md" withBorder style={{
            background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef',
          }}>
            <Group gap="md" mb="md">
              <div style={{
                padding: '12px',
                borderRadius: '50%',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <IconUser size={32} color="#22c55e" />
              </div>
              <div>
                <Title order={2} style={{ margin: 0 }}>Welcome Back!</Title>
                <Text c="dimmed">Manage your account and preferences</Text>
              </div>
            </Group>
            
            <Text c="dimmed" size="sm" mb="lg">
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
              background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
              border: '1px solid #e9ecef',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
              e.currentTarget.style.borderColor = '#22c55e';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
              e.currentTarget.style.borderColor = '#e9ecef';
            }}
            >
              <Group gap="md" mb="sm">
                <IconSettings size={24} color="#22c55e" />
                <Title order={4}>Profile Settings</Title>
              </Group>
              <Text size="sm" c="dimmed">
                Update your personal information, email preferences, and account security settings.
              </Text>
            </Card>

            {/* Order History */}
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{
              background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
              border: '1px solid #e9ecef',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
              e.currentTarget.style.borderColor = '#22c55e';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
              e.currentTarget.style.borderColor = '#e9ecef';
            }}
            >
              <Group gap="md" mb="sm">
                <IconShoppingCart size={24} color="#22c55e" />
                <Title order={4}>Order History</Title>
              </Group>
              <Text size="sm" c="dimmed">
                View your past orders, track shipments, and reorder your favorite items.
              </Text>
            </Card>

            {/* Payment Methods */}
            <Card shadow="sm" padding="lg" radius="md" withBorder style={{
              background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
              border: '1px solid #e9ecef',
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
              e.currentTarget.style.borderColor = '#22c55e';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
              e.currentTarget.style.borderColor = '#e9ecef';
            }}
            >
              <Group gap="md" mb="sm">
                <IconCreditCard size={24} color="#22c55e" />
                <Title order={4}>Payment Methods</Title>
              </Group>
              <Text size="sm" c="dimmed">
                Manage your saved payment methods and billing addresses for faster checkout.
              </Text>
            </Card>
          </div>

          <Divider my="xl" />

          {/* Coming Soon Features */}
          <Card shadow="sm" padding="lg" radius="md" withBorder style={{
            background: 'linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%)',
            border: '1px solid #e9ecef',
          }}>
            <Title order={3} mb="md">Coming Soon</Title>
            <Text c="dimmed" mb="lg">
              We're working on adding these features to enhance your account experience:
            </Text>
            
            <Stack gap="sm">
              <Text size="sm">• User authentication and login system</Text>
              <Text size="sm">• Detailed order tracking and history</Text>
              <Text size="sm">• Saved addresses and payment methods</Text>
              <Text size="sm">• Wishlist and favorite products</Text>
              <Text size="sm">• Email notifications and preferences</Text>
              <Text size="sm">• Loyalty rewards and points system</Text>
            </Stack>
          </Card>

          {/* Quick Navigation */}
          <Group justify="center" mt="xl">
            <Button
              component={Link}
              href="/store"
              variant="outline"
              style={{
                borderColor: '#22c55e',
                color: '#22c55e',
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#22c55e';
                e.currentTarget.style.color = 'white';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#22c55e';
              }}
            >
              Continue Shopping
            </Button>
            
            <Button
              component={Link}
              href="/cart"
              style={{
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                border: 'none',
                fontWeight: 600,
                transition: 'all 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.3)';
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