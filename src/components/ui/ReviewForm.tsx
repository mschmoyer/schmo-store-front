'use client';

import { useState } from 'react';
import { 
  Paper, 
  Title, 
  TextInput, 
  Textarea, 
  Button, 
  Group, 
  Text,
  Checkbox,
  Alert,
  Box
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconCheck } from '@tabler/icons-react';
import { StarRating } from './StarRating';
import { NewReview } from '@/types/review';

interface ReviewFormProps {
  productId: string;
  productName: string;
  onSubmit: (review: NewReview) => Promise<void>;
  onCancel?: () => void;
  isVisible?: boolean;
}

export function ReviewForm({
  productId,
  productName,
  onSubmit,
  onCancel,
  isVisible = true
}: ReviewFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const form = useForm({
    initialValues: {
      rating: 0,
      title: '',
      content: '',
      userName: '',
      userEmail: '',
      termsAccepted: false
    },
    validate: {
      rating: (value) => value === 0 ? 'Please select a rating' : null,
      userName: (value) => value.trim().length < 2 ? 'Name must be at least 2 characters' : null,
      userEmail: (value) => {
        if (value && !/^\S+@\S+\.\S+$/.test(value)) {
          return 'Please enter a valid email address';
        }
        return null;
      },
      content: (value) => {
        if (value.trim().length > 0 && value.trim().length < 10) {
          return 'Review must be at least 10 characters';
        }
        return null;
      },
      termsAccepted: (value) => !value ? 'You must accept the terms to submit a review' : null
    }
  });
  
  const handleSubmit = async (values: typeof form.values) => {
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      const review: NewReview = {
        product_id: productId,
        rating: values.rating,
        title: values.title.trim() || undefined,
        content: values.content.trim() || undefined,
        user_name: values.userName.trim(),
        user_email: values.userEmail.trim() || undefined
      };
      
      await onSubmit(review);
      
      // Show success notification
      notifications.show({
        title: 'Review Submitted!',
        message: 'Thank you for your review. It will be published after moderation.',
        color: 'green',
        icon: <IconCheck size="1rem" />,
        autoClose: 5000,
      });
      
      // Reset form
      form.reset();
      
    } catch (error) {
      console.error('Error submitting review:', error);
      setSubmitError(
        error instanceof Error 
          ? error.message 
          : 'Failed to submit review. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (!isVisible) {
    return null;
  }
  
  return (
    <Paper shadow="sm" radius="md" p="lg" withBorder>
      <Title order={3} mb="lg">
        Write a Review for {productName}
      </Title>
      
      {submitError && (
        <Alert 
          icon={<IconAlertCircle size="1rem" />} 
          color="red" 
          mb="md"
          onClose={() => setSubmitError(null)}
          withCloseButton
        >
          {submitError}
        </Alert>
      )}
      
      <form onSubmit={form.onSubmit(handleSubmit)}>
        {/* Rating */}
        <Box mb="md">
          <Text size="sm" fw={500} mb="xs">
            Rating *
          </Text>
          <StarRating
            value={form.values.rating}
            onChange={(rating) => form.setFieldValue('rating', rating)}
            size="lg"
          />
          {form.errors.rating && (
            <Text size="xs" c="red" mt="xs">
              {form.errors.rating}
            </Text>
          )}
        </Box>
        
        {/* User Name */}
        <TextInput
          label="Your Name"
          placeholder="Enter your name"
          required
          mb="md"
          {...form.getInputProps('userName')}
        />
        
        {/* User Email */}
        <TextInput
          label="Email Address"
          placeholder="your.email@example.com (optional)"
          type="email"
          mb="md"
          description="Email is optional but helps verify your purchase"
          {...form.getInputProps('userEmail')}
        />
        
        {/* Review Title */}
        <TextInput
          label="Review Title"
          placeholder="Summarize your experience (optional)"
          mb="md"
          {...form.getInputProps('title')}
        />
        
        {/* Review Content */}
        <Textarea
          label="Your Review"
          placeholder="Share your thoughts about this product (optional)"
          minRows={4}
          maxRows={8}
          mb="md"
          description="Tell others about your experience with this product"
          {...form.getInputProps('content')}
        />
        
        {/* Terms Acceptance */}
        <Checkbox
          label={
            <Text size="sm">
              I agree to the{' '}
              <Text component="span" td="underline" style={{ cursor: 'pointer' }}>
                terms and conditions
              </Text>{' '}
              and confirm this review is based on my honest experience
            </Text>
          }
          mb="lg"
          required
          {...form.getInputProps('termsAccepted', { type: 'checkbox' })}
        />
        
        {/* Action Buttons */}
        <Group justify="flex-end">
          {onCancel && (
            <Button 
              variant="outline" 
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}
          
          <Button 
            type="submit" 
            loading={isSubmitting}
            disabled={!form.values.termsAccepted}
          >
            Submit Review
          </Button>
        </Group>
      </form>
      
      <Text size="xs" c="dimmed" mt="md">
        Reviews are moderated and will be published within 24 hours. 
        Please ensure your review follows our community guidelines.
      </Text>
    </Paper>
  );
}