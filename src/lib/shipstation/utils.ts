/**
 * Utility functions for ShipStation integration
 */

import { Order } from '@/lib/types/database';

/**
 * Convert Date to ShipStation format (MM/dd/yyyy HH:mm)
 * @param date - JavaScript Date object
 * @returns Formatted date string
 */
export function formatDateForShipStation(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

/**
 * Parse ShipStation date format (MM/dd/yyyy HH:mm) to JavaScript Date
 * @param dateString - Date string in ShipStation format
 * @returns JavaScript Date object
 */
export function parseShipStationDate(dateString: string): Date {
  const [datePart, timePart] = dateString.split(' ');
  const [month, day, year] = datePart.split('/');
  const [hours, minutes] = timePart.split(':');
  
  return new Date(
    parseInt(year),
    parseInt(month) - 1, // JavaScript months are 0-indexed
    parseInt(day),
    parseInt(hours),
    parseInt(minutes)
  );
}

/**
 * Map internal order status to ShipStation status
 * @param internalStatus - Internal order status
 * @returns ShipStation compatible status
 */
export function mapOrderStatusToShipStation(internalStatus: Order['status']): string {
  const statusMap: Record<Order['status'], string> = {
    'pending': 'awaiting_payment',
    'confirmed': 'awaiting_fulfillment',
    'processing': 'awaiting_fulfillment',
    'shipped': 'shipped',
    'delivered': 'shipped',
    'cancelled': 'cancelled',
    'refunded': 'cancelled'
  };
  
  return statusMap[internalStatus] || 'awaiting_fulfillment';
}

/**
 * Map ShipStation status to internal order status
 * @param shipStationStatus - ShipStation status
 * @returns Internal order status
 */
export function mapShipStationStatusToInternal(shipStationStatus: string): Order['status'] {
  const statusMap: Record<string, Order['status']> = {
    'awaiting_payment': 'pending',
    'awaiting_fulfillment': 'confirmed',
    'shipped': 'shipped',
    'delivered': 'delivered',
    'cancelled': 'cancelled',
    'on_hold': 'pending'
  };
  
  return statusMap[shipStationStatus] || 'confirmed';
}

/**
 * Create XML-safe CDATA wrapper
 * @param content - Content to wrap
 * @returns CDATA wrapped content
 */
export function createCDATA(content: string): string {
  if (!content) return '';
  
  // Escape any existing CDATA sequences
  const escapedContent = content.replace(/]]>/g, ']]]]><![CDATA[>');
  
  return `<![CDATA[${escapedContent}]]>`;
}

/**
 * Escape XML special characters
 * @param text - Text to escape
 * @returns Escaped text
 */
