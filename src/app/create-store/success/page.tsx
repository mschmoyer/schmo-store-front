'use client';

import { useEffect, useState, Suspense } from 'react';
import { Container, Paper, Title, Text, Button, Group, ThemeIcon, Box } from '@mantine/core';
import { IconCheck, IconArrowRight, IconBuildingStore } from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import Confetti from 'react-confetti';
import { useViewportSize } from '@mantine/hooks';

function StoreSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { width, height } = useViewportSize();
  const [showConfetti, setShowConfetti] = useState(true);
  
  const storeSlug = searchParams.get('store');
  const storeName = searchParams.get('name');

  useEffect(() => {
    // Stop confetti after 5 seconds
    const timer = setTimeout(() => {
      setShowConfetti(false);
    }, 5000);

    // Clear any existing admin session tokens
    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
    }

    return () => clearTimeout(timer);
  }, []);

  const handleContinueToAdmin = () => {
    if (storeSlug) {
      router.push(`/admin/login?store=${storeSlug}`);
    } else {
      router.push('/admin/login');
    }
  };


  return (
    <>
      {showConfetti && (
        <Confetti
          width={width}
          height={height}
          recycle={false}
          numberOfPieces={200}
          gravity={0.3}
        />
      )}
      
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 py-12 flex items-center justify-center">
        <Container size="sm">
          <Paper withBorder shadow="xl" p={50} radius="lg" ta="center">
            <Box mb="xl">
              <ThemeIcon
                size={80}
                radius="xl"
                variant="gradient"
                gradient={{ from: 'green', to: 'emerald' }}
                mb="lg"
                mx="auto"
              >
                <IconCheck size={40} />
              </ThemeIcon>
            </Box>

            <Title
              order={1}
              size="h1"
              mb="md"
              style={{
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 900,
                background: 'linear-gradient(45deg, #10b981, #059669)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              🎉 Congratulations! 🎉
            </Title>

            <Title order={2} size="h3" mb="sm" c="gray.8">
              Your store has been created!
            </Title>

            <Text size="lg" c="dimmed" mb="xl">
              {storeName ? (
                <>
                  <strong>{storeName}</strong> has been successfully created and is ready for configuration.
                </>
              ) : (
                'Your new store has been successfully created and is ready for configuration.'
              )}
            </Text>

            <div style={{ 
              backgroundColor: 'rgba(59, 130, 246, 0.1)', 
              padding: '16px', 
              borderRadius: '12px',
              marginBottom: '24px',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}>
              <Text size="sm" fw={600} mb="xs" c="blue">
                🏃‍♂️ Next Steps - Configure Your Store:
              </Text>
              <Text size="xs" c="dimmed">
                1. Access your admin dashboard<br/>
                2. Set up integrations (ShipStation, Stripe)<br/>
                3. Customize your store theme and branding<br/>
                4. Add products and configure settings<br/>
                5. Launch your store publicly
              </Text>
            </div>

            <Group justify="center" gap="md">
              <Button
                size="lg"
                leftSection={<IconBuildingStore size={20} />}
                onClick={handleContinueToAdmin}
                variant="gradient"
                gradient={{ from: 'green', to: 'emerald' }}
              >
                Go to My Store
              </Button>
              
              <Button
                size="lg"
                variant="outline"
                leftSection={<IconArrowRight size={20} />}
                onClick={() => router.push('/admin')}
              >
                View Store Admin
              </Button>
            </Group>

            <div style={{ 
              backgroundColor: 'rgba(234, 179, 8, 0.1)', 
              padding: '12px', 
              borderRadius: '8px',
              marginTop: '24px',
              border: '1px solid rgba(234, 179, 8, 0.2)'
            }}>
              <Text size="xs" c="yellow.8" fw={500} ta="center">
                💡 You&apos;ll need to log in with your newly created email and password to access the admin dashboard
              </Text>
            </div>
          </Paper>
        </Container>
      </div>
    </>
  );
}

export default function StoreCreationSuccess() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <StoreSuccessContent />
    </Suspense>
  );
}