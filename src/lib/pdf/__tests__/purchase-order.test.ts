import { generatePurchaseOrderPDF } from '../purchase-order';

// Mock the @react-pdf/renderer to avoid PDF generation in tests
jest.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => children,
  Page: ({ children }: { children: React.ReactNode }) => children,
  Text: ({ children }: { children: React.ReactNode }) => children,
  View: ({ children }: { children: React.ReactNode }) => children,
  StyleSheet: {
    create: (styles: Record<string, unknown>) => styles,
  },
  Font: {
    register: jest.fn(),
  },
  pdf: jest.fn(() => ({
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-pdf-buffer')),
    toBlob: jest.fn().mockResolvedValue(new Blob(['mock-pdf-blob'])),
  })),
}));

describe('PurchaseOrderPDF', () => {
  const mockPurchaseOrderData = {
    id: 'po-123',
    store_id: '12345',
    supplier_id: '67890',
    purchase_order_number: 'PO-001',
    status: 'approved' as const,
    order_date: new Date('2024-01-15'),
    expected_delivery_date: new Date('2024-01-30'),
    received_date: null,
    subtotal: 2500.00,
    tax_amount: 200.00,
    shipping_amount: 50.00,
    total_amount: 2750.00,
    currency: 'USD',
    payment_status: 'pending' as const,
    payment_terms: 'Net 30',
    notes: 'Rush order - please expedite shipping',
    created_at: new Date('2024-01-15'),
    updated_at: new Date('2024-01-15'),
    created_by: 'admin-123',
    approved_by: 'admin-123',
    approved_at: new Date('2024-01-15'),
    supplier: {
      id: '67890',
      store_id: '12345',
      name: 'ABC Supply Co.',
      contact_person: 'John Smith',
      email: 'john@abcsupply.com',
      phone: '(555) 123-4567',
      address: {
        street: '123 Industrial Blvd',
        city: 'Manufacturing City',
        state: 'CA',
        postal_code: '90210',
        country: 'US',
        company: 'ABC Supply Co.',
      },
      tax_id: '12-3456789',
      payment_terms: 'Net 30',
      notes: 'Reliable supplier for industrial parts',
      is_active: true,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    },
    store: {
      id: '12345',
      name: 'Your Store Name',
      address: '456 Business Ave',
      city: 'Business City',
      state: 'CA',
      zip: '90210',
      contact_email: 'admin@yourstore.com',
      contact_phone: '(555) 987-6543',
    },
    items: [
      {
        id: 'item-1',
        purchase_order_id: 'po-123',
        product_id: 'prod-1',
        sku: 'PART-001',
        product_name: 'Industrial Widget A',
        description: 'High-quality industrial widget for manufacturing',
        quantity_ordered: 100,
        quantity_received: 0,
        unit_cost: 15.00,
        total_cost: 1500.00,
        created_at: new Date('2024-01-15'),
        updated_at: new Date('2024-01-15'),
      },
      {
        id: 'item-2',
        purchase_order_id: 'po-123',
        product_id: 'prod-2',
        sku: 'PART-002',
        product_name: 'Industrial Widget B',
        description: 'Premium industrial widget with extended warranty',
        quantity_ordered: 50,
        quantity_received: 0,
        unit_cost: 20.00,
        total_cost: 1000.00,
        created_at: new Date('2024-01-15'),
        updated_at: new Date('2024-01-15'),
      },
    ],
  };

  describe('generatePurchaseOrderPDF', () => {
    it('should generate a PDF buffer for a purchase order', async () => {
      const pdfBuffer = await generatePurchaseOrderPDF(mockPurchaseOrderData);
      
      expect(pdfBuffer).toBeDefined();
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.toString()).toBe('mock-pdf-buffer');
    });

    it('should handle purchase order data with all required fields', async () => {
      const pdfBuffer = await generatePurchaseOrderPDF(mockPurchaseOrderData);
      
      expect(pdfBuffer).toBeDefined();
      // Additional assertions could be added here to verify the PDF content
    });

    it('should handle purchase order data with missing optional fields', async () => {
      const minimalData = {
        ...mockPurchaseOrderData,
        expected_delivery_date: null,
        notes: null,
        supplier: {
          ...mockPurchaseOrderData.supplier,
          contact_person: null,
          email: null,
          phone: null,
          address: null,
        },
      };

      const pdfBuffer = await generatePurchaseOrderPDF(minimalData);
      
      expect(pdfBuffer).toBeDefined();
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    });

    it('should handle empty items array', async () => {
      const dataWithNoItems = {
        ...mockPurchaseOrderData,
        items: [],
      };

      const pdfBuffer = await generatePurchaseOrderPDF(dataWithNoItems);
      
      expect(pdfBuffer).toBeDefined();
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    });

    it('should handle different currencies', async () => {
      const eurData = {
        ...mockPurchaseOrderData,
        currency: 'EUR',
      };

      const pdfBuffer = await generatePurchaseOrderPDF(eurData);
      
      expect(pdfBuffer).toBeDefined();
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    });

    it('should handle different order statuses', async () => {
      const statuses = ['draft', 'pending', 'approved', 'sent', 'received', 'cancelled'] as const;
      
      for (const status of statuses) {
        const statusData = {
          ...mockPurchaseOrderData,
          status,
        };

        const pdfBuffer = await generatePurchaseOrderPDF(statusData);
        
        expect(pdfBuffer).toBeDefined();
        expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      }
    });
  });
});