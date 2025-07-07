'use client';

import React, { useState } from 'react';
import { 
  Container, 
  Title, 
  Text, 
  Paper, 
  TextInput, 
  Button, 
  Group, 
  Stack,
  Alert,
  Stepper,
  rem
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconCheck, IconBuildingStore, IconUser } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';

interface StoreFormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  storeName: string;
  storeSlug: string;
  storeDescription: string;
  heroTitle: string;
  heroDescription: string;
}

export default function CreateStorePage() {
  const [active, setActive] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  
  const form = useForm<StoreFormData>({
    initialValues: {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      storeName: '',
      storeSlug: '',
      storeDescription: '',
      heroTitle: 'Welcome to Our Store',
      heroDescription: 'Discover amazing products and unbeatable prices. Shop with confidence and enjoy our exceptional customer service.',
    },
    validate: {
      email: (value) => (!value ? 'Email is required' : !/^\S+@\S+$/.test(value) ? 'Invalid email' : null),
      password: (value) => (!value ? 'Password is required' : value.length < 6 ? 'Password must be at least 6 characters' : null),
      confirmPassword: (value, values) => value !== values.password ? 'Passwords do not match' : null,
      firstName: (value) => (!value ? 'First name is required' : null),
      lastName: (value) => (!value ? 'Last name is required' : null),
      storeName: (value) => (!value ? 'Store name is required' : null),
      storeSlug: (value) => (!value ? 'Store slug is required' : !/^[a-z0-9-]+$/.test(value) ? 'Slug must contain only lowercase letters, numbers, and hyphens' : null),
      storeDescription: (value) => (!value ? 'Store description is required' : null),
    },
  });

  // Auto-generate store slug and hero content from store name
  const handleStoreNameChange = (value: string) => {
    form.setFieldValue('storeName', value);
    const slug = value.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
    form.setFieldValue('storeSlug', slug);
    
    // Update hero content with store name if provided
    if (value.trim()) {
      form.setFieldValue('heroTitle', `Welcome to ${value}`);
      form.setFieldValue('heroDescription', `Discover amazing products at ${value}. Shop with confidence and enjoy our exceptional customer service.`);
    } else {
      form.setFieldValue('heroTitle', 'Welcome to Our Store');
      form.setFieldValue('heroDescription', 'Discover amazing products and unbeatable prices. Shop with confidence and enjoy our exceptional customer service.');
    }
  };

  const nextStep = () => {
    const currentStepFields = getStepFields(active);
    const hasErrors = currentStepFields.some(field => form.validateField(field).hasError);
    
    if (!hasErrors) {
      setActive((current) => (current < 1 ? current + 1 : current));
    }
  };

  const prevStep = () => setActive((current) => (current > 0 ? current - 1 : current));

  const getStepFields = (stepIndex: number): (keyof StoreFormData)[] => {
    switch (stepIndex) {
      case 0:
        return ['email', 'password', 'confirmPassword', 'firstName', 'lastName'];
      case 1:
        return ['storeName', 'storeSlug', 'storeDescription'];
      default:
        return [];
    }
  };

  const handleSubmit = async (values: StoreFormData) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/stores/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create store');
      }

      const result = await response.json();
      
      // Clear any existing admin session tokens before redirect
      if (typeof window !== 'undefined') {
        localStorage.removeItem('admin_token');
      }
      
      // Redirect directly to success page
      router.push(`/create-store/success?store=${result.storeSlug}&name=${encodeURIComponent(result.storeName)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while creating your store');
      console.error('Store creation error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 py-12">
      <Container size="sm">
        <Paper withBorder shadow="md" p={30} radius="md">
          <Title
            ta="center"
            style={{
              fontFamily: 'var(--font-geist-sans)',
              fontWeight: 900,
              marginBottom: rem(20),
            }}
          >
            Create Your Store
          </Title>
          
          <Text c="dimmed" size="sm" ta="center" mb={30}>
            Set up your online store in just a few minutes
          </Text>

          {error && (
            <Alert
              icon={<IconAlertCircle size="1rem" />}
              color="red"
              mb="md"
              variant="light"
            >
              {error}
            </Alert>
          )}
          <Stepper active={active} onStepClick={setActive}>
            <Stepper.Step 
              label="Account" 
              description="Create your account"
              icon={<IconUser style={{ width: rem(18), height: rem(18) }} />}
            >
              <Stack gap="md">
                <TextInput
                  label="Email"
                  placeholder="your-email@example.com"
                  required
                  {...form.getInputProps('email')}
                />
                <Group grow>
                  <TextInput
                    label="First Name"
                    placeholder="John"
                    required
                    {...form.getInputProps('firstName')}
                  />
                  <TextInput
                    label="Last Name"
                    placeholder="Doe"
                    required
                    {...form.getInputProps('lastName')}
                  />
                </Group>
                <TextInput
                  label="Password"
                  type="password"
                  placeholder="Choose a strong password"
                  required
                  {...form.getInputProps('password')}
                />
                <TextInput
                  label="Confirm Password"
                  type="password"
                  placeholder="Confirm your password"
                  required
                  {...form.getInputProps('confirmPassword')}
                />
              </Stack>
            </Stepper.Step>

            <Stepper.Step 
              label="Store Details" 
              description="Name and describe your store"
              icon={<IconBuildingStore style={{ width: rem(18), height: rem(18) }} />}
            >
              <Stack gap="md">
                <TextInput
                  label="Store Name"
                  placeholder="My Awesome Store"
                  required
                  value={form.values.storeName}
                  onChange={(e) => handleStoreNameChange(e.target.value)}
                  error={form.errors.storeName}
                />
                <TextInput
                  label="Store Slug"
                  placeholder="my-awesome-store"
                  description="This will be your store's URL: yourstore.com/your-slug"
                  required
                  {...form.getInputProps('storeSlug')}
                />
                <TextInput
                  label="Store Description"
                  placeholder="A brief description of what you sell"
                  required
                  {...form.getInputProps('storeDescription')}
                />
              </Stack>
            </Stepper.Step>

          </Stepper>

          <Group justify="space-between" mt="xl">
            <Button variant="default" onClick={prevStep} disabled={active === 0}>
              Back
            </Button>
            {active < 1 && (
              <Button onClick={nextStep}>
                Next step
              </Button>
            )}
            {active === 1 && (
              <Button
                onClick={() => form.onSubmit(handleSubmit)()}
                loading={isLoading}
                variant="gradient"
                gradient={{ from: 'blue', to: 'cyan' }}
                size="md"
                rightSection={<IconCheck size={18} />}
              >
                Create Store
              </Button>
            )}
          </Group>
        </Paper>
      </Container>
      
      {/* CSS Animations */}
      <style jsx>{`
        @keyframes bounce {
          0%, 20%, 53%, 80%, 100% {
            transform: translate3d(0,0,0);
          }
          40%, 43% {
            transform: translate3d(0, -30px, 0);
          }
          70% {
            transform: translate3d(0, -15px, 0);
          }
          90% {
            transform: translate3d(0, -4px, 0);
          }
        }
        
        .bounce {
          animation: bounce 2s infinite;
        }
      `}</style>
    </div>
  );
}