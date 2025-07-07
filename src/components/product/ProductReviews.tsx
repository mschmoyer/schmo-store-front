'use client';

import { useState } from 'react';
import { 
  Box, 
  Title, 
  Text, 
  Group, 
  Progress, 
  Button, 
  Stack, 
  Paper,
  Badge,
  Grid,
  Collapse,
  ActionIcon,
  Alert
} from '@mantine/core';
import { 
  IconStar, 
  IconThumbUp, 
  IconThumbDown, 
  IconChevronDown, 
  IconChevronUp,
  IconEdit,
  IconInfoCircle
} from '@tabler/icons-react';
import { StarRating } from '@/components/ui/StarRating';
import { ReviewForm } from '@/components/ui/ReviewForm';
import { Review, ReviewSummary, NewReview } from '@/types/review';

interface ProductReviewsProps {
  productId: string;
  productName: string;
  reviews: Review[];
  summary: ReviewSummary;
  onSubmitReview?: (review: NewReview) => Promise<void>;
  onHelpfulVote?: (reviewId: string, isHelpful: boolean) => Promise<void>;
  showReviewForm?: boolean;
}

export function ProductReviews({
  productId,
  productName,
  reviews,
  summary,
  onSubmitReview,
  onHelpfulVote,
  showReviewForm = true
}: ProductReviewsProps) {
  const [showWriteReview, setShowWriteReview] = useState(false);
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest_rating' | 'lowest_rating' | 'most_helpful'>('newest');
  
  const handleSubmitReview = async (review: NewReview) => {
    if (onSubmitReview) {
      await onSubmitReview(review);
      setShowWriteReview(false);
    }
  };
  
  const handleHelpfulClick = async (reviewId: string, isHelpful: boolean) => {
    if (onHelpfulVote) {
      await onHelpfulVote(reviewId, isHelpful);
    }
  };
  
  const toggleReviewExpansion = (reviewId: string) => {
    setExpandedReview(expandedReview === reviewId ? null : reviewId);
  };
  
  const sortedReviews = [...reviews].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'oldest':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'highest_rating':
        return b.rating - a.rating;
      case 'lowest_rating':
        return a.rating - b.rating;
      case 'most_helpful':
        return b.helpful_votes - a.helpful_votes;
      default:
        return 0;
    }
  });
  
  return (
    <Box>
      <Title order={2} mb="lg">
        Customer Reviews
      </Title>
      
      {/* Reviews Summary */}
      {summary.total_reviews > 0 ? (
        <Paper shadow="xs" radius="md" p="lg" withBorder mb="lg">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Group align="center" mb="md">
                <Box ta="center">
                  <Text size="3xl" fw={700} lh={1}>
                    {summary.average_rating.toFixed(1)}
                  </Text>
                  <StarRating value={summary.average_rating} readonly size="sm" />
                  <Text size="sm" c="dimmed">
                    Based on {summary.total_reviews} reviews
                  </Text>
                </Box>
              </Group>
            </Grid.Col>
            
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Stack gap="xs">
                {[5, 4, 3, 2, 1].map((rating) => (
                  <Group key={rating} gap="sm" align="center">
                    <Text size="sm" w={20}>
                      {rating}
                    </Text>
                    <IconStar size={14} fill="currentColor" />
                    <Progress
                      value={(summary.rating_distribution[rating as keyof typeof summary.rating_distribution] / summary.total_reviews) * 100}
                      size="sm"
                      style={{ flex: 1 }}
                    />
                    <Text size="sm" w={30} ta="right">
                      {summary.rating_distribution[rating as keyof typeof summary.rating_distribution]}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Grid.Col>
          </Grid>
          
          {summary.verified_purchase_count > 0 && (
            <Text size="sm" c="dimmed" mt="md">
              {summary.verified_purchase_count} of these reviews are from verified purchases
            </Text>
          )}
        </Paper>
      ) : (
        <Alert icon={<IconInfoCircle size="1rem" />} mb="lg">
          <Text>No reviews yet. Be the first to review this product!</Text>
        </Alert>
      )}
      
      {/* Write Review Button */}
      {showReviewForm && (
        <Group justify="space-between" mb="lg">
          <Title order={3} size="h4">
            {summary.total_reviews > 0 ? `All Reviews (${summary.total_reviews})` : 'Reviews'}
          </Title>
          
          <Button
            variant="outline"
            leftSection={<IconEdit size={16} />}
            onClick={() => setShowWriteReview(!showWriteReview)}
          >
            Write a Review
          </Button>
        </Group>
      )}
      
      {/* Review Form */}
      <Collapse in={showWriteReview}>
        <Box mb="lg">
          <ReviewForm
            productId={productId}
            productName={productName}
            onSubmit={handleSubmitReview}
            onCancel={() => setShowWriteReview(false)}
          />
        </Box>
      </Collapse>
      
      {/* Sort Options */}
      {reviews.length > 0 && (
        <Group justify="space-between" mb="md">
          <Text size="sm" c="dimmed">
            Showing {reviews.length} reviews
          </Text>
          
          <Group gap="xs">
            <Text size="sm">Sort by:</Text>
            <Button.Group>
              {[
                { value: 'newest', label: 'Newest' },
                { value: 'oldest', label: 'Oldest' },
                { value: 'highest_rating', label: 'Highest Rated' },
                { value: 'lowest_rating', label: 'Lowest Rated' },
                { value: 'most_helpful', label: 'Most Helpful' }
              ].map((option) => (
                <Button
                  key={option.value}
                  variant={sortBy === option.value ? 'filled' : 'outline'}
                  size="xs"
                  onClick={() => setSortBy(option.value as typeof sortBy)}
                >
                  {option.label}
                </Button>
              ))}
            </Button.Group>
          </Group>
        </Group>
      )}
      
      {/* Reviews List */}
      <Stack gap="lg">
        {sortedReviews.map((review) => (
          <Paper key={review.id} shadow="xs" radius="md" p="lg" withBorder>
            <Group justify="space-between" align="flex-start" mb="sm">
              <Box>
                <Group gap="sm" mb="xs">
                  <Text fw={500}>{review.user_name}</Text>
                  {review.verified_purchase && (
                    <Badge variant="light" color="green" size="xs">
                      Verified Purchase
                    </Badge>
                  )}
                </Group>
                
                <Group gap="sm" align="center">
                  <StarRating value={review.rating} readonly size="xs" />
                  <Text size="sm" c="dimmed">
                    {new Date(review.created_at).toLocaleDateString()}
                  </Text>
                </Group>
              </Box>
              
              {review.helpful_votes > 0 && (
                <Text size="sm" c="dimmed">
                  {review.helpful_votes} found helpful
                </Text>
              )}
            </Group>
            
            {review.title && (
              <Text fw={500} mb="sm">
                {review.title}
              </Text>
            )}
            
            {review.content && (
              <Box mb="md">
                <Text 
                  size="sm" 
                  style={{ 
                    lineHeight: 1.6,
                    ...(review.content.length > 300 && expandedReview !== review.id && {
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    })
                  }}
                >
                  {review.content}
                </Text>
                
                {review.content.length > 300 && (
                  <Button
                    variant="subtle"
                    size="xs"
                    onClick={() => toggleReviewExpansion(review.id)}
                    rightSection={
                      expandedReview === review.id ? 
                        <IconChevronUp size={12} /> : 
                        <IconChevronDown size={12} />
                    }
                    mt="xs"
                  >
                    {expandedReview === review.id ? 'Show Less' : 'Read More'}
                  </Button>
                )}
              </Box>
            )}
            
            {/* Seller Response */}
            {review.response_from_seller && (
              <Paper bg="gray.1" p="md" radius="sm" mt="md">
                <Text size="sm" fw={500} mb="xs">
                  Response from {review.response_from_seller.author_name}
                </Text>
                <Text size="sm" style={{ lineHeight: 1.6 }}>
                  {review.response_from_seller.content}
                </Text>
                <Text size="xs" c="dimmed" mt="xs">
                  {new Date(review.response_from_seller.created_at).toLocaleDateString()}
                </Text>
              </Paper>
            )}
            
            {/* Helpful Voting */}
            <Group justify="space-between" mt="md" pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
              <Text size="sm" c="dimmed">
                Was this review helpful?
              </Text>
              
              <Group gap="xs">
                <ActionIcon
                  variant="outline"
                  size="sm"
                  onClick={() => handleHelpfulClick(review.id, true)}
                >
                  <IconThumbUp size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="outline"
                  size="sm"
                  onClick={() => handleHelpfulClick(review.id, false)}
                >
                  <IconThumbDown size={14} />
                </ActionIcon>
              </Group>
            </Group>
          </Paper>
        ))}
      </Stack>
      
      {reviews.length === 0 && summary.total_reviews === 0 && (
        <Paper shadow="xs" radius="md" p="xl" withBorder ta="center">
          <Text c="dimmed" mb="md">
            No reviews yet for this product.
          </Text>
          {showReviewForm && (
            <Button
              variant="light"
              onClick={() => setShowWriteReview(true)}
              leftSection={<IconEdit size={16} />}
            >
              Be the first to review
            </Button>
          )}
        </Paper>
      )}
    </Box>
  );
}