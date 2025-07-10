/**
 * CSV Export Utility Functions
 * Handles CSV generation for inventory management system
 */

export interface InventoryCSVData {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  low_stock_threshold: number;
  unit_cost: number;
  base_price: number;
  featured_image_url: string | null;
  category: string;
  supplier: string;
  last_restocked: string | null;
  forecast_30_days: number;
  forecast_90_days: number;
  avg_monthly_sales: number;
  reorder_point: number;
  reorder_quantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'discontinued';
  warehouse_id: string | null;
  warehouse_name: string | null;
  shipstation_inventory?: {
    available: number;
    on_hand: number;
    allocated: number;
  };
}

/**
 * Escapes CSV field values to handle special characters
 * @param value - The value to escape
 * @returns Escaped value safe for CSV
 */
export function escapeCSVField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  const stringValue = String(value);
  
  // If the value contains commas, quotes, or newlines, wrap in quotes and escape quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  
  return stringValue;
}

/**
 * Converts inventory data to CSV format
 * @param inventoryData - Array of inventory items
 * @returns CSV string with headers and data
 */
export function convertInventoryToCSV(inventoryData: InventoryCSVData[]): string {
  const headers = [
    'Product Name',
    'SKU',
    'Category',
    'Stock Quantity',
    'Low Stock Threshold',
    'Unit Cost',
    'Base Price',
    'Total Value',
    'Forecast 30 Days',
    'Forecast 90 Days',
    'Average Monthly Sales',
    'Reorder Point',
    'Reorder Quantity',
    'Status',
    'Last Restocked',
    'Supplier',
    'Warehouse ID',
    'Warehouse Name',
    'ShipStation Available',
    'ShipStation On Hand',
    'ShipStation Allocated'
  ];

  const csvRows = [headers.join(',')];

  for (const item of inventoryData) {
    const totalValue = item.stock_quantity * item.unit_cost;
    const lastRestocked = item.last_restocked 
      ? new Date(item.last_restocked).toLocaleDateString()
      : '';
    
    const row = [
      escapeCSVField(item.name),
      escapeCSVField(item.sku),
      escapeCSVField(item.category),
      escapeCSVField(item.stock_quantity),
      escapeCSVField(item.low_stock_threshold),
      escapeCSVField(item.unit_cost.toFixed(2)),
      escapeCSVField(item.base_price.toFixed(2)),
      escapeCSVField(totalValue.toFixed(2)),
      escapeCSVField(item.forecast_30_days),
      escapeCSVField(item.forecast_90_days),
      escapeCSVField(item.avg_monthly_sales),
      escapeCSVField(item.reorder_point),
      escapeCSVField(item.reorder_quantity),
      escapeCSVField(item.status.replace('_', ' ')),
      escapeCSVField(lastRestocked),
      escapeCSVField(item.supplier),
      escapeCSVField(item.warehouse_id || ''),
      escapeCSVField(item.warehouse_name || ''),
      escapeCSVField(item.shipstation_inventory?.available || ''),
      escapeCSVField(item.shipstation_inventory?.on_hand || ''),
      escapeCSVField(item.shipstation_inventory?.allocated || '')
    ];
    
    csvRows.push(row.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Generates filename for CSV export with current timestamp
 * @param prefix - Optional prefix for filename
 * @returns Formatted filename
 */
export function generateCSVFilename(prefix: string = 'inventory'): string {
  const now = new Date();
  const timestamp = now.toISOString().split('T')[0]; // YYYY-MM-DD format
  return `${prefix}_export_${timestamp}.csv`;
}

/**
 * Creates a downloadable CSV file response
 * @param csvContent - CSV content string
 * @param filename - Filename for download
 * @returns Response object for download
 */
export function createCSVDownloadResponse(csvContent: string, filename: string): Response {
  const headers = new Headers({
    'Content-Type': 'text/csv',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  return new Response(csvContent, {
    status: 200,
    headers
  });
}

/**
 * Validates inventory data before CSV export
 * @param inventoryData - Array of inventory items to validate
 * @returns Object with validation result and errors if any
 */
export function validateInventoryData(inventoryData: InventoryCSVData[]): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(inventoryData)) {
    errors.push('Inventory data must be an array');
    return { isValid: false, errors };
  }

  if (inventoryData.length === 0) {
    errors.push('No inventory data to export');
    return { isValid: false, errors };
  }

  // Validate each item has required fields
  for (let i = 0; i < inventoryData.length; i++) {
    const item = inventoryData[i];
    
    if (!item.name || !item.sku) {
      errors.push(`Item at index ${i} is missing required fields (name, sku)`);
    }
    
    if (typeof item.stock_quantity !== 'number' || item.stock_quantity < 0) {
      errors.push(`Item at index ${i} has invalid stock_quantity`);
    }
    
    if (typeof item.unit_cost !== 'number' || item.unit_cost < 0) {
      errors.push(`Item at index ${i} has invalid unit_cost`);
    }
    
    if (typeof item.base_price !== 'number' || item.base_price < 0) {
      errors.push(`Item at index ${i} has invalid base_price`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Formats inventory data for CSV export with additional calculated fields
 * @param inventoryData - Raw inventory data
 * @returns Formatted data ready for CSV conversion
 */
export function formatInventoryForCSV(inventoryData: InventoryCSVData[]): InventoryCSVData[] {
  return inventoryData.map(item => ({
    ...item,
    // Ensure numeric fields are properly formatted
    stock_quantity: Number(item.stock_quantity) || 0,
    low_stock_threshold: Number(item.low_stock_threshold) || 0,
    unit_cost: Number(item.unit_cost) || 0,
    base_price: Number(item.base_price) || 0,
    forecast_30_days: Number(item.forecast_30_days) || 0,
    forecast_90_days: Number(item.forecast_90_days) || 0,
    avg_monthly_sales: Number(item.avg_monthly_sales) || 0,
    reorder_point: Number(item.reorder_point) || 0,
    reorder_quantity: Number(item.reorder_quantity) || 0,
    // Ensure category and supplier have default values
    category: item.category || 'Uncategorized',
    supplier: item.supplier || 'Unknown'
  }));
}