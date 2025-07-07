// Blog system types and interfaces

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featured_image?: string;
  meta_title?: string;
  meta_description?: string;
  author_id?: string;
  status: 'draft' | 'published' | 'scheduled';
  published_at?: string;
  created_at: string;
  updated_at: string;
  
  // SEO and Social Media
  og_title?: string;
  og_description?: string;
  og_image?: string;
  twitter_title?: string;
  twitter_description?: string;
  twitter_image?: string;
  
  // Content Management
  tags?: string[];
  categories?: string[];
  reading_time?: number;
  
  // Scheduling
  scheduled_for?: string;
  
  // Analytics
  view_count?: number;
}

export interface BlogPostData {
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featured_image?: string;
  meta_title?: string;
  meta_description?: string;
  status: 'draft' | 'published' | 'scheduled';
  published_at?: string;
  
  // SEO and Social Media
  og_title?: string;
  og_description?: string;
  og_image?: string;
  twitter_title?: string;
  twitter_description?: string;
  twitter_image?: string;
  
  // Content Management
  tags?: string[];
  categories?: string[];
  
  // Scheduling
  scheduled_for?: string;
}

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  created_at: string;
}

export interface BlogTag {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface BlogPostResponse {
  posts: BlogPost[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BlogPostCardProps {
  post: BlogPost;
  storeSlug?: string;
  showExcerpt?: boolean;
  showDate?: boolean;
  showAuthor?: boolean;
  showCategories?: boolean;
  showTags?: boolean;
}

export interface BlogPostListProps {
  posts: BlogPost[];
  pagination?: PaginationData;
  storeSlug?: string;
  showFilters?: boolean;
  loading?: boolean;
}

export interface BlogPostProps {
  post: BlogPost;
  showRelated?: boolean;
  showSocial?: boolean;
  showComments?: boolean;
}

export interface BlogEditorProps {
  initialContent?: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  height?: number;
}

export interface BlogPostFormProps {
  post?: BlogPost;
  onSave: (post: BlogPostData) => void;
  onCancel: () => void;
  isEditing?: boolean;
  loading?: boolean;
}

export interface BlogSchedulerProps {
  currentDate?: Date;
  onSchedule: (date: Date) => void;
  onPublishNow: () => void;
  disabled?: boolean;
}

export interface BlogSEOProps {
  post: BlogPost;
  isIndividualPost?: boolean;
}

export interface PaginationData {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface BlogFilters {
  category?: string;
  tag?: string;
  status?: 'draft' | 'published' | 'scheduled';
  search?: string;
}

export interface BlogStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  scheduledPosts: number;
  totalViews: number;
  popularPosts: BlogPost[];
}

export interface BlogAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface BlogUploadResponse {
  success: boolean;
  url?: string;
  error?: string;
}

export interface BlogSlugResponse {
  success: boolean;
  slug?: string;
  error?: string;
}

// Rich text editor types
export interface EditorToolbarConfig {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  link?: boolean;
  image?: boolean;
  video?: boolean;
  code?: boolean;
  blockquote?: boolean;
  list?: boolean;
  header?: boolean;
  clean?: boolean;
}

export interface EditorFormats {
  'font'?: string[];
  'size'?: string[];
  'header'?: number[];
  'color'?: string[];
  'background'?: string[];
  'align'?: string[];
  'list'?: string[];
  'indent'?: string[];
  'script'?: string[];
  'blockquote'?: boolean;
  'code-block'?: boolean;
  'link'?: boolean;
  'image'?: boolean;
  'video'?: boolean;
  'bold'?: boolean;
  'italic'?: boolean;
  'underline'?: boolean;
  'strike'?: boolean;
  'clean'?: boolean;
}