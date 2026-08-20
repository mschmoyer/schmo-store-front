'use client';

import * as React from 'react';

import {
  availableValues,
  type ProductOption,
  type ResolvedVariant,
} from '@/lib/catalog/variants';

import styles from './VariantSelector.module.css';

export interface VariantSelectorProps {
  /** The product's option axes, in merchandising order. */
  options: ProductOption[];
  /** Every sellable variant, already resolved against the product. */
  variants: ResolvedVariant[];
  /** The shopper's current selection, one entry per axis. */
  selection: (string | null)[];
  /** Called with the next selection when a value is picked. */
  onChange: (selection: (string | null)[]) => void;
}

/**
 * Whether an axis should render as colour swatches rather than text pills.
 *
 * Driven by the data, not by the axis name: an axis renders as swatches when
 * the merchant has actually given its values colours. Sniffing for a name like
 * "Colour" would guess wrong for "Finish", "Stain" or "Colourway", and would
 * guess wrong in every language but English.
 *
 * @param option - The axis
 * @returns True when every value carries a swatch colour
 */
function isSwatchAxis(option: ProductOption): boolean {
  if (option.values.length === 0) return false;
  return option.values.every((value) => Boolean(option.valueMeta[value]?.swatch));
}

/**
 * The option selector on a product page.
 *
 * Renders one group per axis. A value that no variant provides in combination
 * with the other choices is **disabled**; a value that exists but is sold out
 * stays selectable and is marked. That distinction matters: a shopper is
 * entitled to learn that their size exists and is gone, rather than watching it
 * disappear from the page and concluding the shop never carried it.
 *
 * Availability is computed against the *other* axes only, so choosing a colour
 * never disables the colours — the behaviour that makes a selector feel broken.
 *
 * Each group is a `radiogroup` with roving state, so a screen reader announces
 * "Size, Medium, 2 of 4" and arrow keys move within a group, matching how
 * native radios behave. Sold-out and unavailable states are carried in the
 * accessible name rather than in colour alone.
 *
 * @param props - {@link VariantSelectorProps}
 * @returns The option selector, or null when the product has no options
 */
export function VariantSelector({
  options,
  variants,
  selection,
  onChange,
}: VariantSelectorProps) {
  if (options.length === 0) return null;

  /**
   * Pick a value on one axis.
   * @param axisIndex - Which axis changed
   * @param value - The chosen value
   */
  const choose = (axisIndex: number, value: string): void => {
    const next = [...selection];
    next[axisIndex] = value;
    onChange(next);
  };

  return (
    <div className={styles.groups}>
      {options.map((option, axisIndex) => {
        const swatches = isSwatchAxis(option);
        const entries = availableValues(variants, axisIndex, selection, option.values);
        const chosen = selection[axisIndex] ?? null;

        return (
          <fieldset key={option.id} className={styles.group}>
            <legend className={styles.legend}>
              <span className={styles.legendName}>{option.name}</span>
              {chosen ? <span className={styles.legendValue}>{chosen}</span> : null}
            </legend>

            <div
              className={swatches ? styles.swatchRow : styles.pillRow}
              role="radiogroup"
              aria-label={option.name}
            >
              {entries.map((entry) => {
                const selected = chosen === entry.value;
                const meta = option.valueMeta[entry.value];

                // The accessible name carries the state, because a greyed pill
                // and a struck-through pill are the same thing to a screen
                // reader otherwise.
                const stateLabel = !entry.exists
                  ? `${entry.value}, unavailable with your other choices`
                  : entry.inStock
                    ? entry.value
                    : `${entry.value}, sold out`;

                return (
                  <button
                    key={entry.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={stateLabel}
                    // A combination that does not exist cannot be chosen. One
                    // that is merely sold out can, so the shopper can see the
                    // "sold out" state on the variant they wanted.
                    disabled={!entry.exists}
                    data-selected={selected || undefined}
                    data-soldout={entry.exists && !entry.inStock ? '' : undefined}
                    className={swatches ? styles.swatch : styles.pill}
                    onClick={() => choose(axisIndex, entry.value)}
                    title={swatches ? entry.value : undefined}
                  >
                    {swatches ? (
                      <>
                        <span
                          className={styles.swatchInk}
                          // A merchant-chosen colour is data, not design, and
                          // there is no class that can carry an arbitrary hex.
                          style={{ backgroundColor: meta?.swatch }}
                          aria-hidden="true"
                        />
                        <span className={styles.srOnly}>{entry.value}</span>
                      </>
                    ) : (
                      entry.value
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
