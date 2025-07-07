// Blog-related TypeScript types
export interface BlogPost {
  id: string;
  storeId: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featuredImageUrl?: string;
  authorName?: string;
  publishedAt?: Date;
  isPublished: boolean;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlogPostCreateRequest {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featuredImageUrl?: string;
  authorName?: string;
  isPublished: boolean;
  publishedAt?: Date;
  seoTitle?: string;
  seoDescription?: string;
}

export interface BlogPostUpdateRequest {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  featuredImageUrl?: string;
  authorName?: string;
  isPublished?: boolean;
  publishedAt?: Date;
  seoTitle?: string;
  seoDescription?: string;
}

export interface BlogPostFilters {
  status?: 'all' | 'published' | 'draft' | 'scheduled';
  author?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
  search?: string;
}

export interface BlogPostListResponse {
  posts: BlogPost[];
  totalCount: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  postCount: number;
  isVisible: boolean;
  sortOrder: number;
}

export interface BlogTag {
  id: string;
  name: string;
  slug: string;
  postCount: number;
  color?: string;
}

export interface BlogComment {
  id: string;
  postId: string;
  author: {
    name: string;
    email: string;
    website?: string;
  };
  content: string;
  isApproved: boolean;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
  replies?: BlogComment[];
}

export interface BlogSettings {
  enableComments: boolean;
  requireApprovalForComments: boolean;
  allowGuestComments: boolean;
  enableRss: boolean;
  postsPerPage: number;
  excerptLength: number;
  dateFormat: string;
  featuredImageSize: {
    width: number;
    height: number;
  };
  seo: {
    defaultTitle: string;
    defaultDescription: string;
    defaultImage?: string;
  };
}

export interface BlogAnalytics {
  period: 'day' | 'week' | 'month' | 'year';
  metrics: {
    totalPosts: number;
    publishedPosts: number;
    draftPosts: number;
    scheduledPosts: number;
    totalViews: number;
    uniqueReaders: number;
    averageReadTime: number;
    commentsCount: number;
    sharesCount: number;
  };
  topPosts: Array<{
    id: string;
    title: string;
    slug: string;
    views: number;
    readTime: number;
    publishedAt: Date;
  }>;
  readerEngagement: {
    averageTimeOnPage: number;
    bounceRate: number;
    pagesPerSession: number;
    returnVisitorRate: number;
  };
  contentPerformance: {
    averageWordsPerPost: number;
    averageImagesPerPost: number;
    mostUsedTags: Array<{
      tag: string;
      count: number;
    }>;
  };
}

export interface BlogRSSFeed {
  title: string;
  description: string;
  link: string;
  language: string;
  lastBuildDate: Date;
  items: Array<{
    title: string;
    link: string;
    description: string;
    pubDate: Date;
    guid: string;
    author: string;
    categories: string[];
  }>;
}

export interface BlogSEO {
  title: string;
  description: string;
  keywords: string[];
  canonicalUrl: string;
  openGraph: {
    title: string;
    description: string;
    image?: string;
    url: string;
    type: string;
  };
  twitter: {
    card: 'summary' | 'summary_large_image';
    title: string;
    description: string;
    image?: string;
  };
  structuredData: {
    '@context': string;
    '@type': string;
    headline: string;
    description: string;
    image?: string;
    datePublished: string;
    dateModified: string;
    author: {
      '@type': string;
      name: string;
    };
    publisher: {
      '@type': string;
      name: string;
    };
  };
}

export interface BlogEditorState {
  content: string;
  wordCount: number;
  readingTime: number;
  lastSaved?: Date;
  isDirty: boolean;
  autosaveEnabled: boolean;
}