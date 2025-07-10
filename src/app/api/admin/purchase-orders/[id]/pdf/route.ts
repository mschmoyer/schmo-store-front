import { NextRequest, NextResponse } from 'next/server';
import { generatePurchaseOrderPDF } from '@/lib/pdf/purchase-order';

/**
 * GET /api/admin/purchase-orders/[id]/pdf
 * 
 * Generates and returns a PDF for a purchase order
 * 
 * @param request - Next.js request object
 * @param context - Route context with parameters
 * @returns PDF file response or error
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const purchaseOrderId = params.id;

    if (!purchaseOrderId) {
      return NextResponse.json(
        { error: 'Purchase order ID is required' },
        { status: 400 }
      );
    }

    // Create mock data for PDF generation since tables don't exist yet
    const mockPurchaseOrderData = {
      id: purchaseOrderId,
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
          purchase_order_id: purchaseOrderId,
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
          purchase_order_id: purchaseOrderId,
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

    // Generate PDF
    const pdfBuffer = await generatePurchaseOrderPDF(mockPurchaseOrderData);

    // Return PDF response
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="purchase-order-${mockPurchaseOrderData.purchase_order_number}.pdf"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });

  } catch (error) {
    console.error('Error generating purchase order PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/purchase-orders/[id]/pdf
 * 
 * Alternative endpoint for generating PDF with custom options
 * 
 * @param request - Next.js request object
 * @param context - Route context with parameters
 * @returns PDF file response or error
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const purchaseOrderId = params.id;
    const body = await request.json();
    const { options } = body;

    if (!purchaseOrderId) {
      return NextResponse.json(
        { error: 'Purchase order ID is required' },
        { status: 400 }
      );
    }

    // Create mock data for PDF generation since tables don't exist yet
    const mockPurchaseOrderData = {
      id: purchaseOrderId,
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
          purchase_order_id: purchaseOrderId,
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
          purchase_order_id: purchaseOrderId,
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

    // Generate PDF with custom options
    const pdfBuffer = await generatePurchaseOrderPDF(mockPurchaseOrderData);

    // Determine response type based on options
    const isDownload = options?.download !== false;
    const filename = options?.filename || `purchase-order-${mockPurchaseOrderData.purchase_order_number}.pdf`;

    if (isDownload) {
      // Return as download
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    } else {
      // Return as inline PDF
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      });
    }

  } catch (error) {
    console.error('Error generating purchase order PDF:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}