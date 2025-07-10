import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from '@react-pdf/renderer';
import { PurchaseOrder, PurchaseOrderItem, Supplier, Store } from '@/lib/types/database';

// Register fonts (optional - for better typography)
Font.register({
  family: 'Open Sans',
  fonts: [
    {
      src: 'https://cdn.jsdelivr.net/npm/open-sans-all@0.1.3/fonts/open-sans-regular.ttf',
    },
    {
      src: 'https://cdn.jsdelivr.net/npm/open-sans-all@0.1.3/fonts/open-sans-600.ttf',
      fontWeight: 600,
    },
  ],
});

// Define styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 40,
    fontFamily: 'Open Sans',
    fontSize: 10,
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#333333',
    paddingBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 600,
    color: '#333333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 20,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#333333',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  column: {
    flexDirection: 'column',
    flex: 1,
  },
  leftColumn: {
    flex: 1,
    marginRight: 20,
  },
  rightColumn: {
    flex: 1,
  },
  infoBox: {
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 4,
    marginBottom: 10,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: '#333333',
    marginBottom: 5,
  },
  infoText: {
    fontSize: 10,
    color: '#666666',
    marginBottom: 2,
  },
  table: {
    marginTop: 10,
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f1f3f4',
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: '#dee2e6',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  tableCell: {
    fontSize: 9,
    color: '#333333',
  },
  tableCellHeader: {
    fontSize: 10,
    fontWeight: 600,
    color: '#333333',
  },
  // Column widths
  col1: { width: '8%' },  // #
  col2: { width: '15%' }, // SKU
  col3: { width: '35%' }, // Product Name
  col4: { width: '10%' }, // Qty
  col5: { width: '12%' }, // Unit Cost
  col6: { width: '12%' }, // Total Cost
  col7: { width: '8%' },  // Status
  
  totalsSection: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  totalsTable: {
    width: '40%',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  totalsLabel: {
    fontSize: 10,
    color: '#666666',
  },
  totalsValue: {
    fontSize: 10,
    fontWeight: 600,
    color: '#333333',
  },
  totalRow: {
    backgroundColor: '#f8f9fa',
    fontWeight: 600,
  },
  footer: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#dee2e6',
    fontSize: 9,
    color: '#666666',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  statusBadge: {
    backgroundColor: '#28a745',
    color: '#ffffff',
    padding: 4,
    borderRadius: 3,
    fontSize: 8,
    textAlign: 'center',
    minWidth: 60,
  },
  statusDraft: {
    backgroundColor: '#6c757d',
  },
  statusPending: {
    backgroundColor: '#ffc107',
    color: '#212529',
  },
  statusApproved: {
    backgroundColor: '#28a745',
  },
  statusSent: {
    backgroundColor: '#17a2b8',
  },
  statusReceived: {
    backgroundColor: '#28a745',
  },
  statusCancelled: {
    backgroundColor: '#dc3545',
  },
});

interface PurchaseOrderWithRelations extends PurchaseOrder {
  supplier: Supplier;
  store: Store;
  items: PurchaseOrderItem[];
}

/**
 * Purchase Order PDF Template Component
 * 
 * Generates a professional PDF document for purchase orders including:
 * - Company information and branding
 * - Supplier details
 * - Order information (date, expected delivery, etc.)
 * - Line items with quantities and costs
 * - Total amounts and payment terms
 * - Professional formatting and styling
 * 
 * @param props - Purchase order data and related information
 * @returns React PDF document component
 */
