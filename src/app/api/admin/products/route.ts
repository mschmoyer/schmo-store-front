import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database/connection';
import { requireAuth } from '@/lib/auth/session';

// Define types inline since we removed the schema file
interface ProductFilters {
  search?: string;
  category_id?: string;
  is_active?: boolean;
  is_featured?: boolean;
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  tags?: string[];
  sort_by?: 'name' | 'price' | 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
  limit: number;
  offset: number;
}


/**
 * GET /api/admin/products
 * List all products for the authenticated user's store with pagination, stock levels, and sales data
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    
    // Extract pagination parameters
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Extract filter parameters
    const filters: ProductFilters = {
      search: searchParams.get('search') || undefined,
      category_id: searchParams.get('category_id') || undefined,
      is_active: searchParams.get('is_active') === 'true' ? true : 
                 searchParams.get('is_active') === 'false' ? false : undefined,
      is_featured: searchParams.get('is_featured') === 'true' ? true : 
                   searchParams.get('is_featured') === 'false' ? false : undefined,
      min_price: searchParams.get('min_price') ? parseFloat(searchParams.get('min_price')!) : undefined,
      max_price: searchParams.get('max_price') ? parseFloat(searchParams.get('max_price')!) : undefined,
      in_stock: searchParams.get('in_stock') === 'true' ? true : undefined,
      tags: searchParams.get('tags') ? searchParams.get('tags')!.split(',') : undefined,
      sort_by: (searchParams.get('sort_by') as 'name' | 'price' | 'created_at' | 'updated_at') || 'created_at',
      sort_order: (searchParams.get('sort_order') as 'asc' | 'desc') || 'desc',
      limit,
      offset
    };

    // Build the query with filters
    let whereClause = 'WHERE store_id = $1';
    const queryParams: (string | number | boolean)[] = [user.storeId];
    let paramIndex = 2;

    if (filters.search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR short_description ILIKE $${paramIndex} OR long_description ILIKE $${paramIndex})`;
      queryParams.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.category_id) {
      whereClause += ` AND category_id = $${paramIndex}`;
      queryParams.push(filters.category_id);
      paramIndex++;
    }

    if (filters.is_active !== undefined) {
      whereClause += ` AND is_active = $${paramIndex}`;
      queryParams.push(filters.is_active);
      paramIndex++;
    }

    if (filters.is_featured !== undefined) {
      whereClause += ` AND is_featured = $${paramIndex}`;
      queryParams.push(filters.is_featured);
      paramIndex++;
    }

    if (filters.min_price !== undefined) {
      whereClause += ` AND price >= $${paramIndex}`;
      queryParams.push(filters.min_price);
      paramIndex++;
    }

    if (filters.max_price !== undefined) {
      whereClause += ` AND price <= $${paramIndex}`;
      queryParams.push(filters.max_price);
      paramIndex++;
    }

    if (filters.in_stock === true) {
      whereClause += ` AND (track_inventory = false OR stock_quantity > 0)`;
    }

    // Count query
    const countQuery = `SELECT COUNT(*) as total FROM products ${whereClause}`;
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(String(countResult.rows[0]?.total || '0'));

    // Products query with pagination
    const sortBy = filters.sort_by || 'created_at';
    const sortOrder = filters.sort_order || 'desc';
    const productsQuery = `
      SELECT * FROM products 
      ${whereClause} 
      ORDER BY ${sortBy} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(filters.limit, filters.offset);
    
    const productsResult = await db.query(productsQuery, queryParams);
    const products = productsResult.rows;

    // Get enhanced product data with stock levels and sales data
    const enhancedProducts = await Promise.all(
      products.map(async (product) => {
        /*
         * Sales per product.
         *
         * Two fixes. The status filter was `= 'completed'`, so this list
         * showed Aviator Headphones as 1 sale / $199.00 while the dashboard
         * showed 3 — two screens contradicting each other on the same SKU,
         * because one discarded everything shipped and the other counted
         * cancellations. Both now use `<> 'cancelled'`.
         *
         * And `last_sale_date` came from `oi.created_at`, the row's insert
         * timestamp, which for a seeded or imported catalog is today for every
         * product. It is the order's date.
         */
        const salesData = await db.query(`
          SELECT
            COALESCE(SUM(oi.quantity), 0) as total_sales,
            COALESCE(SUM(oi.total_price), 0) as total_revenue,
            COALESCE(SUM(oi.quantity * (oi.unit_price - COALESCE(oi.unit_cost, $3))), 0) as gross_profit,
            COUNT(DISTINCT oi.order_id) as total_orders,
            MAX(o.created_at) as last_sale_date
          FROM order_items oi
          JOIN orders o ON oi.order_id = o.id
          WHERE oi.product_id = $1 AND o.store_id = $2 AND o.status <> 'cancelled'
        `, [product.id, user.storeId, product.cost_price ?? 0]);

        // Get recent inventory changes
        const inventoryData = await db.query(`
          SELECT 
            change_type,
            quantity_change,
            created_at
          FROM inventory_logs
          WHERE product_id = $1 AND store_id = $2
          ORDER BY created_at DESC
          LIMIT 5
        `, [product.id, user.storeId]);

        const sales = salesData.rows[0];
        
        const stockQuantity = Number(product.stock_quantity) || 0;
        const lowStockThreshold = Number(product.low_stock_threshold) || 0;
        
        return {
          ...product,
          stock_status: Boolean(product.track_inventory) ? 
            (stockQuantity > lowStockThreshold ? 'in_stock' : 
             stockQuantity > 0 ? 'low_stock' : 'out_of_stock') : 
            'not_tracked',
          sales_data: {
            total_sales: parseInt(String(sales?.total_sales || '0')),
            total_revenue: parseFloat(String(sales?.total_revenue || '0')),
            gross_profit: parseFloat(String(sales?.gross_profit || '0')),
            total_orders: parseInt(String(sales?.total_orders || '0')),
            last_sale_date: sales?.last_sale_date
          },
          recent_inventory_changes: inventoryData.rows
        };
      })
    );

    // Calculate statistics for all products in the store
    const statsQuery = await db.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_products,
        COUNT(CASE WHEN track_inventory = true AND stock_quantity > low_stock_threshold THEN 1 END) as in_stock_products,
        COUNT(CASE WHEN track_inventory = true AND stock_quantity <= 0 THEN 1 END) as out_of_stock_products,
        COUNT(CASE WHEN track_inventory = true AND stock_quantity > 0 AND stock_quantity <= low_stock_threshold THEN 1 END) as low_stock_products,
        COALESCE(SUM(CASE WHEN track_inventory = true THEN stock_quantity * base_price ELSE 0 END), 0) as total_inventory_value
      FROM products 
      WHERE store_id = $1
    `, [user.storeId]);

    const stats = statsQuery.rows[0] || {};

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return NextResponse.json({
      success: true,
      data: {
        products: enhancedProducts,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext,
          hasPrev
        },
        statistics: {
          total: parseInt(String(stats.total_products || '0')),
          active: parseInt(String(stats.active_products || '0')),
          inStock: parseInt(String(stats.in_stock_products || '0')),
          outOfStock: parseInt(String(stats.out_of_stock_products || '0')),
          lowStock: parseInt(String(stats.low_stock_products || '0')),
          totalValue: parseFloat(String(stats.total_inventory_value || '0'))
        }
      }
    });

  } catch (error) {
    console.error('Admin products GET error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/products
 * Create a new product for the authenticated user's store
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (!user.storeId) {
      return NextResponse.json({
        success: false,
        error: 'Store not found'
      }, { status: 404 });
    }

    const body = await request.json();
    
    // Validate required fields
    const requiredFields = ['sku', 'name', 'slug', 'base_price'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json({
          success: false,
          error: `Missing required field: ${field}`
        }, { status: 400 });
      }
    }

    // Check if SKU already exists in this store
    if (body.sku) {
      const skuCheckResult = await db.query(
        'SELECT id FROM products WHERE sku = $1 AND store_id = $2',
        [body.sku, user.storeId]
      );
      if (skuCheckResult.rows.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'A product with this SKU already exists'
        }, { status: 409 });
      }
    }

    // Check if slug already exists in this store
    const slugCheckResult = await db.query(
      'SELECT id FROM products WHERE slug = $1 AND store_id = $2',
      [body.slug, user.storeId]
    );
    if (slugCheckResult.rows.length > 0) {
      return NextResponse.json({
        success: false,
        error: 'A product with this slug already exists'
      }, { status: 409 });
    }

    // Create the product directly with database query.
    //
    // Three defects lived in this statement and between them meant **no
    // merchant could ever create a product** — every POST 500'd, and the only
    // way product rows appeared on this platform was a ShipStation sync or the
    // demo seed:
    //
    //  1. `compare_price` is not a column. The table carries `sale_price`
    //     (migration 001), so Postgres rejected the whole INSERT with
    //     `column "compare_price" of relation "products" does not exist`.
    //  2. The required-field check above validates `base_price`, but the values
    //     list read `body.price` — so a request that passed validation inserted
    //     `parseFloat(undefined)`, i.e. NaN, into a NOT NULL numeric column.
    //     Both spellings are accepted now, with `base_price` winning.
    //  3. `tags` and `gallery_images` are `TEXT[]`, not JSONB. `JSON.stringify`
    //     handed them the string `["a","b"]`, which node-postgres passes as a
    //     scalar and Postgres refuses to coerce to an array. Arrays go through
    //     as arrays; the driver maps them to the array literal itself.
    const toTextArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

    const basePrice = Number.parseFloat(String(body.base_price ?? body.price));
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return NextResponse.json({
        success: false,
        error: 'base_price must be a non-negative number'
      }, { status: 400 });
    }

    const insertResult = await db.query(`
      INSERT INTO products (
        store_id, sku, name, slug, short_description, long_description, 
        base_price, sale_price, cost_price, track_inventory, stock_quantity,
        allow_backorder, weight, category_id, tags, featured_image_url, gallery_images,
        is_active, is_featured, published_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      ) RETURNING *
    `, [
      user.storeId,
      body.sku || null,
      body.name,
      body.slug,
      body.short_description || null,
      body.long_description || body.description || null,
      basePrice,
      body.sale_price ?? body.compare_price
        ? Number.parseFloat(String(body.sale_price ?? body.compare_price))
        : null,
      body.cost_price ? parseFloat(body.cost_price) : null,
      body.track_inventory ?? true,
      body.inventory_quantity ? parseInt(body.inventory_quantity) : 0,
      body.allow_backorder ?? false,
      body.weight ? parseFloat(body.weight) : null,
      body.category_id || null,
      toTextArray(body.tags),
      body.featured_image_url || null,
      toTextArray(body.images ?? body.gallery_images),
      body.is_active ?? false,
      body.is_featured ?? false,
      body.is_active ? new Date() : null,
      new Date(),
      new Date()
    ]);

    const newProduct = insertResult.rows[0];

    // Log initial inventory if tracking is enabled
    const initialQuantity = body.inventory_quantity ? parseInt(body.inventory_quantity) : 0;
    if ((body.track_inventory ?? true) && initialQuantity > 0) {
      await db.query(`
        INSERT INTO inventory_logs (
          store_id, product_id, change_type, quantity_change, quantity_after, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        user.storeId,
        newProduct.id,
        'initial_stock',
        initialQuantity,
        initialQuantity,
        'Initial stock when product was created'
      ]);
    }

    return NextResponse.json({
      success: true,
      data: {
        product: newProduct,
        message: 'Product created successfully'
      }
    }, { status: 201 });

  } catch (error) {
    console.error('Admin products POST error:', error);
    
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }
    
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}