export function escapeXML(text: string): string {
  if (!text) return '';
  
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format error response for ShipStation API
 * @param error - Error message
 * @param code - Optional error code
 * @returns Formatted error response
 */
export function formatShipStationError(error: string, code?: string): string {
  return JSON.stringify({
    error: {
      message: error,
      code: code || 'GENERAL_ERROR',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * Generate order number if not provided
 * @param storeId - Store ID
 * @param orderId - Order ID
 * @returns Generated order number
 */
export function generateOrderNumber(storeId: string, orderId: string): string {
  const timestamp = Date.now().toString(36);
  const shortStoreId = storeId.substring(0, 8);
  const shortOrderId = orderId.substring(0, 8);
  
  return `${shortStoreId}-${shortOrderId}-${timestamp}`.toUpperCase();
}

/**
 * Validate required fields for order export
 * @param order - Order object to validate
 * @returns Validation result
 */
export function validateOrderForExport(order: Order): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!order.customer_email) {
    errors.push('Customer email is required');
  }
  
  if (!order.shipping_address) {
    errors.push('Shipping address is required');
  } else {
    const addr = order.shipping_address;
    if (!addr.street) errors.push('Shipping address street is required');
    if (!addr.city) errors.push('Shipping address city is required');
    if (!addr.state) errors.push('Shipping address state is required');
    if (!addr.postal_code) errors.push('Shipping address postal code is required');
    if (!addr.country) errors.push('Shipping address country is required');
  }
  
  if (!order.order_number) {
    errors.push('Order number is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Calculate weight in ounces for ShipStation
 * @param weightInPounds - Weight in pounds
 * @returns Weight in ounces
 */
export function convertWeightToOunces(weightInPounds: number): number {
  return Math.round(weightInPounds * 16);
}

/**
 * Format dimensions for ShipStation
 * @param dimensions - Dimensions string (e.g., "10x5x3")
 * @returns Formatted dimensions object
 */
export function parseDimensions(dimensions: string): { length: number; width: number; height: number } {
  const parts = dimensions.split('x').map(part => parseFloat(part.trim()));
  
  return {
    length: parts[0] || 0,
    width: parts[1] || 0,
    height: parts[2] || 0
  };
}

/**
 * Format money value for ShipStation (no currency symbols)
 * @param amount - Amount in cents or dollars
 * @returns Formatted money string
 */
export function formatMoney(amount: number): string {
  return (amount / 100).toFixed(2);
}

/**
 * Create pagination parameters for ShipStation API
 * @param page - Page number (1-based)
 * @param pageSize - Number of items per page
 * @returns Pagination parameters
 */
export function createPaginationParams(page: number = 1, pageSize: number = 50): { page: number; pageSize: number } {
  return {
    page: Math.max(1, page),
    pageSize: Math.min(500, Math.max(1, pageSize)) // ShipStation max is 500
  };
}

/**
 * Generate secure password for ShipStation authentication
 * @param length - Password length (minimum 12, default 24)
 * @returns Secure password string
 */
export function generateSecurePassword(length: number = 24): string {
  const minLength = 12;
  const actualLength = Math.max(minLength, length);
  
  // Character sets for password generation
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  // Ensure at least one character from each set
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest with random characters from all sets
  const allChars = uppercase + lowercase + numbers + symbols;
  for (let i = password.length; i < actualLength; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password to randomize character positions
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Generate secure API key for ShipStation
 * @param length - API key length (minimum 16, default 32)
 * @returns Secure API key string
 */
export function generateSecureApiKey(length: number = 32): string {
  const minLength = 16;
  const actualLength = Math.max(minLength, length);
  
  // Use alphanumeric characters only for API keys
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let apiKey = '';
  
  for (let i = 0; i < actualLength; i++) {
    apiKey += chars[Math.floor(Math.random() * chars.length)];
  }
  
  return apiKey;
}

/**
 * Generate unique username for ShipStation store
 * @param storeId - Optional store ID to include in username
 * @returns Unique username string
 */
export function generateStoreUsername(storeId?: string): string {
  const timestamp = Date.now().toString(36);
  const randomString = Math.random().toString(36).substring(2, 8);
  
  if (storeId) {
    const shortStoreId = storeId.substring(0, 8);
    return `store_${shortStoreId}_${timestamp}_${randomString}`;
  }
  
  return `store_${timestamp}_${randomString}`;
}

/**
 * Copy text to clipboard with fallback
 * @param text - Text to copy
 * @returns Promise that resolves when copy is complete
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand('copy');
      if (!successful) {
        throw new Error('Copy command failed');
      }
    } finally {
      document.body.removeChild(textArea);
    }
  } catch (error) {
    console.error('Failed to copy text to clipboard:', error);
    throw new Error('Failed to copy to clipboard');
  }
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns Validation result with strength score and feedback
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;
  
  // Check length
  if (password.length < 8) {
    feedback.push('Password must be at least 8 characters long');
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }
  
  // Check for uppercase letters
  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Password should contain uppercase letters');
  }
  
  // Check for lowercase letters
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Password should contain lowercase letters');
  }
  
  // Check for numbers
  if (/\d/.test(password)) {
    score += 1;
  } else {
    feedback.push('Password should contain numbers');
  }
  
  // Check for special characters
  if (/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    score += 1;
  } else {
    feedback.push('Password should contain special characters');
  }
  
  // Check for common patterns
  if (!/(.)\1{2,}/.test(password)) {
    score += 1; // No repeated characters
  } else {
    feedback.push('Password should not contain repeated characters');
  }
  
  return {
    isValid: score >= 5 && password.length >= 8,
    score,
    feedback
  };
}

/**
 * Generate endpoint URL for ShipStation webhooks
 * @param baseUrl - Base URL of the store
 * @param storeId - Optional store ID to include in the path
 * @returns Formatted endpoint URL
 */
export function generateEndpointUrl(baseUrl: string, storeId?: string): string {
  try {
    const url = new URL(baseUrl);
    
    // Ensure HTTPS for security
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    
    // Build the webhook path
    let path = '/api/shipstation/webhooks';
    if (storeId) {
      path = `/api/shipstation/webhooks/${storeId}`;
    }
    
    url.pathname = path;
    return url.toString();
  } catch {
    throw new Error('Invalid base URL provided');
  }
}