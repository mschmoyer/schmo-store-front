'use client';

import React, { useState } from 'react';
import { 
  Paper, 
  TextInput, 
  PasswordInput, 
  Button, 
  Title, 
  Text, 
  Container,
  Alert,
  Group,
  rem,
  Anchor
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLogin2, IconAlertCircle } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { rebelTheme } from '@/lib/theme/rebel-theme';

interface LoginFormData {
  email: string;
  password: string;
}

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  
  const form = useForm<LoginFormData>({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: (value) => (!value ? 'Email is required' : !/^\S+@\S+$/.test(value) ? 'Invalid email' : null),
      password: (value) => (!value ? 'Password is required' : null),
    },
  });
  
  const handleSubmit = async (values: LoginFormData) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const result = await response.json();
      
      // Store authentication token
      localStorage.setItem('authToken', result.token);
      
      // Redirect to user's store admin page
      router.push(`/admin?store=${result.storeSlug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during login');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className={`min-h-screen ${rebelTheme.sections.hero} flex items-center justify-center py-12`}>
      <Container size={420} my={40}>
        <Title
          ta="center"
          className={`${rebelTheme.classes.text.heading} font-bold`}
          style={{
            fontFamily: 'var(--font-geist-sans)',
            fontWeight: 900,
          }}
        >
          Sign In
        </Title>
        <Text size="sm" ta="center" mt={5} className={rebelTheme.classes.text.body}>
          Access your store admin dashboard
        </Text>
        
        <Paper withBorder shadow="md" p={30} mt={30} radius="md" className={`${rebelTheme.classes.card.background} ${rebelTheme.classes.card.border} ${rebelTheme.classes.card.shadow}`}>
          <form onSubmit={form.onSubmit(handleSubmit)}>
            {error && (
              <Alert
                icon={<IconAlertCircle size="1rem" />}
                color="red"
                mb="md"
                variant="light"
                className="!border-red-200 !bg-red-50 !text-red-800"
              >
                {error}
              </Alert>
            )}
            
            <TextInput
              label="Email"
              placeholder="your-email@example.com"
              required
              {...form.getInputProps('email')}
              mb="md"
            />
            
            <PasswordInput
              label="Password"
              placeholder="Your password"
              required
              {...form.getInputProps('password')}
              mb="md"
            />
            
            <Button
              type="submit"
              fullWidth
              mt="xl"
              loading={isLoading}
              leftSection={<IconLogin2 style={{ width: rem(16), height: rem(16) }} />}
              className={rebelTheme.classes.button.primary}
            >
              Sign In
            </Button>
          </form>
          
          <Group justify="center" mt="lg">
            <Text size="sm" className={rebelTheme.classes.text.muted}>
              Don&apos;t have a store?{' '}
              <Anchor component={Link} href="/create-store" size="sm" className={rebelTheme.classes.link.primary}>
                Create one here
              </Anchor>
            </Text>
          </Group>
        </Paper>
      </Container>
    </div>
  );
}