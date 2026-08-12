'use client';

/**
 * The two controls backed by the merchant's real catalogue.
 *
 * `collection` picks one of the store's collections; `product-list` builds an
 * ordered hand-picked set. Both read from {@link useCatalog}, which is filled
 * once from `/api/admin/storefront-theme/catalog`, so neither invents data and
 * neither refetches per keystroke.
 */

import * as React from 'react';
import { IconArrowDown, IconArrowUp, IconSearch, IconX } from '@tabler/icons-react';

import { Input, Select } from '@/components/ui';

import { useCatalog } from '../CatalogContext';
import { moveItem } from '../state/reducer';
import { asText } from './BasicControls';
import type { SettingControlProps } from './types';
import styles from './controls.module.css';

/**
 * Choose one of the store's collections.
 * @param props - {@link SettingControlProps}
 * @returns A labelled collection picker
 */
export function CollectionControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const { collections, loading, error } = useCatalog();

  const options = collections.map((collection) => ({
    value: collection.slug,
    label:
      collection.productCount > 0
        ? `${collection.name} (${collection.productCount})`
        : collection.name,
  }));

  return (
    <div className={styles.field}>
      <Select
        id={controlId}
        label={field.label}
        hint={
          error
            ? 'Could not load your collections.'
            : loading
              ? 'Loading your collections…'
              : collections.length === 0
                ? 'You have no collections yet. Leave this blank to show featured products.'
                : field.help
        }
        value={asText(value)}
        disabled={disabled || loading}
        size="sm"
        placeholder="Featured products"
        options={options}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      {notice}
    </div>
  );
}

/**
 * Read a product-list value as an array of ids.
 * @param value - The raw setting value
 * @returns The selected product ids
 */
function asIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Build an ordered, hand-picked product set.
 * @param props - {@link SettingControlProps}
 * @returns A labelled product picker
 */
export function ProductListControl({
  field,
  value,
  onChange,
  controlId,
  notice,
  disabled,
}: SettingControlProps): React.ReactElement {
  const { products, loading, error } = useCatalog();
  const [query, setQuery] = React.useState('');
  const selected = asIds(value);

  const byId = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const matches = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = needle
      ? products.filter(
          (product) =>
            product.name.toLowerCase().includes(needle) ||
            product.sku.toLowerCase().includes(needle),
        )
      : products;
    return pool.slice(0, 40);
  }, [products, query]);

  return (
    <div className={styles.field}>
      <span className={styles.label} id={`${controlId}-label`}>
        {field.label}
      </span>
      {field.help ? <span className={styles.help}>{field.help}</span> : null}

      {selected.length > 0 ? (
        <ul className={styles.listItems} aria-label={`${field.label} selection`}>
          {selected.map((id, index) => {
            const product = byId.get(id);
            return (
              <li key={id} className={styles.chip} style={{ height: 32 }}>
                <span className={styles.chipLabel}>{product?.name ?? id}</span>
                <span className={styles.listItemTools}>
                  <button
                    type="button"
                    className={styles.tinyButton}
                    aria-label={`Move ${product?.name ?? id} up`}
                    disabled={disabled || index === 0}
                    onClick={() => onChange(moveItem(selected, index, index - 1))}
                  >
                    <IconArrowUp size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.tinyButton}
                    aria-label={`Move ${product?.name ?? id} down`}
                    disabled={disabled || index === selected.length - 1}
                    onClick={() => onChange(moveItem(selected, index, index + 1))}
                  >
                    <IconArrowDown size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${styles.tinyButton} ${styles.tinyButtonDanger}`}
                    aria-label={`Remove ${product?.name ?? id}`}
                    disabled={disabled}
                    onClick={() => onChange(selected.filter((item) => item !== id))}
                  >
                    <IconX size={13} aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Input
        id={controlId}
        size="sm"
        value={query}
        disabled={disabled || loading}
        aria-label={`Search products for ${field.label}`}
        placeholder={loading ? 'Loading products…' : 'Search by name or SKU'}
        leftSection={<IconSearch size={14} aria-hidden="true" />}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />

      {error ? <span className={styles.help}>Could not load your products.</span> : null}

      {query.trim() !== '' ? (
        <div className={styles.results}>
          {matches.length === 0 ? (
            <span className={styles.help} style={{ padding: 8 }}>
              Nothing matches “{query}”.
            </span>
          ) : (
            matches.map((product) => {
              const already = selected.includes(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  className={styles.resultRow}
                  disabled={disabled || already}
                  onClick={() => onChange([...selected, product.id])}
                >
                  <span className={styles.chipLabel}>{product.name}</span>
                  <span className={styles.resultMeta}>{already ? 'added' : product.sku}</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
      {notice}
    </div>
  );
}
