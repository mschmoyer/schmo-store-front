'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import InventoryTurnoverReport from '@/components/admin/reports/InventoryTurnoverReport';
import StockValuationReport from '@/components/admin/reports/StockValuationReport';
// import DeadStockAnalysisReport from '@/components/admin/reports/DeadStockAnalysisReport';
// import SupplierPerformanceReport from '@/components/admin/reports/SupplierPerformanceReport';
import { Container, Paper, Button } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { PanelSkeleton } from '@/components/admin/AdminSkeletons';

const reportComponents = {
  'turnover': InventoryTurnoverReport,
  'valuation': StockValuationReport,
  // 'dead-stock': DeadStockAnalysisReport,
  // 'supplier-performance': SupplierPerformanceReport,
};

const reportTitles = {
  'turnover': 'Inventory Turnover Report',
  'valuation': 'Stock Valuation Report',
  'dead-stock': 'Dead Stock Analysis',
  'supplier-performance': 'Supplier Performance Report',
};

export default function InventoryReportPage() {
  const params = useParams();
  const router = useRouter();
  const reportType = params.reportType as keyof typeof reportComponents;

  const ReportComponent = reportComponents[reportType];
  const reportTitle = reportTitles[reportType];

  useEffect(() => {
    // Redirect if invalid report type
    if (!ReportComponent) {
      router.push('/admin/inventory');
    }
  }, [ReportComponent, router]);

  /* An unknown report type redirects; this is the single frame before the
     router lands, so it draws the panel that is about to appear rather than a
     spinner in the middle of nothing (§5). */
  if (!ReportComponent) {
    return <PanelSkeleton height={320} label="Opening report" />;
  }

  return (
    <Container size="xl" py="lg">
      <Paper shadow="sm" p="lg" radius="md" withBorder>
        <AdminPageHeader
          title={reportTitle}
          actions={
            <Button
              variant="default"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push('/admin/inventory')}
            >
              Back to inventory
            </Button>
          }
        />
        
        <ReportComponent />
      </Paper>
    </Container>
  );
}