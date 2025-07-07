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
  rem
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconLogin2, IconAlertCircle } from '@tabler/icons-react';
import { useAdmin } from '@/contexts/AdminContext';
import { useRouter } from 'next/navigation';

export function LoginForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAdmin();
  const router = useRouter();
  
  const form = useForm({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: (value) => (!value ? 'Email is required' : !/^\S+@\S+$/.test(value) ? 'Invalid email' : null),
      password: (value) => (!value ? 'Password is required' : null),
    },
  });
  
  const handleSubmit = async (values: { email: string; password: string }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const success = await login(values);
      if (success) {
        router.push('/admin');
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      setError('An error occurred during login. Please try again.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Container size={420} my={40}>
      <Title
        ta="center"
        style={{
          fontFamily: 'var(--font-geist-sans)',
          fontWeight: 900,
        }}
      >
        Admin Login
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt={5}>
        Enter your store credentials to access the admin dashboard
      </Text>
      
      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <form onSubmit={form.onSubmit(handleSubmit)}>
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
          
          <TextInput
            label="Email"
            placeholder="your-email@example.com"
            required
            type="email"
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
          >
            Sign In
          </Button>
        </form>
        
        <Group justify="center" mt="lg">
          <Text size="sm" c="dimmed">
            Don&apos;t have a store?{' '}
            <Text
              component="a"
              href="/create-store"
              size="sm"
              c="blue"
              style={{ textDecoration: 'none' }}
            >
              Create one here
            </Text>
          </Text>
        </Group>
      </Paper>
    </Container>
  );
}