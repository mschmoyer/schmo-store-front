'use client';

/**
 * CSV import, with the preview step that makes it safe to use.
 *
 * The old modal was a file picker and an "Import" button pointed at a route that did not exist. A
 * blind bulk import is a catastrophe generator even when the route *does* exist: a merchant with
 * one mismapped column can rewrite eight hundred prices and find out afterwards.
 *
 * So the file is always dry-run first. The server validates every row against the real schema
 * inside a transaction and rolls back, and this modal shows exactly what would happen — how many
 * created, how many updated, which rows would fail and why, and which columns it did not
 * recognise. Only then does the "Import" button appear.
 */

import React, { useCallback, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  List,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconFileTypeCsv, IconInfoCircle } from '@tabler/icons-react';

/** What the import endpoint reports for one row. */
interface RowResult {
  line: number;
  sku: string;
  handle: string;
  action: 'create' | 'update' | 'skip' | 'error';
  message?: string;
}

/** The endpoint's summary. */
interface ImportReport {
  dry_run: boolean;
  summary: { rows: number; created: number; updated: number; skipped: number; failed: number };
  unrecognised_columns: string[];
  results: RowResult[];
  message: string;
}

export interface ImportModalProps {
  opened: boolean;
  onClose: () => void;
  /** Called after a successful import so the grid can refresh. */
  onImported: () => void | Promise<void>;
}

/**
 * The import dialog.
 *
 * @param props - {@link ImportModalProps}
 * @returns The modal.
 */
export function ImportModal({ opened, onClose, onImported }: ImportModalProps): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (dryRun: boolean) => {
      if (!file) return;
      setBusy(true);
      setError(null);

      try {
        const form = new FormData();
        form.append('file', file);

        const response = await fetch(`/api/admin/products/import?dry_run=${dryRun}`, {
          method: 'POST',
          body: form
        });
        const payload = await response.json();

        if (!response.ok || payload?.success === false) {
          throw new Error(payload?.error ?? `Import failed (${response.status})`);
        }

        setReport(payload.data);

        if (!dryRun) {
          notifications.show({
            title: 'Import finished',
            message: payload.data.message,
            color: payload.data.summary.failed > 0 ? 'yellow' : 'green',
            autoClose: 10000
          });
          await onImported();
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Import failed');
      } finally {
        setBusy(false);
      }
    },
    [file, onImported]
  );

  const reset = () => {
    setFile(null);
    setReport(null);
    setError(null);
  };

  const failures = report?.results.filter((row) => row.action === 'error') ?? [];

  return (
    <Modal
      opened={opened}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Import products from CSV"
      size="lg"
      centered
    >
      <Stack gap="md">
        <FileInput
          label="CSV file"
          description="Export first if you want the exact column names — a Shopify export works unchanged."
          placeholder="Choose a file"
          accept=".csv,text/csv"
          leftSection={<IconFileTypeCsv size={16} />}
          value={file}
          onChange={(next) => {
            setFile(next);
            /* A new file invalidates the previous preview. Leaving it on screen beside a different
             * file is how someone imports the wrong thing having read the right report. */
            setReport(null);
            setError(null);
          }}
        />

        <Alert variant="light" icon={<IconInfoCircle size={16} />}>
          <Text size="sm">
            Rows are matched on <strong>Variant SKU</strong> or <strong>Handle</strong>. A blank cell
            leaves that field as it is, so you can edit one column and re-import without clearing
            everything else. Stock quantities are ignored — stock moves through the inventory page,
            where a reason is recorded.
          </Text>
        </Alert>

        {error && (
          <Alert color="red" icon={<IconAlertTriangle size={16} />} title="Could not read that file">
            {error}
          </Alert>
        )}

        {report && (
          <Stack gap="sm">
            <Group gap="xs">
              <Badge color="green" variant="light">
                {report.summary.created} to create
              </Badge>
              <Badge variant="light">
                {report.summary.updated} to update
              </Badge>
              {report.summary.skipped > 0 && (
                <Badge color="gray" variant="light">
                  {report.summary.skipped} unchanged
                </Badge>
              )}
              {report.summary.failed > 0 && (
                <Badge color="red" variant="light">
                  {report.summary.failed} would fail
                </Badge>
              )}
            </Group>

            {report.unrecognised_columns.length > 0 && (
              /* Named rather than silently dropped: a merchant whose "Price" column is spelled in
                 a way this importer does not know needs to be told, not left to discover that
                 their prices did not change. */
              <Alert color="yellow" icon={<IconAlertTriangle size={16} />} title="Columns that will be ignored">
                <Text size="sm">{report.unrecognised_columns.join(', ')}</Text>
              </Alert>
            )}

            {failures.length > 0 && (
              <>
                <Text size="sm" fw={600}>
                  Rows that will not import
                </Text>
                <ScrollArea.Autosize mah={220}>
                  <Table striped withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th w={70}>Line</Table.Th>
                        <Table.Th w={140}>SKU</Table.Th>
                        <Table.Th>Why</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {failures.slice(0, 100).map((row) => (
                        <Table.Tr key={`${row.line}-${row.sku}`}>
                          <Table.Td>{row.line}</Table.Td>
                          <Table.Td>{row.sku || row.handle || '—'}</Table.Td>
                          <Table.Td>{row.message}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea.Autosize>
                {failures.length > 100 && (
                  <Text size="xs" c="dimmed">
                    Showing the first 100 of {failures.length}.
                  </Text>
                )}
              </>
            )}

            {report.dry_run ? (
              <Alert variant="light">
                <Text size="sm">
                  Nothing has been saved yet. {report.summary.failed > 0
                    ? 'The rows above will be skipped; everything else will be applied.'
                    : 'Import to apply these changes.'}
                </Text>
              </Alert>
            ) : (
              <Alert variant="light" color="green">
                <Text size="sm">{report.message}</Text>
              </Alert>
            )}
          </Stack>
        )}

        <Group justify="space-between">
          <List size="xs" c="dimmed" spacing={2} listStyleType="none">
            <List.Item>Up to 10,000 rows and 20MB per file.</List.Item>
            <List.Item>New products are created as drafts.</List.Item>
          </List>

          <Group gap="xs">
            <Button
              variant="default"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              {report && !report.dry_run ? 'Done' : 'Cancel'}
            </Button>

            {(!report || report.dry_run) && (
              <>
                <Button
                  variant="default"
                  disabled={!file}
                  loading={busy && !report}
                  onClick={() => void send(true)}
                >
                  Preview
                </Button>
                <Button
                  disabled={!report || report.summary.created + report.summary.updated === 0}
                  loading={busy && Boolean(report)}
                  onClick={() => void send(false)}
                >
                  Import{' '}
                  {report ? `${report.summary.created + report.summary.updated} products` : ''}
                </Button>
              </>
            )}
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
