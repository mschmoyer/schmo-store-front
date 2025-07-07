// Base review type
export interface Review {
  id: string;
  product_id: string;
  user_id?: string;
  user_name: string;
  user_email?: string;
  rating: number; // 1-5 stars
  title?: string;
  content?: string;
  verified_purchase: boolean;
  helpful_votes: number;
  total_votes: number;
  created_at: string;
  updated_at: string;
  moderation_status: 'pending' | 'approved' | 'rejected';
  moderator_notes?: string;
  response_from_seller?: {
    content: string;
    created_at: string;
    author_name: string;
  };
  media_attachments?: ReviewMedia[];
  purchase_verified_at?: string;
  purchase_order_id?: string;
}

// Review media attachments (images, videos)
export interface ReviewMedia {
  id: string;
  review_id: string;
  type: 'image' | 'video';
  url: string;
  thumbnail_url?: string;
  alt_text?: string;
  caption?: string;
  order: number;
  uploaded_at: string;
  file_size?: number;
  mime_type?: string;
  width?: number;
  height?: number;
}

// New review submission type
export interface NewReview {
  product_id: string;
  user_name: string;
  user_email?: string;
  rating: number;
  title?: string;
  content?: string;
  media_attachments?: File[];
  purchase_order_id?: string;
}

// Review update type
export interface ReviewUpdate {
  rating?: number;
  title?: string;
  content?: string;
  media_attachments?: File[];
}

// Review summary/aggregate data
export interface ReviewSummary {
  product_id: string;
  total_reviews: number;
  average_rating: number;
  rating_distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
  verified_purchase_count: number;
  recent_reviews: Review[];
  featured_reviews: Review[];
  most_helpful_review?: Review;
  most_critical_review?: Review;
  sentiment_analysis?: {
    positive: number;
    neutral: number;
    negative: number;
  };
  common_keywords?: {
    keyword: string;
    count: number;
    sentiment: 'positive' | 'negative' | 'neutral';
  }[];
  last_updated: string;
}

// Review filters and sorting
export interface ReviewFilters {
  rating?: number | number[];
  verified_purchase_only?: boolean;
  with_media?: boolean;
  min_helpful_votes?: number;
  date_range?: {
    start: string;
    end: string;
  };
  sort_by?: 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating' | 'most_helpful' | 'verified_first';
  page?: number;
  limit?: number;
}

// Review search results
export interface ReviewSearchResults {
  reviews: Review[];
  total_count: number;
  page: number;
  per_page: number;
  total_pages: number;
  filters_applied: ReviewFilters;
  summary: ReviewSummary;
}

// Review moderation type
export interface ReviewModeration {
  id: string;
  review_id: string;
  moderator_id: string;
  moderator_name: string;
  action: 'approve' | 'reject' | 'flag' | 'edit';
  reason?: string;
  notes?: string;
  created_at: string;
  automated?: boolean;
  confidence_score?: number;
}

// Review helpful vote
export interface ReviewHelpfulVote {
  id: string;
  review_id: string;
  user_id?: string;
  user_ip?: string;
  is_helpful: boolean;
  created_at: string;
}

// Review analytics
export interface ReviewAnalytics {
  product_id: string;
  time_period: 'day' | 'week' | 'month' | 'year';
  metrics: {
    total_reviews: number;
    average_rating: number;
    review_velocity: number; // reviews per time period
    response_rate: number; // percentage of reviews with seller response
    moderation_stats: {
      pending: number;
      approved: number;
      rejected: number;
      auto_approved: number;
    };
    sentiment_trend: {
      date: string;
      positive: number;
      neutral: number;
      negative: number;
    }[];
    rating_trend: {
      date: string;
      average_rating: number;
      review_count: number;
    }[];
  };
}

// Review notification settings
export interface ReviewNotificationSettings {
  user_id: string;
  email_notifications: boolean;
  push_notifications: boolean;
  notification_types: {
    new_review_on_purchased_product: boolean;
    response_to_my_review: boolean;
    helpful_vote_on_my_review: boolean;
    review_moderation_update: boolean;
  };
  frequency: 'immediate' | 'daily' | 'weekly' | 'never';
}

// Review report (for inappropriate content)
export interface ReviewReport {
  id: string;
  review_id: string;
  reporter_id?: string;
  reporter_email?: string;
  reason: 'spam' | 'inappropriate' | 'fake' | 'off_topic' | 'personal_info' | 'other';
  description?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  resolution?: string;
  created_at: string;
  resolved_at?: string;
  resolved_by?: string;
}

// Review form validation
export interface ReviewFormData {
  rating: number;
  title?: string;
  content?: string;
  user_name: string;
  user_email?: string;
  media_files?: File[];
  terms_accepted: boolean;
  purchase_verification?: {
    order_id: string;
    purchase_date: string;
  };
}

// Review widget configuration
export interface ReviewWidgetConfig {
  product_id: string;
  display_options: {
    show_rating_summary: boolean;
    show_review_count: boolean;
    show_rating_distribution: boolean;
    show_verified_badge: boolean;
    show_media_attachments: boolean;
    show_helpful_votes: boolean;
    show_seller_responses: boolean;
  };
  pagination: {
    reviews_per_page: number;
    load_more_button: boolean;
    infinite_scroll: boolean;
  };
  moderation: {
    require_approval: boolean;
    auto_approve_verified: boolean;
    spam_detection: boolean;
    profanity_filter: boolean;
  };
  styling: {
    theme: 'light' | 'dark' | 'auto';
    primary_color: string;
    font_family?: string;
    border_radius?: number;
  };
}

// Review API response types
export interface ReviewAPIResponse {
  success: boolean;
  data?: Review | Review[] | ReviewSummary;
  error?: string;
  message?: string;
  meta?: {
    total_count: number;
    page: number;
    per_page: number;
    total_pages: number;
  };
}

// Review export data
export interface ReviewExportData {
  product_id: string;
  product_name: string;
  export_date: string;
  reviews: Review[];
  summary: ReviewSummary;
  analytics: ReviewAnalytics;
  format: 'csv' | 'json' | 'xlsx';
}

// Review import data
export interface ReviewImportData {
  product_id: string;
  reviews: Omit<Review, 'id' | 'created_at' | 'updated_at'>[];
  validation_errors?: {
    row: number;
    field: string;
    message: string;
  }[];
  import_stats?: {
    total_rows: number;
    successful_imports: number;
    failed_imports: number;
    skipped_rows: number;
  };
}