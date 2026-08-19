/**
 * Utility functions for ShipStation integration
 */

import { Order } from '@/lib/types/database';

/** `MM/dd/yyyy` with an optional `HH:mm[:ss]` and an optional AM/PM marker. */
const SHIPSTATION_DATE_PATTERN =
  /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?\s*$/;

/**
 * Parse a ShipStation date (`MM/dd/yyyy HH:mm`) into a Date.
 *
 * ShipStation sends `start_date` / `end_date` in UTC, so the components are
 * assembled with `Date.UTC`. Building a local-time Date instead shifted the
 * export window by the host's offset, which silently returned the wrong set of
 * orders anywhere the server was not on UTC.
 *
 * The XSD also permits 12-hour notation and an optional seconds component, so
 * both are accepted. Malformed input throws rather than yielding an Invalid
 * Date that would later widen the query to everything.
 *
 * @param dateString - Date string in ShipStation format
 * @returns Date at the parsed UTC instant
 * @throws {Error} If the string is malformed or names a day that does not exist
 */
export function parseShipStationDate(dateString: string): Date {
  const match = SHIPSTATION_DATE_PATTERN.exec(dateString ?? '');

  if (!match) {
    throw new Error(
      `Invalid ShipStation date "${dateString}". Expected MM/dd/yyyy HH:mm in UTC.`
    );
  }

  const [, rawMonth, rawDay, rawYear, rawHours = '0', rawMinutes = '0', rawSeconds = '0', meridiem] =
    match;

  const month = parseInt(rawMonth, 10);
  const day = parseInt(rawDay, 10);
  const year = parseInt(rawYear, 10);
  const minutes = parseInt(rawMinutes, 10);
  const seconds = parseInt(rawSeconds, 10);
  let hours = parseInt(rawHours, 10);

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      throw new Error(`Invalid ShipStation date "${dateString}". Hour must be 1-12 with AM/PM.`);
    }
    const isAfternoon = meridiem.toLowerCase() === 'pm';
    hours = isAfternoon ? (hours === 12 ? 12 : hours + 12) : hours === 12 ? 0 : hours;
  }

  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error(`Invalid ShipStation date "${dateString}". Time component out of range.`);
  }

  const parsed = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

  // Date.UTC rolls overflow forward (02/31 becomes 03/03), so reject anything
  // that did not survive the round trip rather than querying a different day.
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error(`Invalid ShipStation date "${dateString}". That calendar day does not exist.`);
  }

  return parsed;
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
/**
 * Format a money value that is already in decimal dollars.
 *
 * The `orders` and `order_items` tables store money as `DECIMAL(10,2)` dollars,
 * and node-postgres hands numerics back as strings to preserve precision. That
 * makes them the one place `formatMoney` (which divides integer cents by 100)
 * must not be used — doing so reported every total at a hundredth of its value.
 *
 * @param amount - Decimal dollars as a string, number, null or undefined
 * @returns Amount with exactly two decimal places, `"0.00"` when absent
 */
export function formatDecimalMoney(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') {
    return '0.00';
  }

  const value = typeof amount === 'number' ? amount : Number(amount);

  if (!Number.isFinite(value)) {
    return '0.00';
  }

  return value.toFixed(2);
}

/**
 * Build an XML error document for the Custom Store endpoint.
 *
 * ShipStation parses the export response as XML, so a JSON error body is
 * reported to the merchant only as an opaque parse failure. Returning XML makes
 * the reason visible in ShipStation's own error surface.
 *
 * @param message - Human-readable explanation, emitted inside a CDATA section
 * @returns XML document with a root `<Error>` element
 */
export function formatShipStationXmlError(message: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Error>${createCDATA(message)}</Error>`;
}

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
  // `Math.max(1, NaN)` is NaN, so an unparseable `?page=` used to reach the
  // query as `LIMIT NaN OFFSET NaN` and fail the request with a 500 rather than
  // a 400. Anything not a usable number falls back to the default.
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safePageSize = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 50;

  return {
    page: safePage,
    pageSize: Math.min(500, safePageSize) // ShipStation max is 500
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