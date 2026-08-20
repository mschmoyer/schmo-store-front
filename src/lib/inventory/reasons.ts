/**
 * The vocabulary of stock movements: what a reason can be, and which ones a person may choose.
 *
 * Deliberately free of any database dependency. The adjustment form in the admin renders this list,
 * and a client component that imported the connection module would pull `pg` into the browser
 * bundle. Keeping it separate also means the rule "which reasons may a merchant post" can be
 * tested without a live database — and that rule has real consequences, because the moment the
 * admin can hand-post a `sale`, "where did sixty units go" stops being answerable.
 */

import { AdminApiError } from '@/lib/api/AdminApiError';

/** Why stock moved. Mirrors the `inventory_reason` enum; keep the two in step. */
export type InventoryReason =
  | 'initial_stock'
  | 'sale'
  | 'return_to_stock'
  | 'po_receipt'
  | 'transfer_in'
  | 'transfer_out'
  | 'cycle_count'
  | 'damage'
  | 'shrinkage'
  | 'expiry'
  | 'sample'
  | 'write_off'
  | 'correction'
  | 'sync_correction';

/** The reasons a merchant may choose by hand, with the wording the admin shows. */
export const MANUAL_REASONS: ReadonlyArray<{
  value: InventoryReason;
  label: string;
  description: string;
  /** Whether this reason normally adds or removes stock. Drives the form's default sign. */
  direction: 'in' | 'out' | 'either';
}> = [
  {
    value: 'cycle_count',
    label: 'Stock count',
    description: 'A physical recount. Adjusts the book to match the shelf.',
    direction: 'either'
  },
  {
    value: 'po_receipt',
    label: 'Received',
    description: 'Goods arrived from a supplier.',
    direction: 'in'
  },
  {
    value: 'return_to_stock',
    label: 'Customer return',
    description: 'Came back saleable and went back on the shelf.',
    direction: 'in'
  },
  {
    value: 'damage',
    label: 'Damaged',
    description: 'Unsaleable through damage. Leaves stock and leaves valuation.',
    direction: 'out'
  },
  {
    value: 'shrinkage',
    label: 'Missing',
    description: 'Gone, cause unknown. The number a loss investigation starts from.',
    direction: 'out'
  },
  {
    value: 'expiry',
    label: 'Expired',
    description: 'Passed its date.',
    direction: 'out'
  },
  {
    value: 'sample',
    label: 'Sample or giveaway',
    description: 'Given away deliberately.',
    direction: 'out'
  },
  {
    value: 'write_off',
    label: 'Write-off',
    description: 'Deliberately removed from stock and from valuation.',
    direction: 'out'
  },
  {
    value: 'correction',
    label: 'Data correction',
    description: 'Fixing a known error in the records, not a physical movement.',
    direction: 'either'
  }
];

const MANUAL_REASON_VALUES = new Set(MANUAL_REASONS.map((r) => r.value));

/**
 * Narrow a caller-supplied reason to one a merchant is allowed to post by hand.
 *
 * `sale`, `transfer_*` and `sync_correction` are excluded deliberately: those are posted by the
 * systems that own them, and letting the admin write them would make the ledger's own vocabulary
 * unreliable for reporting.
 *
 * @param value - Raw reason from a request body.
 * @returns The reason.
 * @throws AdminApiError when the reason is missing or not manually postable.
 */
export function requireManualReason(value: unknown): InventoryReason {
  if (typeof value === 'string' && MANUAL_REASON_VALUES.has(value as InventoryReason)) {
    return value as InventoryReason;
  }
  throw new AdminApiError(
    'Choose why the stock is changing — every adjustment needs a reason',
    400
  );
}
