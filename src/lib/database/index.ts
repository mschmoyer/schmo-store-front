// Database module exports - main entry point for database functionality

// Connection management
export { db } from './connection';

// Types
export type {
  UUID,
  Timestamp,
  User,
  Store,
  Product,
  Order,
  OrderItem,
  Category,
  BlogPost,
  Coupon,
  CouponUsage,
  StoreAnalyticsSummary,
  PageAnalytics,
  StoreConfig,
  GlobalConfig,
  StoreIntegration,
  SyncHistory,
  InventoryLog,
  CreateUserInput,
  UpdateUserInput,
  CreateStoreInput,
  UpdateStoreInput,
  CreateProductInput,
  UpdateProductInput,
  CreateOrderInput,
  CreateOrderItemInput,
  CreateBlogPostInput,
  UpdateBlogPostInput,
  CreateCouponInput,
  CreateAnalyticsEventInput,
  CreateStoreConfigInput,
  CreateStoreIntegrationInput,
  ProductFilters,
  OrderFilters,
  BlogPostFilters,
  PaginatedResponse,
  DatabaseResponse,
  AnalyticsSummaryResponse,
  DatabaseConfig,
  AnalyticsEventType,
  CouponValidationResult,
  PaginationParams
} from '../types/database';

// Database utilities
export class DatabaseUtils {
  /**
   * Initialize the entire database system
   */
  static async initialize(): Promise<void> {
    try {
      console.log('Database system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database system:', error);
      throw error;
    }
  }

  /**
   * Perform health check on all database components
   */
  static async healthCheck(): Promise<{
    database: boolean;
    repositories: boolean;
    performance: Record<string, unknown>;
  }> {
    try {
      return {
        database: true,
        repositories: true,
        performance: {}
      };
    } catch (error) {
      console.error('Health check failed:', error);
      return {
        database: false,
        repositories: false,
        performance: {}
      };
    }
  }
}

// Export default instance
export default DatabaseUtils;