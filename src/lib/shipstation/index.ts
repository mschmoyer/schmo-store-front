/**
 * ShipStation Integration Library
 * Export all ShipStation-related services and utilities
 */

// Utilities
export * from './utils';

// Re-export types for convenience
export type {
  Order,
  OrderItem,
  Address,
  ShipmentData,
  ShipStationWebhookPayload,
  OrderStatusUpdateData
} from '@/lib/types/database';