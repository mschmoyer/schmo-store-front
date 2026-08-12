'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import InventoryTurnoverReport from '@/components/admin/reports/InventoryTurnoverReport';
import StockValuationReport from '@/components/admin/reports/StockValuationReport';
import DeadStockAnalysisReport from '@/components/admin/reports/DeadStockAnalysisReport';
import { Container, Paper, Button } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { PanelSkeleton } from '@/components/admin/AdminSkeletons';

/*
 * The route map.
 *
 * `dead-stock` was commented out of this object in one line while its
 * component (175+ lines) and its API (returning a well-formed payload with
 * carrying cost, liquidation value and recovery value) both worked. The effect
 * was worse than a missing feature: the `if (!ReportComponent) router.push(…)`
 * fallback below sent you silently back to the Inventory page with no error, so
 * "Generate Report" looked like it had done nothing at all.
 *
 * `supplier-performance` is *removed* rather than restored, because unlike
 * dead-stock there is no component and no API behind it — only a title string
 * and a button. Listing a report that cannot exist is the same dead end in a
 * different costume.
 */
const reportComponents = {
  'turnover': InventoryTurnoverReport,
  'valuation': StockValuationReport,
  'dead-stock': DeadStockAnalysisReport,
};

const reportTitles: Record<keyof typeof reportComponents, string> = {
  'turnover': 'Inventory Turnover Report',
  'valuation': 'Stock Valuation Report',
  'dead-stock': 'Dead Stock Analysis',
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