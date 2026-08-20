'use client';

/**
 * What to do with the products you have selected.
 *
 * Bulk actions used to be three items — list, unlist, delete — inside a modal, behind an "Actions"
 * menu, three clicks from the selection they applied to, posting to a route that did not exist.
 * The operations a merchant actually performs in bulk, in rough order of frequency, were all
 * missing: change prices, set a reorder point, tag, categorise.
 *
 * This is a bar rather than a modal because a bulk action is a *continuation* of selecting. A
 * modal covers the rows you just chose, which is precisely what you want to keep looking at while
 * deciding — and a merchant who cannot see the selection cannot sanity-check it before pressing a
 * button that changes three hundred prices.
 *
 * Selection is scoped to the filter, not the page. "Select all" on a page of 25 out of 3,417
 * matching products offers to extend to all 3,417, and the extension is resolved server-side from
 * the same filter that rendered the grid — so what the merchant saw is what changes, without
 * shipping 3,417 identifiers through a query string.
 */

import React, { useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  TextInput,
  Radio,
  Select,
  Stack,
  Text,
  TagsInput,
  Tooltip
} from '@mantine/core';
import {
  IconArchive,
  IconCategory,
  IconCurrencyDollar,
  IconEye,
  IconEyeOff,
  IconPackageExport,
  IconTag,
  IconTrash,
  IconX
} from '@tabler/icons-react';
import styles from './BulkBar.module.css';

/** A bulk request, as the API expects it. */
export interface BulkRequest {
  action: string;
  [key: string]: unknown;
}

export interface BulkBarProps {
  /** Ids ticked on the current page. */
  selectedIds: string[];
  /** True when the merchant escalated to "everything matching the filter". */
  allMatching: boolean;
  /** How many products the current filter matches in total. */
  totalMatching: number;
  /** Category choices for the "move to category" action. */
  categories: Array<{ value: string; label: string }>;
  /** Run a bulk action. Resolves once the grid has been refreshed. */
  onRun: (request: BulkRequest) => Promise<void>;
  /** Extend the selection to everything matching the filter. */
  onSelectAllMatching: () => void;
  /** Drop the selection. */
  onClear: () => void;
  /** Download the selection as CSV. */
  onExport: () => void;
}

/**
 * The action bar shown while products are selected.
 *
 * @param props - {@link BulkBarProps}
 * @returns The bar, or null when nothing is selected.
 */
