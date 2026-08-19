/**
 * ShipStation Integration Library
 * Export all ShipStation-related services and utilities
 */

// Authentication — Custom Store Basic auth (@channel custom-store)
export * from './customStoreAuth';

// XML Processing
export * from './xmlBuilder';
export * from './xmlParser';

// Utilities
export * from './utils';

// Re-export types for convenience
export type {
  ShipmentNotificationData,
  ParsedOrderData
} from './xmlParser';

export type {
  Order,
  OrderItem,
  Address,
  ShipmentData,
  ShipStationWebhookPayload,
  OrderStatusUpdateData
} from '@/lib/types/database';