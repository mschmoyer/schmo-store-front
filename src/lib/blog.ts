import { BlogPost, BlogPostData, BlogFilters, PaginationData } from '@/types/blog';
import { db } from '@/lib/database/connection';
import slugify from 'slugify';
import readingTime from 'reading-time';

// Database result types
interface BlogPostRow {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt?: string;
  featured_image?: string;
  meta_title?: string;
  meta_description?: string;
  status: 'draft' | 'published' | 'scheduled';
  published_at?: string;
  scheduled_for?: string;
  created_at: string;
  updated_at: string;
  tags?: string[];
  categories?: string;
  view_count?: number;
}

interface CountResult {
  count: string;
}

interface CategoryResult {
  category: string;
}

interface TagResult {
  tag: string;
}

interface StatsResult {
  total_posts: string;
  published_posts: string;
  draft_posts: string;
  scheduled_posts: string;
  total_views: string;
}

interface PopularPostResult {
  id: string;
  title: string;
  slug: string;
  view_count: number;
}

// Dynamic import for DOMPurify to handle SSR
let DOMPurify: typeof import('dompurify').default | null = null;
if (typeof window !== 'undefined') {
  import('dompurify').then((module) => {
    DOMPurify = module.default;
  });
}

// Blog utility functions
export const blogUtils = {
  // Get all blog posts with filtering and pagination
  async getBlogPosts(
    storeId: string,
    filters: BlogFilters = {}, 
    pagination: Partial<PaginationData> = {}
  ): Promise<{ posts: BlogPost[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions = ['store_id = $1'];
    const params: (string | number | boolean)[] = [storeId];
    let paramIndex = 2;

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    if (filters.category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(filters.category);
      paramIndex++;
    }

    if (filters.tag) {
      conditions.push(`$${paramIndex} = ANY(tags)`);
      params.push(filters.tag);
      paramIndex++;
    }

    if (filters.search) {
      conditions.push(`(
        title ILIKE $${paramIndex} OR 
        excerpt ILIKE $${paramIndex} OR 
        content ILIKE $${paramIndex}
      )`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `SELECT COUNT(*) as count FROM blog_posts WHERE ${whereClause}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt((countResult.rows[0] as unknown as CountResult).count);

    // Get paginated posts
    const postsQuery = `
      SELECT 
        id, title, slug, content, excerpt, featured_image_url as featured_image,
        meta_title, meta_description, status, published_at, scheduled_for,
        created_at, updated_at, tags, category as categories, view_count
      FROM blog_posts 
      WHERE ${whereClause}
      ORDER BY 
        CASE WHEN published_at IS NOT NULL THEN published_at ELSE created_at END DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const result = await db.query(postsQuery, params);
    const posts = result.rows.map((row) => {
      const blogRow = row as unknown as BlogPostRow;
      return {
        ...blogRow,
        categories: blogRow.categories ? [blogRow.categories] : [],
        tags: blogRow.tags || [],
        reading_time: this.calculateReadingTime(blogRow.content)
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      posts,
      total,
      page,
      limit,
      totalPages
    };
  },

  // Get a single blog post by slug
  async getBlogPost(storeId: string, slug: string): Promise<BlogPost | null> {
    const query = `
      SELECT 
        id, title, slug, content, excerpt, featured_image_url as featured_image,
        meta_title, meta_description, status, published_at, scheduled_for,
        created_at, updated_at, tags, category as categories, view_count
      FROM blog_posts 
      WHERE store_id = $1 AND slug = $2
    `;
    
    const result = await db.query(query, [storeId, slug]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0] as unknown as BlogPostRow;
    return {
      ...row,
      categories: row.categories ? [row.categories] : [],
      tags: row.tags || [],
      reading_time: this.calculateReadingTime(row.content)
    };
  },

  // Get a single blog post by ID
  async getBlogPostById(storeId: string, id: string): Promise<BlogPost | null> {
    const query = `
      SELECT 
        id, title, slug, content, excerpt, featured_image_url as featured_image,
        meta_title, meta_description, status, published_at, scheduled_for,
        created_at, updated_at, tags, category as categories, view_count
      FROM blog_posts 
      WHERE store_id = $1 AND id = $2
    `;
    
    const result = await db.query(query, [storeId, id]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0] as unknown as BlogPostRow;
    return {
      ...row,
      categories: row.categories ? [row.categories] : [],
      tags: row.tags || [],
      reading_time: this.calculateReadingTime(row.content)
    };
  },

  // Create a new blog post
  async createBlogPost(storeId: string, postData: BlogPostData): Promise<BlogPost> {
    const query = `
      INSERT INTO blog_posts (
        store_id, title, slug, content, excerpt, featured_image_url,
        meta_title, meta_description, status, published_at, scheduled_for,
        tags, category
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING 
        id, title, slug, content, excerpt, featured_image_url as featured_image,
        meta_title, meta_description, status, published_at, scheduled_for,
        created_at, updated_at, tags, category as categories, view_count
    `;

    const params = [
      storeId,
      postData.title,
      postData.slug,
      postData.content,
      postData.excerpt,
      postData.featured_image,
      postData.meta_title,
      postData.meta_description,
      postData.status,
      postData.published_at,
      postData.scheduled_for,
      postData.tags,
      postData.categories?.[0] // Store as single category for now
    ];

    const result = await db.query(query, params);
    const row = result.rows[0] as unknown as BlogPostRow;
    
    return {
      ...row,
      categories: row.categories ? [row.categories] : [],
      tags: row.tags || [],
      reading_time: this.calculateReadingTime(row.content)
    };
  },

  // Update an existing blog post
  async updateBlogPost(storeId: string, id: string, postData: Partial<BlogPostData>): Promise<BlogPost | null> {
    const updateFields = [];
    const params = [storeId, id];
    let paramIndex = 3;

    if (postData.title !== undefined) {
      updateFields.push(`title = $${paramIndex}`);
      params.push(postData.title);
      paramIndex++;
    }
    if (postData.slug !== undefined) {
      updateFields.push(`slug = $${paramIndex}`);
      params.push(postData.slug);
      paramIndex++;
    }
    if (postData.content !== undefined) {
      updateFields.push(`content = $${paramIndex}`);
      params.push(postData.content);
      paramIndex++;
    }
    if (postData.excerpt !== undefined) {
      updateFields.push(`excerpt = $${paramIndex}`);
      params.push(postData.excerpt);
      paramIndex++;
    }
    if (postData.featured_image !== undefined) {
      updateFields.push(`featured_image_url = $${paramIndex}`);
      params.push(postData.featured_image);
      paramIndex++;
    }
    if (postData.meta_title !== undefined) {
      updateFields.push(`meta_title = $${paramIndex}`);
      params.push(postData.meta_title);
      paramIndex++;
    }
    if (postData.meta_description !== undefined) {
      updateFields.push(`meta_description = $${paramIndex}`);
      params.push(postData.meta_description);
      paramIndex++;
    }
    if (postData.status !== undefined) {
      updateFields.push(`status = $${paramIndex}`);
      params.push(postData.status);
      paramIndex++;
    }
    if (postData.published_at !== undefined) {
      updateFields.push(`published_at = $${paramIndex}`);
      params.push(postData.published_at);
      paramIndex++;
    }
    if (postData.scheduled_for !== undefined) {
      updateFields.push(`scheduled_for = $${paramIndex}`);
      params.push(postData.scheduled_for);
      paramIndex++;
    }
    if (postData.tags !== undefined) {
      updateFields.push(`tags = $${paramIndex}`);
      params.push(JSON.stringify(postData.tags));
      paramIndex++;
    }
    if (postData.categories !== undefined) {
      updateFields.push(`category = $${paramIndex}`);
      params.push(postData.categories?.[0]);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return this.getBlogPostById(storeId, id);
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    const query = `
      UPDATE blog_posts 
      SET ${updateFields.join(', ')}
      WHERE store_id = $1 AND id = $2
      RETURNING 
        id, title, slug, content, excerpt, featured_image_url as featured_image,
        meta_title, meta_description, status, published_at, scheduled_for,
        created_at, updated_at, tags, category as categories, view_count
    `;

    const result = await db.query(query, params);
    if (result.rows.length === 0) return null;

    const row = result.rows[0] as unknown as BlogPostRow;
    return {
      ...row,
      categories: row.categories ? [row.categories] : [],
      tags: row.tags || [],
      reading_time: this.calculateReadingTime(row.content)
    };
  },

  // Delete a blog post
  async deleteBlogPost(storeId: string, id: string): Promise<boolean> {
    const query = 'DELETE FROM blog_posts WHERE store_id = $1 AND id = $2';
    const result = await db.query(query, [storeId, id]);
    return (result.rowCount ?? 0) > 0;
  },

  // Generate URL slug from title
  generateSlug(title: string): string {
    return slugify(title, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
  },

  // Calculate reading time
  calculateReadingTime(content: string): number {
    const stats = readingTime(content);
    return Math.ceil(stats.minutes);
  },

  // Sanitize HTML content
  sanitizeHTML(html: string): string {
    if (typeof window === 'undefined') {
      // Server-side fallback
      return html;
    }
    return DOMPurify?.sanitize(html, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'hr',
        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'target', 'rel', 'class', 'id',
        'width', 'height', 'style'
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
    }) || html;
  },

  // Generate excerpt from content
  generateExcerpt(content: string, maxLength: number = 160): string {
    // Remove HTML tags
    const textContent = content.replace(/<[^>]*>/g, '');
    
    if (textContent.length <= maxLength) {
      return textContent;
    }

    // Find the last complete word within the limit
    const truncated = textContent.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastSpace > 0) {
      return truncated.slice(0, lastSpace) + '...';
    }
    
    return truncated + '...';
  },

  // Get blog categories
  async getBlogCategories(storeId: string): Promise<string[]> {
    const query = `
      SELECT DISTINCT category 
      FROM blog_posts 
      WHERE store_id = $1 AND category IS NOT NULL
      ORDER BY category
    `;
    const result = await db.query(query, [storeId]);
    return result.rows.map((row) => (row as unknown as CategoryResult).category);
  },

  // Get blog tags
  async getBlogTags(storeId: string): Promise<string[]> {
    const query = `
      SELECT DISTINCT unnest(tags) as tag 
      FROM blog_posts 
      WHERE store_id = $1 AND tags IS NOT NULL
      ORDER BY tag
    `;
    const result = await db.query(query, [storeId]);
    return result.rows.map((row) => (row as unknown as TagResult).tag);
  },

  // Get blog statistics
  async getBlogStats(storeId: string) {
    const statsQuery = `
      SELECT 
        COUNT(*) as total_posts,
        COUNT(CASE WHEN status = 'published' THEN 1 END) as published_posts,
        COUNT(CASE WHEN status = 'draft' THEN 1 END) as draft_posts,
        COUNT(CASE WHEN status = 'scheduled' THEN 1 END) as scheduled_posts,
        COALESCE(SUM(view_count), 0) as total_views
      FROM blog_posts 
      WHERE store_id = $1
    `;
    
    const popularQuery = `
      SELECT 
        id, title, slug, view_count
      FROM blog_posts 
      WHERE store_id = $1 AND status = 'published'
      ORDER BY view_count DESC 
      LIMIT 5
    `;

    const [statsResult, popularResult] = await Promise.all([
      db.query(statsQuery, [storeId]),
      db.query(popularQuery, [storeId])
    ]);

    const stats = statsResult.rows[0] as unknown as StatsResult;
    const popularPostsRaw = popularResult.rows as unknown as PopularPostResult[];

    // Transform popular posts to match BlogPost interface (partial data only)
    const popularPosts: BlogPost[] = popularPostsRaw.map(post => ({
      id: String(post.id),
      title: String(post.title),
      slug: String(post.slug),
      content: '', // Not needed for stats
      status: 'published' as const,
      view_count: Number(post.view_count),
      created_at: '', // Not needed for stats
      updated_at: '' // Not needed for stats
    }));

    return {
      totalPosts: parseInt(stats.total_posts),
      publishedPosts: parseInt(stats.published_posts),
      draftPosts: parseInt(stats.draft_posts),
      scheduledPosts: parseInt(stats.scheduled_posts),
      totalViews: parseInt(stats.total_views),
      popularPosts
    };
  },

  // Increment view count
  async incrementViewCount(storeId: string, slug: string): Promise<void> {
    const query = `
      UPDATE blog_posts 
      SET view_count = COALESCE(view_count, 0) + 1
      WHERE store_id = $1 AND slug = $2
    `;
    await db.query(query, [storeId, slug]);
  },

  // Check if slug is unique
  async isSlugUnique(storeId: string, slug: string, excludeId?: string): Promise<boolean> {
    let query = 'SELECT id FROM blog_posts WHERE store_id = $1 AND slug = $2';
    const params = [storeId, slug];
    
    if (excludeId) {
      query += ' AND id != $3';
      params.push(excludeId);
    }
    
    const result = await db.query(query, params);
    return result.rows.length === 0;
  },

  // Get related posts
  async getRelatedPosts(storeId: string, currentPost: BlogPost, limit: number = 3): Promise<Partial<BlogPost>[]> {
    const query = `
      SELECT 
        id, title, slug, excerpt, featured_image_url as featured_image,
        published_at, created_at, tags, category as categories, view_count
      FROM blog_posts 
      WHERE store_id = $1 AND id != $2 AND status = 'published'
      AND (
        category = $3 OR
        tags && $4::text[]
      )
      ORDER BY view_count DESC
      LIMIT $5
    `;
    
    const result = await db.query(query, [
      storeId,
      currentPost.id,
      currentPost.categories?.[0],
      currentPost.tags || [],
      limit
    ]);

    return result.rows.map((row) => {
      const postRow = row as unknown as PopularPostResult;
      return {
        ...postRow,
        categories: (postRow as unknown as Record<string, unknown>).categories ? [(postRow as unknown as Record<string, unknown>).categories as string] : [],
        tags: (postRow as unknown as Record<string, unknown>).tags as string[] || [],
        reading_time: 0 // Not calculating for related posts to save performance
      };
    });
  }
};

export default blogUtils;