export function BulkBar({
  selectedIds,
  allMatching,
  totalMatching,
  categories,
  onRun,
  onSelectAllMatching,
  onClear,
  onExport
}: BulkBarProps): React.ReactElement | null {
  const [openAction, setOpenAction] = useState<
    | null
    | 'price'
    | 'tags'
    | 'category'
    | 'reorder'
    | 'low_stock'
    | 'vendor'
    | 'sale_price'
    | 'clear_sale'
    | 'publish'
    | 'unpublish'
    | 'archive'
    | 'unarchive'
    | 'delete'
  >(null);

  /* Value for the single-field dialogs, so each does not need its own state. */
  const [numberValue, setNumberValue] = useState<number | string>('');
  const [textValue, setTextValue] = useState('');
  const [busy, setBusy] = useState(false);

  const [priceMode, setPriceMode] = useState<'percent' | 'absolute'>('percent');
  const [priceTarget, setPriceTarget] = useState<'base_price' | 'sale_price'>('base_price');
  const [priceAmount, setPriceAmount] = useState<number | string>(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tagMode, setTagMode] = useState<'add_tags' | 'remove_tags'>('add_tags');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [reorderPoint, setReorderPoint] = useState<number | string>(0);

  const count = allMatching ? totalMatching : selectedIds.length;
  if (count === 0) return null;

  const run = async (request: BulkRequest) => {
    setBusy(true);
    try {
      await onRun(request);
      setOpenAction(null);
    } finally {
      setBusy(false);
    }
  };

  const noun = `${count.toLocaleString()} product${count === 1 ? '' : 's'}`;

  /**
   * A confirmation for an action that changes what shoppers can see.
   *
   * @param action - The bulk action to run on confirm.
   * @param title - The dialog title.
   * @param body - What will happen, in the merchant's terms.
   * @param confirmLabel - The button text.
   * @param danger - Whether to colour the confirm button as destructive.
   * @returns The modal.
   */
  const confirmDialog = (
    action: string,
    title: string,
    body: string,
    confirmLabel: string,
    danger = false
  ) => (
    <Modal opened={openAction === action} onClose={() => setOpenAction(null)} title={title} centered>
      <Stack>
        <Text size="sm">{body}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setOpenAction(null)}>
            Cancel
          </Button>
          <Button
            color={danger ? 'red' : undefined}
            loading={busy}
            onClick={() => run({ action })}
          >
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );

  return (
    <>
      {/* `role="region"` with a live label so a screen-reader user is told the bar appeared and
          how many products it applies to, rather than discovering a new toolbar by tabbing. */}
      <div className={styles.bar} role="region" aria-label={`Bulk actions for ${noun}`}>
        <Group gap="sm" wrap="nowrap" className={styles.inner}>
          <Group gap={6} wrap="nowrap">
            <Text fw={600} size="sm">
              {noun} selected
            </Text>
            {!allMatching && totalMatching > selectedIds.length && (
              /* The escalation every bulk tool needs and few offer: the page's worth of rows is
                 almost never the set the merchant means when the filter matches thousands. */
              <Button variant="subtle" size="compact-xs" onClick={onSelectAllMatching}>
                Select all {totalMatching.toLocaleString()} matching
              </Button>
            )}
          </Group>

          <Group gap={4} wrap="nowrap" className={styles.actions}>
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconCurrencyDollar size={14} />}
              onClick={() => setOpenAction('price')}
            >
              Prices
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconTag size={14} />}
              onClick={() => setOpenAction('tags')}
            >
              Tags
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconCategory size={14} />}
              onClick={() => setOpenAction('category')}
            >
              Category
            </Button>
            {/*
              * Confirmed, like Delete.
              *
              * These fired immediately. Combined with "Select all N matching" and no undo anywhere
              * in the catalogue, one mis-click unlisted an entire storefront — and unpublishing is
              * as visible to a shopper as deleting, it just leaves the rows behind.
              */}
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconEye size={14} />}
              onClick={() => setOpenAction('publish')}
            >
              Publish
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              leftSection={<IconEyeOff size={14} />}
              onClick={() => setOpenAction('unpublish')}
            >
              Unpublish
            </Button>

            <Menu position="top-end" withinPortal>
              <Menu.Target>
                <Button size="compact-sm" variant="default">
                  More
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {/*
                  * The actions the API has always supported and this bar did not offer.
                  *
                  * Ten of the nineteen were unreachable, and two of them are the ones a merchant
                  * reaches for most: `set_sale_price` and `clear_sale_price` *are* the sale
                  * operation. Without them, running a promotion meant a percentage adjustment —
                  * which cannot express "everything in this collection is £19.99" — and ending one
                  * meant opening every product individually, because there was no way to clear a
                  * sale price in bulk at all.
                  */}
                <Menu.Item
                  leftSection={<IconCurrencyDollar size={14} />}
                  onClick={() => setOpenAction('sale_price')}
                >
                  Set sale price
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconCurrencyDollar size={14} />}
                  onClick={() => setOpenAction('clear_sale')}
                >
                  End the sale
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconPackageExport size={14} />}
                  onClick={() => setOpenAction('reorder')}
                >
                  Set reorder point
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconPackageExport size={14} />}
                  onClick={() => setOpenAction('low_stock')}
                >
                  Set low-stock threshold
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTag size={14} />}
                  onClick={() => setOpenAction('vendor')}
                >
                  Set vendor
                </Menu.Item>
                <Menu.Item leftSection={<IconPackageExport size={14} />} onClick={onExport}>
                  Export selected as CSV
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<IconArchive size={14} />}
                  onClick={() => setOpenAction('archive')}
                >
                  Archive
                </Menu.Item>
                {/* Archiving was a one-way door from the UI: the API has always had `unarchive`
                    and nothing called it. */}
                <Menu.Item
                  leftSection={<IconArchive size={14} />}
                  onClick={() => setOpenAction('unarchive')}
                >
                  Restore from archive
                </Menu.Item>
                <Menu.Divider />
                {/* Destructive actions are separated and last, never adjacent to a routine one. */}
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={() => setOpenAction('delete')}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>

          <Tooltip label="Clear selection">
            <ActionIcon variant="subtle" onClick={onClear} aria-label="Clear selection">
              <IconX size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </div>

      <Modal
        opened={openAction === 'price'}
        onClose={() => setOpenAction(null)}
        title={`Change prices for ${noun}`}
        centered
      >
        <Stack gap="md">
          <Radio.Group
            value={priceTarget}
            onChange={(value) => setPriceTarget(value as typeof priceTarget)}
            label="Which price"
          >
            <Group mt="xs">
              <Radio value="base_price" label="Regular price" />
              <Radio value="sale_price" label="Sale price" />
            </Group>
          </Radio.Group>

          <Radio.Group
            value={priceMode}
            onChange={(value) => setPriceMode(value as typeof priceMode)}
            label="How"
          >
            <Group mt="xs">
              <Radio value="percent" label="By percentage" />
              <Radio value="absolute" label="By amount" />
            </Group>
          </Radio.Group>

          <NumberInput
            label={priceMode === 'percent' ? 'Percentage change' : 'Amount to add'}
            description={
              priceMode === 'percent'
                ? 'Negative to discount — for example −15 for 15% off'
                : 'Negative to reduce'
            }
            value={priceAmount}
            onChange={setPriceAmount}
            decimalScale={2}
            step={priceMode === 'percent' ? 1 : 0.5}
          />

          {/* Stated up front rather than discovered in a results list. This is the guard that
              stops a bulk discount quietly selling stock below what it cost. */}
          <Text size="xs" c="dimmed">
            Products that would end up priced at or below their cost are skipped, and named in the
            result.
          </Text>

          {/* The same disclosure the inline grid edit already makes ("✓ Edited by you. ShipStation
              will not overwrite it"). Bulk repricing claims the field too, and said nothing — so
              the faster path to the same edit had the quieter consequence. */}
          <Text size="xs" c="dimmed">
            Changing a price claims it from ShipStation, so the sync will not overwrite it.
          </Text>

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenAction(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                run({
                  action: 'adjust_price',
                  mode: priceMode,
                  target: priceTarget,
                  value: Number(priceAmount),
                  floor_at_cost: true
                })
              }
            >
              Apply to {noun}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={openAction === 'tags'}
        onClose={() => setOpenAction(null)}
        title={`Tag ${noun}`}
        centered
      >
        <Stack gap="md">
          <Radio.Group value={tagMode} onChange={(v) => setTagMode(v as typeof tagMode)}>
            <Group>
              <Radio value="add_tags" label="Add tags" />
              <Radio value="remove_tags" label="Remove tags" />
            </Group>
          </Radio.Group>
          <TagsInput
            label="Tags"
            placeholder="Type a tag and press Enter"
            value={tags}
            onChange={setTags}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenAction(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={tags.length === 0}
              onClick={() => run({ action: tagMode, tags })}
            >
              {tagMode === 'add_tags' ? 'Add' : 'Remove'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={openAction === 'category'}
        onClose={() => setOpenAction(null)}
        title={`Move ${noun} to a category`}
        centered
      >
        <Stack gap="md">
          <Select
            label="Category"
            data={categories}
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Choose a category"
            searchable
            clearable
            nothingFoundMessage="No categories yet"
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenAction(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() => run({ action: 'set_category', category_id: categoryId })}
            >
              {categoryId ? 'Move' : 'Remove from category'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={openAction === 'reorder'}
        onClose={() => setOpenAction(null)}
        title={`Set reorder point for ${noun}`}
        centered
      >
        <Stack gap="md">
          <NumberInput
            label="Reorder point"
            description="Raise a purchase order when available stock reaches this level"
            value={reorderPoint}
            onChange={setReorderPoint}
            min={0}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenAction(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              onClick={() =>
                run({ action: 'set_reorder_point', reorder_point: Number(reorderPoint) })
              }
            >
              Apply
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={openAction === 'delete'}
        onClose={() => setOpenAction(null)}
        title={`Delete ${noun}?`}
        centered
      >
        <Stack gap="md">
          {/* What will actually happen, before it happens. The old flow was a bare
              `window.confirm` with no count of what was affected and no mention that products
              with order history behave differently. */}
          <Text size="sm">
            Products that appear on past orders are archived instead of deleted, so your order
            history stays intact. Everything else is removed permanently.
          </Text>
          <Text size="sm" c="dimmed">
            This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenAction(null)}>
              Cancel
            </Button>
            <Button color="red" loading={busy} onClick={() => run({ action: 'delete' })}>
              Delete {noun}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {confirmDialog(
        'publish',
        'Publish these products?',
        `${noun} will appear on your storefront. Anything without a price is skipped and named.`,
        'Publish'
      )}
      {confirmDialog(
        'unpublish',
        'Take these off the storefront?',
        `${noun} will stop being visible to shoppers. Nothing is deleted and you can publish them again.`,
        'Unpublish'
      )}
      {confirmDialog(
        'archive',
        'Archive these products?',
        `${noun} will be hidden from your catalogue and your storefront. Their order history is kept, and you can restore them.`,
        'Archive'
      )}
      {confirmDialog(
        'unarchive',
        'Restore these products?',
        `${noun} will come back into your catalogue as drafts. Publish them when you are ready.`,
        'Restore'
      )}

      <Modal
        opened={openAction === 'sale_price'}
        onClose={() => setOpenAction(null)}
        title="Set a sale price"
        centered
      >
        <Stack>
          <NumberInput
            label="Sale price"
            description="Applied to every selected product. Anything above its regular price, or below its cost, is skipped and named."
            min={0}
            decimalScale={2}
            prefix="$"
            value={numberValue}
            onChange={setNumberValue}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenAction(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={numberValue === ''}
              onClick={() => run({ action: 'set_sale_price', sale_price: Number(numberValue) })}
            >
              Set sale price
            </Button>
          </Group>
        </Stack>
      </Modal>

      {confirmDialog(
        'clear_sale',
        'End the sale?',
        `Sale prices are removed from ${noun}, so each goes back to its regular price.`,
        'End the sale'
      )}

      <Modal
        opened={openAction === 'low_stock'}
        onClose={() => setOpenAction(null)}
        title="Set the low-stock threshold"
        centered
      >
        <Stack>
          <NumberInput
            label="Warn below"
            description="The level at which these products start showing as low stock."
            min={0}
            allowDecimal={false}
            value={numberValue}
            onChange={setNumberValue}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenAction(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={numberValue === ''}
              onClick={() =>
                run({ action: 'set_low_stock_threshold', low_stock_threshold: Number(numberValue) })
              }
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={openAction === 'vendor'}
        onClose={() => setOpenAction(null)}
        title="Set the vendor"
        centered
      >
        <Stack>
          <TextInput
            label="Vendor"
            description="Who makes or supplies these products."
            value={textValue}
            onChange={(event) => setTextValue(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpenAction(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!textValue.trim()}
              onClick={() => run({ action: 'set_vendor', vendor: textValue.trim() })}
            >
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
