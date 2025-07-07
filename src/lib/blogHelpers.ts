import { BlogPost } from '@/types/blog';
import slugify from 'slugify';
import readingTime from 'reading-time';

// Date formatting utilities
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const formatDateShort = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 7) {
    return formatDateShort(dateString);
  } else if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  } else {
    return 'Just now';
  }
};

// Content processing utilities
export const stripHtml = (html: string): string => {
  return html.replace(/<[^>]*>/g, '');
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > 0) {
    return truncated.slice(0, lastSpace) + '...';
  }
  
  return truncated + '...';
};

export const getFirstParagraph = (html: string): string => {
  const match = html.match(/<p[^>]*>(.*?)<\/p>/);
  return match ? stripHtml(match[1]) : stripHtml(html);
};

export const extractTextFromHtml = (html: string, maxLength: number = 160): string => {
  const text = stripHtml(html);
  return truncateText(text, maxLength);
};

// SEO utilities
export const generateMetaTitle = (title: string, siteName: string = 'Schmo Store'): string => {
  return `${title} - ${siteName}`;
};

export const generateMetaDescription = (excerpt: string, maxLength: number = 160): string => {
  return truncateText(excerpt, maxLength);
};

export const generateBreadcrumbs = (post: BlogPost) => {
  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Blog', href: '/blog' },
    { label: post.title, href: `/blog/${post.slug}` }
  ];

  if (post.categories && post.categories.length > 0) {
    breadcrumbs.splice(2, 0, {
      label: post.categories[0],
      href: `/blog?category=${post.categories[0]}`
    });
  }

  return breadcrumbs;
};

// URL utilities
export const createBlogUrl = (slug: string, storeSlug?: string): string => {
  if (storeSlug) {
    return `/blog/${storeSlug}/${slug}`;
  }
  return `/blog/${slug}`; // Fallback for backward compatibility
};

export const createCategoryUrl = (category: string, storeSlug?: string): string => {
  if (storeSlug) {
    return `/blog/${storeSlug}?category=${encodeURIComponent(category)}`;
  }
  return `/blog?category=${encodeURIComponent(category)}`;
};

export const createTagUrl = (tag: string, storeSlug?: string): string => {
  if (storeSlug) {
    return `/blog/${storeSlug}?tag=${encodeURIComponent(tag)}`;
  }
  return `/blog?tag=${encodeURIComponent(tag)}`;
};

export const createAuthorUrl = (authorId: string): string => {
  return `/blog?author=${authorId}`;
};

// Social sharing utilities
export const generateSocialShareUrls = (post: BlogPost) => {
  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}${createBlogUrl(post.slug)}`;
  const title = encodeURIComponent(post.title);
  const text = encodeURIComponent(post.excerpt || extractTextFromHtml(post.content));

  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${title}`,
    linkedin: `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(url)}&title=${title}&summary=${text}`,
    reddit: `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${title}`,
    email: `mailto:?subject=${title}&body=${text}%20${encodeURIComponent(url)}`,
    copy: url
  };
};

