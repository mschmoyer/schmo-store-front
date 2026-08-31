'use client';

/**
 * Where the units went.
 *
 * The movement data has been accumulating since the platform was built and nothing has ever
 * displayed it. A merchant investigating a discrepancy — "we should have forty of these, we have
 * thirty-one" — had no way to ask what happened.
 *
 * The summary above the list is the more useful half. A chronological list answers "what happened
 * on Tuesday"; the summary answers "we lost nine units this quarter, to what", which is the
 * question that actually gets asked, and it is one GROUP BY away now that reason codes come from a
 * closed vocabulary instead of free text.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Drawer,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Table,
  Text
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import table from '@/components/admin/adminTable.module.css';

/** How each reason is worded for a merchant. */
const REASON_LABEL: Record<string, string> = {
  initial_stock: 'Opening balance',
  sale: 'Sold',
  return_to_stock: 'Customer return',
  po_receipt: 'Received',
  transfer_in: 'Transferred in',
  transfer_out: 'Transferred out',
  cycle_count: 'Stock count',
  damage: 'Damaged',
  shrinkage: 'Missing',
  expiry: 'Expired',
  sample: 'Sample',
  write_off: 'Written off',
  correction: 'Correction',
  sync_correction: 'Reconciled with ShipStation'
};

interface Movement {
  id: string;
  reason: string;
  delta: number;
  balance_after: number;
  note: string | null;
  created_at: string;
  location_name: string;
  actor_name: string | null;
  actor_email: string | null;
}

interface SummaryRow {
  reason: string;
  movements: number;
  net_units: number;
  units_in: number;
  units_out: number;
}

export interface LedgerDrawerProps {
  /** The product to show history for, or null when closed. */
  product: { product_id: string; sku: string; name: string } | null;
  onClose: () => void;
}

/**
 * A product's stock movement history.
 *
 * @param props - {@link LedgerDrawerProps}
 * @returns The drawer.
 */
export function LedgerDrawer({ product, onClose }: LedgerDrawerProps): React.ReactElement {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!product) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/inventory/${product.product_id}/ledger?limit=100`, { credentials: 'include' });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error ?? 'Could not load the history');
      }
      setMovements(payload.data.movements);
      setSummary(payload.data.summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the history');
    } finally {
      setLoading(false);
    }
  }, [product]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * The location column only appears once there is more than one, because in a single-location
   * store it is a column of one repeated value — noise that pushes the numbers off a narrow screen.
   */
  const showLocations = new Set(movements.map((m) => m.location_name)).size > 1;

  return (
    <Drawer
      opened={product !== null}
      onClose={onClose}
      position="right"
      size="lg"
      title={product ? `Stock history — ${product.name}` : 'Stock history'}
    >
      {loading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : error ? (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          {error}
        </Alert>
      ) : (
        <Stack gap="lg">
          {summary.length > 0 && (
            <div>
              <Text size="sm" fw={600} mb="xs">
                Where the units went
              </Text>
              <Table>
                <Table.Tbody>
                  {summary.map((row) => (
                    <Table.Tr key={row.reason}>
                      <Table.Td>
                        <Badge variant="light" size="sm">
                          {REASON_LABEL[row.reason] ?? row.reason}
                        </Badge>
                      </Table.Td>
                      <Table.Td className={table.numeric}>
                        <Text size="sm" c="dimmed">
                          {row.movements} {row.movements === 1 ? 'movement' : 'movements'}
                        </Text>
                      </Table.Td>
                      <Table.Td className={table.numeric}>
                        {/* Signed and explicit. A bare "9" in a shrinkage row does not say whether
                            nine went missing or nine came back. */}
                        <Text size="sm" fw={600}>
                          {row.net_units > 0 ? '+' : ''}
                          {row.net_units.toLocaleString()}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </div>
          )}

          <div>
            <Text size="sm" fw={600} mb="xs">
              Every movement
            </Text>
            {movements.length === 0 ? (
              <Text size="sm" c="dimmed">
                No stock movements recorded yet.
              </Text>
            ) : (
              <ScrollArea.Autosize mah="60vh">
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>When</Table.Th>
                      <Table.Th>What</Table.Th>
                      {/* Which location. `location_name` was fetched, declared on the type, and
                          never rendered — and the balance column is *per location*, so in a
                          two-location store the history read as nonsense: a `+3` transfer in
                          appeared to reduce the balance and the `-3` out appeared to raise it,
                          because consecutive rows were describing different shelves. This is the
                          screen a merchant opens to explain a discrepancy. */}
                      {showLocations && <Table.Th>Where</Table.Th>}
                      <Table.Th className={table.numeric}>Change</Table.Th>
                      <Table.Th className={table.numeric}>Balance</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {movements.map((movement) => (
                      <Table.Tr key={movement.id}>
                        <Table.Td>
                          <Text size="xs">
                            {new Date(movement.created_at).toLocaleDateString(undefined, {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {new Date(movement.created_at).toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{REASON_LABEL[movement.reason] ?? movement.reason}</Text>
                          {movement.note && (
                            <Text size="xs" c="dimmed">
                              {movement.note}
                            </Text>
                          )}
                          {/* Who did it. `inventory_logs` had no user column at all, so the old
                              trail could only say "someone did, via the admin panel". */}
                          {movement.actor_name && (
                            <Text size="xs" c="dimmed">
                              {movement.actor_name}
                            </Text>
                          )}
                        </Table.Td>
                        {showLocations && (
                          <Table.Td>
                            <Text size="xs" c="dimmed">
                              {movement.location_name}
                            </Text>
                          </Table.Td>
                        )}
                        <Table.Td className={table.numeric}>
                          <Text size="sm" fw={600}>
                            {movement.delta > 0 ? '+' : ''}
                            {movement.delta.toLocaleString()}
                          </Text>
                        </Table.Td>
                        <Table.Td className={table.numeric}>
                          {/* Labelled as the balance *there*, not the product's total, which is
                              what makes the column readable once more than one location exists. */}
                          <Text size="sm">{movement.balance_after.toLocaleString()}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            )}
          </div>

          <Text size="xs" c="dimmed">
            Movements cannot be edited or deleted. A mistake is corrected by posting an opposing
            entry, so the original stays visible.
          </Text>
        </Stack>
      )}
    </Drawer>
  );
}
