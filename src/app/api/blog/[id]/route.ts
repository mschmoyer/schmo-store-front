import { NextRequest, NextResponse } from 'next/server';
import { blogUtils } from '@/lib/blog';
import { BlogAPIResponse } from '@/types/blog';
import { resolveSession } from '@/lib/auth/session';

// GET /api/blog/[id] - Get a single blog post by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    
    // Try to get storeId from query params first (for public access)
    let storeId = searchParams.get('storeId');
    
    // If no storeId in params, try to get from authenticated user session
    if (!storeId) {
      const user = await resolveSession(request);
      if (user?.storeId) {
        storeId = user.storeId;
      } else {
        return NextResponse.json(
          { success: false, error: 'Store ID required. Provide storeId parameter or authenticate.' },
          { status: 400 }
        );
      }
    }
    
    const post = await blogUtils.getBlogPostById(storeId, id);
    
    if (!post) {
      const response: BlogAPIResponse<null> = {
        success: false,
        error: 'Blog post not found',
        message: `No blog post found with ID: ${id}`
      };
      
      return NextResponse.json(response, { status: 404 });
    }
    
    // Only return published posts for public API, unless it's an admin request
    // TODO: Add admin authentication check here
    if (post.status !== 'published') {
      const response: BlogAPIResponse<null> = {
        success: false,
        error: 'Blog post not found',
        message: 'This blog post is not published'
      };
      
      return NextResponse.json(response, { status: 404 });
    }
    
    const response: BlogAPIResponse<typeof post> = {
      success: true,
      data: post
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    
    const response: BlogAPIResponse<null> = {
      success: false,
      error: 'Failed to fetch blog post',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}


/*
 * `PUT` and `DELETE` used to live here and have been removed.
 *
 * Both took the tenant from a **query parameter** and only consulted the
 * session when that parameter was absent:
 *
 *     let storeId = searchParams.get('storeId');
 *     if (!storeId) { ...check the session... }
 *
 * So supplying `?storeId=<any store>` skipped authentication completely. Store
 * ids are publicly enumerable from `GET /api/stores/public` and post ids from
 * `GET /api/blog?storeId=...`, which made this an unauthenticated cross-tenant
 * write and delete of any merchant's blog — verified against a running server
 * before it was closed.
 *
 * The SQL underneath was correctly scoped (`WHERE ... AND store_id = $n` in
 * `src/lib/blog.ts`), and that is exactly why it did not help: a caller-supplied
 * store id satisfies a store-scoped query. **Scoping the query is only a
 * boundary when the scope itself comes from something the caller cannot
 * choose.**
 *
 * The authenticated equivalents live in `src/app/api/blog/admin/[id]/route.ts`,
 * where the store comes from `requireAuth(request)` and nowhere else.
 *
 * The `GET` above keeps its `storeId` query parameter: it is a public read of
 * published posts, so the parameter selects *what to show*, not *who you are*.
 * A query parameter may never select the tenant for a write.
 */