export const PurchaseOrderPDF: React.FC<{
  purchaseOrder: PurchaseOrderWithRelations;
}> = ({ purchaseOrder }) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: purchaseOrder.currency || 'USD',
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(date));
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft':
        return [styles.statusBadge, styles.statusDraft];
      case 'pending':
        return [styles.statusBadge, styles.statusPending];
      case 'approved':
        return [styles.statusBadge, styles.statusApproved];
      case 'sent':
        return [styles.statusBadge, styles.statusSent];
      case 'received':
      case 'partially_received':
        return [styles.statusBadge, styles.statusReceived];
      case 'cancelled':
        return [styles.statusBadge, styles.statusCancelled];
      default:
        return [styles.statusBadge];
    }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>PURCHASE ORDER</Text>
          <Text style={styles.subtitle}>
            {purchaseOrder.store.name || 'Your Store'}
          </Text>
        </View>

        {/* Order Information and Status */}
        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Purchase Order Details</Text>
              <Text style={styles.infoText}>
                PO Number: {purchaseOrder.purchase_order_number}
              </Text>
              <Text style={styles.infoText}>
                Order Date: {formatDate(purchaseOrder.order_date)}
              </Text>
              {purchaseOrder.expected_delivery_date && (
                <Text style={styles.infoText}>
                  Expected Delivery: {formatDate(purchaseOrder.expected_delivery_date)}
                </Text>
              )}
              <Text style={styles.infoText}>
                Payment Terms: {purchaseOrder.payment_terms || 'Net 30'}
              </Text>
              <View style={{ marginTop: 5 }}>
                <Text style={getStatusStyle(purchaseOrder.status)}>
                  {purchaseOrder.status.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.rightColumn}>
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Company Information</Text>
              <Text style={styles.infoText}>
                {purchaseOrder.store.name || 'Your Store'}
              </Text>
              {purchaseOrder.store.address && (
                <Text style={styles.infoText}>{purchaseOrder.store.address}</Text>
              )}
              {purchaseOrder.store.city && purchaseOrder.store.state && (
                <Text style={styles.infoText}>
                  {purchaseOrder.store.city}, {purchaseOrder.store.state} {purchaseOrder.store.zip}
                </Text>
              )}
              {purchaseOrder.store.contact_email && (
                <Text style={styles.infoText}>
                  Email: {purchaseOrder.store.contact_email}
                </Text>
              )}
              {purchaseOrder.store.contact_phone && (
                <Text style={styles.infoText}>
                  Phone: {purchaseOrder.store.contact_phone}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Supplier Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Supplier Information</Text>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>{purchaseOrder.supplier.name}</Text>
            {purchaseOrder.supplier.contact_person && (
              <Text style={styles.infoText}>
                Contact: {purchaseOrder.supplier.contact_person}
              </Text>
            )}
            {purchaseOrder.supplier.email && (
              <Text style={styles.infoText}>
                Email: {purchaseOrder.supplier.email}
              </Text>
            )}
            {purchaseOrder.supplier.phone && (
              <Text style={styles.infoText}>
                Phone: {purchaseOrder.supplier.phone}
              </Text>
            )}
            {purchaseOrder.supplier.address && (
              <>
                <Text style={styles.infoText}>
                  {purchaseOrder.supplier.address.street}
                </Text>
                <Text style={styles.infoText}>
                  {purchaseOrder.supplier.address.city}, {purchaseOrder.supplier.address.state} {purchaseOrder.supplier.address.postal_code}
                </Text>
                <Text style={styles.infoText}>
                  {purchaseOrder.supplier.address.country}
                </Text>
              </>
            )}
            {purchaseOrder.supplier.tax_id && (
              <Text style={styles.infoText}>
                Tax ID: {purchaseOrder.supplier.tax_id}
              </Text>
            )}
          </View>
        </View>

        {/* Items Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableCellHeader, styles.col1]}>#</Text>
              <Text style={[styles.tableCellHeader, styles.col2]}>SKU</Text>
              <Text style={[styles.tableCellHeader, styles.col3]}>Product Name</Text>
              <Text style={[styles.tableCellHeader, styles.col4]}>Qty</Text>
              <Text style={[styles.tableCellHeader, styles.col5]}>Unit Cost</Text>
              <Text style={[styles.tableCellHeader, styles.col6]}>Total Cost</Text>
              <Text style={[styles.tableCellHeader, styles.col7]}>Status</Text>
            </View>

            {/* Table Rows */}
            {purchaseOrder.items.map((item, index) => (
              <View key={item.id} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.col1]}>{index + 1}</Text>
                <Text style={[styles.tableCell, styles.col2]}>{item.sku || 'N/A'}</Text>
                <Text style={[styles.tableCell, styles.col3]}>
                  {item.product_name}
                  {item.description && (
                    <Text style={{ fontSize: 8, color: '#999999' }}>
                      {'\n'}{item.description}
                    </Text>
                  )}
                </Text>
                <Text style={[styles.tableCell, styles.col4]}>{item.quantity_ordered}</Text>
                <Text style={[styles.tableCell, styles.col5]}>
                  {formatCurrency(item.unit_cost)}
                </Text>
                <Text style={[styles.tableCell, styles.col6]}>
                  {formatCurrency(item.total_cost)}
                </Text>
                <Text style={[styles.tableCell, styles.col7]}>
                  {item.quantity_received >= item.quantity_ordered ? 'Received' : 'Pending'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Totals Section */}
        <View style={styles.totalsSection}>
          <View style={styles.totalsTable}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal:</Text>
              <Text style={styles.totalsValue}>{formatCurrency(purchaseOrder.subtotal)}</Text>
            </View>
            {purchaseOrder.tax_amount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Tax:</Text>
                <Text style={styles.totalsValue}>{formatCurrency(purchaseOrder.tax_amount)}</Text>
              </View>
            )}
            {purchaseOrder.shipping_amount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Shipping:</Text>
                <Text style={styles.totalsValue}>{formatCurrency(purchaseOrder.shipping_amount)}</Text>
              </View>
            )}
            <View style={[styles.totalsRow, styles.totalRow]}>
              <Text style={[styles.totalsLabel, { fontWeight: 600 }]}>Total:</Text>
              <Text style={[styles.totalsValue, { fontSize: 12 }]}>
                {formatCurrency(purchaseOrder.total_amount)}
              </Text>
            </View>
          </View>
        </View>

        {/* Notes Section */}
        {purchaseOrder.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.infoText}>{purchaseOrder.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Text>Generated on: {formatDate(new Date())}</Text>
            <Text>Page 1 of 1</Text>
          </View>
          <View style={styles.footerRow}>
            <Text>Document ID: {purchaseOrder.id}</Text>
            <Text>Payment Status: {purchaseOrder.payment_status.toUpperCase()}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

/**
 * Generate PDF buffer for purchase order
 * 
 * @param purchaseOrder - Purchase order data with relations
 * @returns Promise<Buffer> - PDF buffer
 */
export const generatePurchaseOrderPDF = async (
  purchaseOrder: PurchaseOrderWithRelations
): Promise<Buffer> => {
  const doc = <PurchaseOrderPDF purchaseOrder={purchaseOrder} />;
  const pdfBuffer = await pdf(doc).toBuffer();
  return pdfBuffer;
};

/**
 * Generate PDF blob for download in browser
 * 
 * @param purchaseOrder - Purchase order data with relations
 * @returns Promise<Blob> - PDF blob
 */
export const generatePurchaseOrderPDFBlob = async (
  purchaseOrder: PurchaseOrderWithRelations
): Promise<Blob> => {
  const doc = <PurchaseOrderPDF purchaseOrder={purchaseOrder} />;
  const pdfBlob = await pdf(doc).toBlob();
  return pdfBlob;
};