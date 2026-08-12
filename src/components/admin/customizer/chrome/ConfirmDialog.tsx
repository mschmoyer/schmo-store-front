'use client';

/**
 * A confirmation for the three actions that throw work away: discarding the
 * draft, switching preset, and resetting to a preset.
 *
 * Each one names what will be lost and what will survive, because "Are you
 * sure?" is not information.
 */

import * as React from 'react';

import { Button, Modal } from '@/components/ui';

export interface ConfirmDialogProps {
  opened: boolean;
  title: string;
  description?: string;
  /** The consequence, spelled out. */
  body: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A blocking confirmation dialog.
 * @param props - {@link ConfirmDialogProps}
 * @returns The dialog
 */
export function ConfirmDialog({
  opened,
  title,
  description,
  body,
  confirmLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.ReactElement {
  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            size="sm"
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body}
    </Modal>
  );
}
