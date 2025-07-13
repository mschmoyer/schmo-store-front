'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import InventoryTurnoverReport from '@/components/admin/reports/InventoryTurnoverReport';
import StockValuationReport from '@/components/admin/reports/StockValuationReport';
// import DeadStockAnalysisReport from '@/components/admin/reports/DeadStockAnalysisReport';
// import SupplierPerformanceReport from '@/components/admin/reports/SupplierPerformanceReport';
import { Container, Paper, Text, Group, Button, Loader, Center } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';

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

  if (!ReportComponent) {
    return (
      <Center h={400}>
        <Loader size="lg" />
      </Center>
    );
  }

  return (
    <Container size="xl" py="lg">
      <Paper shadow="sm" p="lg" radius="md" withBorder>
        <Group justify="space-between" mb="xl">
          <Group>
            <Button
              variant="subtle"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => router.push('/admin/inventory')}
            >
              Back to Inventory
            </Button>
            <Text size="xl" fw={700}>{reportTitle}</Text>
          </Group>
        </Group>
        
        <ReportComponent />
      </Paper>
    </Container>
  );
}