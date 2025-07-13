interface SyncResult {
  totalCount: number;
  addedCount: number;
  updatedCount: number;
}

/**
 * Placeholder sync function for inventory warehouses
 * TODO: Implement actual sync logic
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function syncInventoryWarehouses(_apiKey: string, _storeId: string): Promise<SyncResult> {
  console.log('Sync inventory warehouses - not yet implemented');
  return { totalCount: 0, addedCount: 0, updatedCount: 0 };
}