// Content validation utilities
export const validateBlogPost = (post: Partial<BlogPost>): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!post.title || post.title.trim().length === 0) {
    errors.push('Title is required');
  }

  if (!post.content || post.content.trim().length === 0) {
    errors.push('Content is required');
  }

  if (!post.slug || post.slug.trim().length === 0) {
    errors.push('Slug is required');
  }

  if (post.title && post.title.length > 255) {
    errors.push('Title must be less than 255 characters');
  }

  if (post.meta_title && post.meta_title.length > 255) {
    errors.push('Meta title must be less than 255 characters');
  }

  if (post.meta_description && post.meta_description.length > 500) {
    errors.push('Meta description must be less than 500 characters');
  }

  if (post.excerpt && post.excerpt.length > 500) {
    errors.push('Excerpt must be less than 500 characters');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Status utilities
export const getStatusColor = (status: BlogPost['status']): string => {
  switch (status) {
    case 'published':
      return 'green';
    case 'draft':
      return 'gray';
    case 'scheduled':
      return 'blue';
    default:
      return 'gray';
  }
};

export const getStatusLabel = (status: BlogPost['status']): string => {
  switch (status) {
    case 'published':
      return 'Published';
    case 'draft':
      return 'Draft';
    case 'scheduled':
      return 'Scheduled';
    default:
      return 'Unknown';
  }
};

export const canEditPost = (post: BlogPost): boolean => {
  return post.status === 'draft' || post.status === 'scheduled';
};

export const canPublishPost = (post: BlogPost): boolean => {
  return post.status === 'draft' || post.status === 'scheduled';
};

export const canSchedulePost = (post: BlogPost): boolean => {
  return post.status === 'draft';
};

// Search utilities
export const highlightSearchTerm = (text: string, searchTerm: string): string => {
  if (!searchTerm) return text;
  
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};

export const searchPosts = (posts: BlogPost[], searchTerm: string): BlogPost[] => {
  if (!searchTerm) return posts;
  
  const term = searchTerm.toLowerCase();
  return posts.filter(post => 
    post.title.toLowerCase().includes(term) ||
    post.excerpt?.toLowerCase().includes(term) ||
    stripHtml(post.content).toLowerCase().includes(term) ||
    post.tags?.some(tag => tag.toLowerCase().includes(term)) ||
    post.categories?.some(category => category.toLowerCase().includes(term))
  );
};

// Analytics utilities
export const formatViewCount = (count: number): string => {
  if (count < 1000) {
    return count.toString();
  } else if (count < 1000000) {
    return `${(count / 1000).toFixed(1)}K`;
  } else {
    return `${(count / 1000000).toFixed(1)}M`;
  }
};

export const calculateEngagementRate = (views: number, shares: number = 0): number => {
  if (views === 0) return 0;
  return (shares / views) * 100;
};

// Image utilities
export const getImageUrl = (imagePath?: string): string => {
  if (!imagePath) return '/logo.svg'; // Default fallback image
  
  // If it's already a full URL, return as is
  if (imagePath.startsWith('http')) {
    return imagePath;
  }
  
  // If it's a relative path, make it absolute
  if (imagePath.startsWith('/')) {
    return imagePath;
  }
  
  // Otherwise, assume it's in the public folder
  return `/${imagePath}`;
};

export const generateImageAlt = (post: BlogPost): string => {
  return `Featured image for ${post.title}`;
};

// Category and tag utilities
export const formatCategoryName = (category: string): string => {
  return category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
};

export const formatTagName = (tag: string): string => {
  return tag.charAt(0).toUpperCase() + tag.slice(1).replace(/-/g, ' ');
};

export const getCategoryColor = (category: string): string => {
  const colors = ['blue', 'green', 'yellow', 'red', 'purple', 'pink', 'indigo', 'teal'];
  const index = category.length % colors.length;
  return colors[index];
};

export const getTagColor = (tag: string): string => {
  const colors = ['gray', 'blue', 'green', 'yellow', 'red', 'purple', 'pink', 'indigo'];
  const index = tag.length % colors.length;
  return colors[index];
};

// Content preview utilities
export const generatePreviewContent = (content: string, maxLength: number = 300): string => {
  const textContent = stripHtml(content);
  return truncateText(textContent, maxLength);
};

export const shouldShowReadMore = (content: string, previewLength: number = 300): boolean => {
  const textContent = stripHtml(content);
  return textContent.length > previewLength;
};

// Sorting utilities
export const sortPostsByDate = (posts: BlogPost[], ascending: boolean = false): BlogPost[] => {
  return [...posts].sort((a, b) => {
    const dateA = new Date(a.published_at || a.created_at);
    const dateB = new Date(b.published_at || b.created_at);
    
    if (ascending) {
      return dateA.getTime() - dateB.getTime();
    } else {
      return dateB.getTime() - dateA.getTime();
    }
  });
};

export const sortPostsByViews = (posts: BlogPost[], ascending: boolean = false): BlogPost[] => {
  return [...posts].sort((a, b) => {
    const viewsA = a.view_count || 0;
    const viewsB = b.view_count || 0;
    
    if (ascending) {
      return viewsA - viewsB;
    } else {
      return viewsB - viewsA;
    }
  });
};

export const sortPostsByTitle = (posts: BlogPost[], ascending: boolean = true): BlogPost[] => {
  return [...posts].sort((a, b) => {
    if (ascending) {
      return a.title.localeCompare(b.title);
    } else {
      return b.title.localeCompare(a.title);
    }
  });
};

// Additional utility functions that were in blog.ts
export function generateSlug(title: string): string {
  return slugify(title, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g
  });
}

export function generateExcerpt(content: string, maxLength: number = 160): string {
  // Remove HTML tags and get plain text
  const plainText = content
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  if (plainText.length <= maxLength) {
    return plainText;
  }
  
  // Find the last space within the limit to avoid cutting words
  const truncated = plainText.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

export function calculateReadingTime(content: string): number {
  const stats = readingTime(content);
  return Math.ceil(stats.minutes);
}