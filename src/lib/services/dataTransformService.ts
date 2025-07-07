import { Builder, Parser } from 'xml2js';
import {
  UUID,
  Order,
  OrderItem,
  Store,
  Product,
  Address
} from '@/lib/types/database';

/**
 * Data Transformation Service
 * 
 * Handles conversion between internal order format and ShipStation XML format:
 * - Convert orders to ShipStation XML format
 * - Handle address normalization and validation
 * - Map product data including SKU, weight, dimensions
 * - Transform order data for export/import
 * 
 * @example
 * ```typescript
 * const transformer = new DataTransformService();
 * const xml = await transformer.convertOrderToShipStationXML(order, orderItems);
 * const normalized = transformer.normalizeAddress(address);
 * ```
 */
export class DataTransformService {
  private xmlBuilder: Builder;
  private xmlParser: Parser;

  constructor() {
    this.xmlBuilder = new Builder({
      rootName: 'Orders',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true, indent: '  ' }
    });

    this.xmlParser = new Parser({
      explicitArray: false,
      ignoreAttrs: false,
      mergeAttrs: true
    });
  }

  /**
   * Convert internal order format to ShipStation XML format
   * @param order - Order data
   * @param orderItems - Order items
   * @param store - Store data
   * @param products - Product data map
   * @returns Promise<string> - XML string
   */
  async convertOrderToShipStationXML(
    order: Order,
    orderItems: OrderItem[],
    store: Store,
    products?: Map<UUID, Product>
  ): Promise<string> {
    try {
      // Normalize addresses
      const billingAddress = this.normalizeAddress({
        street: order.billing_address_line1 || order.shipping_address_line1,
        city: order.billing_city || order.shipping_city,
        state: order.billing_state || order.shipping_state,
        postal_code: order.billing_postal_code || order.shipping_postal_code,
        country: order.billing_country || order.shipping_country || 'US',
        company: '',
        phone: order.customer_phone
      });

      const shippingAddress = this.normalizeAddress({
        street: order.shipping_address_line1,
        city: order.shipping_city,
        state: order.shipping_state,
        postal_code: order.shipping_postal_code,
        country: order.shipping_country || 'US',
        company: '',
        phone: order.customer_phone
      });

      // Validate addresses
      const billingValidation = this.validateAddress(billingAddress);
      const shippingValidation = this.validateAddress(shippingAddress);

      if (!billingValidation.isValid) {
        console.warn(`Billing address validation issues: ${billingValidation.errors.join(', ')}`);
      }

      if (!shippingValidation.isValid) {
        console.warn(`Shipping address validation issues: ${shippingValidation.errors.join(', ')}`);
      }

      // Transform order items
      const transformedItems = await this.transformOrderItems(orderItems, products);

      // Calculate totals
      const itemsTotal = transformedItems.reduce((sum, item) => sum + (item.UnitPrice * item.Quantity), 0);
      const taxAmount = order.tax_amount || 0;
      const shippingAmount = order.shipping_amount || 0;
      const discountAmount = order.discount_amount || 0;

      // Build ShipStation order object
      const shipStationOrder = {
        Order: {
          OrderNumber: order.order_number,
          OrderKey: order.shipstation_order_key || order.order_number,
          OrderDate: this.formatDate(order.created_at),
          PaymentDate: order.payment_status === 'paid' ? this.formatDate(order.created_at) : null,
          ShipByDate: order.shipped_at ? this.formatDate(order.shipped_at) : null,
          OrderStatus: this.mapOrderStatus(order.status),
          LastModified: this.formatDate(order.updated_at),
          ShippingMethod: order.shipping_method || 'Standard',
          PaymentMethod: order.payment_method || 'Credit Card',
          OrderTotal: this.formatMoney(order.total_amount),
          TaxAmount: this.formatMoney(taxAmount),
          ShippingAmount: this.formatMoney(shippingAmount),
          CustomField1: store.store_name,
          CustomField2: store.id,
          CustomField3: order.notes || '',
          Source: 'RebelCart',
          
          // Customer information
          Customer: {
            CustomerCode: order.customer_email,
            BillTo: {
              Name: `${order.customer_first_name} ${order.customer_last_name}`,
              Company: billingAddress.company || '',
              Street1: billingAddress.street,
              Street2: '',
              City: billingAddress.city,
              State: billingAddress.state,
              PostalCode: billingAddress.postal_code,
              Country: billingAddress.country,
              Phone: billingAddress.phone || '',
              Email: order.customer_email
            },
            ShipTo: {
              Name: `${order.shipping_first_name || order.customer_first_name} ${order.shipping_last_name || order.customer_last_name}`,
              Company: shippingAddress.company || '',
              Street1: shippingAddress.street,
              Street2: order.shipping_address_line2 || '',
              City: shippingAddress.city,
              State: shippingAddress.state,
              PostalCode: shippingAddress.postal_code,
              Country: shippingAddress.country,
              Phone: shippingAddress.phone || '',
              Email: order.customer_email
            }
          },

          // Order items
          Items: {
            Item: transformedItems.map(item => ({
              LineItemID: item.LineItemID,
              SKU: item.SKU,
              Name: item.Name,
              ImageUrl: item.ImageUrl,
              Weight: item.Weight,
              WeightUnits: item.WeightUnits,
              Quantity: item.Quantity,
              UnitPrice: this.formatMoney(item.UnitPrice),
              TaxAmount: this.formatMoney(item.TaxAmount || 0),
              ShippingAmount: this.formatMoney(0),
              WarehouseLocation: item.WarehouseLocation || '',
              ProductID: item.ProductID,
              FulfillmentSku: item.SKU,
              Adjustment: false,
              Upc: item.UPC || '',
              Options: item.Options || []
            }))
          },

          // Dimensions and weight
          Dimensions: this.calculateOrderDimensions(transformedItems),
          
          // Insurance and shipping options
          InsuranceOptions: {
            Provider: 'carrier',
            InsureShipment: false,
            InsuredValue: 0
          },

          // International options (if international shipping)
          InternationalOptions: shippingAddress.country !== 'US' ? {
            Contents: 'merchandise',
            CustomsItems: transformedItems.map(item => ({
              Description: item.Name,
              Quantity: item.Quantity,
              Value: item.UnitPrice,
              HarmonizedTariffCode: '',
              CountryOfOrigin: 'US'
            })),
            NonDelivery: 'return_to_sender'
          } : null,

          // Advanced options
          AdvancedOptions: {
            WarehouseId: process.env.SHIPSTATION_WAREHOUSE_ID || null,
            NonMachinable: false,
            SaturdayDelivery: false,
            ContainsAlcohol: false,
            StoreId: store.id,
            CustomField1: store.store_name,
            CustomField2: `RebelCart Order ${order.order_number}`,
            CustomField3: order.notes || '',
            Source: 'RebelCart',
            MergeOption: null,
            ParentId: null,
            BillToParty: null,
            BillToAccount: null,
            BillToPostalCode: null,
            BillToCountryCode: null
          }
        }
      };

      // Convert to XML
      const xml = this.xmlBuilder.buildObject({ Orders: { Order: shipStationOrder.Order } });
      
      console.log(`Generated ShipStation XML for order ${order.order_number}`);
      return xml;

    } catch (error) {
      console.error('Error converting order to ShipStation XML:', error);
      throw new Error(`Failed to convert order to XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Transform order items to ShipStation format
   * @param orderItems - Order items
   * @param products - Product data map
   * @returns Promise<TransformedItem[]>
   */
  private async transformOrderItems(
    orderItems: OrderItem[],
    products?: Map<UUID, Product>
  ): Promise<Array<{
    LineItemID: string;
    SKU: string;
    Name: string;
    ImageUrl: string;
    Weight: number;
    WeightUnits: string;
    Quantity: number;
    UnitPrice: number;
    TaxAmount?: number;
    WarehouseLocation?: string;
    ProductID: string;
    UPC?: string;
    Options?: any[];
  }>> {
    return orderItems.map((item, index) => {
      const product = products?.get(item.product_id);
      
      return {
        LineItemID: item.id,
        SKU: item.product_sku || `ITEM-${index + 1}`,
        Name: item.product_name,
        ImageUrl: item.product_image_url || '',
        Weight: this.calculateItemWeight(product),
        WeightUnits: 'pounds',
        Quantity: item.quantity,
        UnitPrice: item.unit_price,
        TaxAmount: 0, // Tax is calculated at order level
        WarehouseLocation: '',
        ProductID: item.product_id,
        UPC: product?.barcode || '',
        Options: []
      };
    });
  }

  /**
   * Calculate item weight
   * @param product - Product data
   * @returns number - Weight in pounds
   */
  private calculateItemWeight(product?: Product): number {
    if (!product?.weight) {
      return 0.5; // Default weight for items without specified weight
    }

    // Convert weight to pounds if needed
    const weightUnit = product.weight_unit?.toLowerCase() || 'lb';
    let weightInPounds = product.weight;

    switch (weightUnit) {
      case 'kg':
      case 'kilogram':
      case 'kilograms':
        weightInPounds = product.weight * 2.20462;
        break;
      case 'g':
      case 'gram':
      case 'grams':
        weightInPounds = product.weight * 0.00220462;
        break;
      case 'oz':
      case 'ounce':
      case 'ounces':
        weightInPounds = product.weight / 16;
        break;
      // Default to pounds
      case 'lb':
      case 'lbs':
      case 'pound':
      case 'pounds':
      default:
        weightInPounds = product.weight;
        break;
    }

    return Math.max(0.1, weightInPounds); // Minimum 0.1 pounds
  }

  /**
   * Calculate order dimensions
   * @param items - Transformed items
   * @returns Dimensions object
   */
  private calculateOrderDimensions(items: any[]): {
    Length: number;
    Width: number;
    Height: number;
    Units: string;
  } {
    // Simple box packing algorithm - sum volumes and calculate cube root
    const totalVolume = items.reduce((volume, item) => {
      // Default dimensions if not specified
      const length = 6; // inches
      const width = 4;   // inches
      const height = 2;  // inches
      return volume + (length * width * height * item.Quantity);
    }, 0);

    const cubeRoot = Math.cbrt(totalVolume);
    
    return {
      Length: Math.max(6, Math.ceil(cubeRoot * 1.5)), // Length is usually the longest dimension
      Width: Math.max(4, Math.ceil(cubeRoot)),
      Height: Math.max(2, Math.ceil(cubeRoot * 0.5)),
      Units: 'inches'
    };
  }

  /**
   * Normalize address data
   * @param address - Raw address data
   * @returns Normalized address
   */
  normalizeAddress(address: Partial<Address>): Address {
    return {
      street: this.normalizeStreet(address.street || ''),
      city: this.normalizeCity(address.city || ''),
      state: this.normalizeState(address.state || ''),
      postal_code: this.normalizePostalCode(address.postal_code || ''),
      country: this.normalizeCountry(address.country || 'US'),
      company: address.company?.trim() || '',
      phone: this.normalizePhone(address.phone || '')
    };
  }

  /**
   * Validate address data
   * @param address - Address to validate
   * @returns Validation result
   */
  validateAddress(address: Address): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!address.street.trim()) {
      errors.push('Street address is required');
    }

    if (!address.city.trim()) {
      errors.push('City is required');
    }

    if (!address.state.trim()) {
      errors.push('State is required');
    }

    if (!address.postal_code.trim()) {
      errors.push('Postal code is required');
    }

    if (!address.country.trim()) {
      errors.push('Country is required');
    }

    // Validate US postal codes
    if (address.country === 'US' && !/^\d{5}(-\d{4})?$/.test(address.postal_code)) {
      errors.push('Invalid US postal code format');
    }

    // Validate US states
    if (address.country === 'US' && !this.isValidUSState(address.state)) {
      errors.push('Invalid US state code');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Normalize street address
   * @param street - Raw street address
   * @returns Normalized street address
   */
  private normalizeStreet(street: string): string {
    return street
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b(street|st)\b/gi, 'St')
      .replace(/\b(avenue|ave)\b/gi, 'Ave')
      .replace(/\b(road|rd)\b/gi, 'Rd')
      .replace(/\b(boulevard|blvd)\b/gi, 'Blvd')
      .replace(/\b(drive|dr)\b/gi, 'Dr')
      .replace(/\b(lane|ln)\b/gi, 'Ln')
      .replace(/\b(court|ct)\b/gi, 'Ct')
      .replace(/\b(place|pl)\b/gi, 'Pl')
      .replace(/\b(apartment|apt)\b/gi, 'Apt')
      .replace(/\b(suite|ste)\b/gi, 'Ste')
      .replace(/\b(unit|un)\b/gi, 'Unit')
      .replace(/\b(building|bldg)\b/gi, 'Bldg');
  }

  /**
   * Normalize city name
   * @param city - Raw city name
   * @returns Normalized city name
   */
  private normalizeCity(city: string): string {
    return city
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase());
  }

  /**
   * Normalize state code
   * @param state - Raw state
   * @returns Normalized state code
   */
  private normalizeState(state: string): string {
    const stateMap: Record<string, string> = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
      'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
      'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
      'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
      'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
      'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
      'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
      'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
      'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
      'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
      'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
      'wisconsin': 'WI', 'wyoming': 'WY',
      'district of columbia': 'DC', 'puerto rico': 'PR'
    };

    const normalized = state.trim().toLowerCase();
    return stateMap[normalized] || state.trim().toUpperCase();
  }

  /**
   * Normalize postal code
   * @param postalCode - Raw postal code
   * @returns Normalized postal code
   */
  private normalizePostalCode(postalCode: string): string {
    return postalCode
      .trim()
      .replace(/\s+/g, '')
      .toUpperCase();
  }

  /**
   * Normalize country code
   * @param country - Raw country
   * @returns Normalized country code
   */
  private normalizeCountry(country: string): string {
    const countryMap: Record<string, string> = {
      'united states': 'US',
      'usa': 'US',
      'canada': 'CA',
      'mexico': 'MX',
      'united kingdom': 'GB',
      'uk': 'GB',
      'great britain': 'GB'
    };

    const normalized = country.trim().toLowerCase();
    return countryMap[normalized] || country.trim().toUpperCase();
  }

  /**
   * Normalize phone number
   * @param phone - Raw phone number
   * @returns Normalized phone number
   */
  private normalizePhone(phone: string): string {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    
    // Format US phone numbers
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phone.trim();
  }

  /**
   * Check if state code is valid US state
   * @param state - State code
   * @returns boolean
   */
  private isValidUSState(state: string): boolean {
    const validStates = [
      'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
      'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
      'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
      'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
      'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
      'DC', 'PR'
    ];
    
    return validStates.includes(state.toUpperCase());
  }

  /**
   * Map internal order status to ShipStation status
   * @param status - Internal order status
   * @returns ShipStation status
   */
  private mapOrderStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'awaiting_payment',
      'confirmed': 'awaiting_fulfillment',
      'processing': 'awaiting_shipment',
      'shipped': 'shipped',
      'delivered': 'shipped', // ShipStation doesn't have delivered status
      'cancelled': 'cancelled',
      'refunded': 'cancelled'
    };

    return statusMap[status] || 'awaiting_fulfillment';
  }

  /**
   * Format date for ShipStation
   * @param date - Date to format
   * @returns Formatted date string
   */
  private formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toISOString().replace(/\.\d{3}Z$/, '');
  }

  /**
   * Format money value
   * @param amount - Amount to format
   * @returns Formatted money string
   */
  private formatMoney(amount: number): string {
    return amount.toFixed(2);
  }

  /**
   * Parse ShipStation XML response
   * @param xml - XML string
   * @returns Promise<any> - Parsed object
   */
  async parseShipStationXML(xml: string): Promise<any> {
    try {
      const result = await this.xmlParser.parseStringPromise(xml);
      return result;
    } catch (error) {
      console.error('Error parsing ShipStation XML:', error);
      throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert ShipStation XML to internal order format
   * @param xml - ShipStation XML
   * @returns Promise<any> - Internal order object
   */
  async convertShipStationXMLToOrder(xml: string): Promise<any> {
    try {
      const parsed = await this.parseShipStationXML(xml);
      
      // Transform ShipStation order to internal format
      // This would be used for importing orders from ShipStation
      // Implementation depends on specific ShipStation XML structure
      
      console.log('Converted ShipStation XML to internal format');
      return parsed;
      
    } catch (error) {
      console.error('Error converting ShipStation XML to order:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const dataTransformService = new DataTransformService();