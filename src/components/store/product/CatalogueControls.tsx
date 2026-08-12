import Link from 'next/link';
import { IconChevronDown, IconSearch } from '@tabler/icons-react';

import { catalogueHref } from '@/app/store/_lib/present';
import { SORT_KEYS, SORT_LABELS, type CatalogueQuery, type CategoryRecord } from '@/app/store/_lib/types';

import { StoreButton, cx, storeUi } from '../ui';
import styles from './CatalogueControls.module.css';

export interface CatalogueControlsProps {
  basePath: string;
  query: CatalogueQuery;
  categories: CategoryRecord[];
  total: number;
}

/**
 * Search, category filter and sort for the listing page.
 *
 * Everything here is URL-driven, and deliberately so:
 *
 *  - **Search** is a plain GET form. It works with JavaScript disabled, the
 *    result is a shareable URL, and the browser's own back button undoes it.
 *  - **Categories** are links, not buttons — middle-click and "open in new tab"
 *    behave, and the current one is marked with `aria-current` as well as fill,
 *    so the active filter is not signalled by colour alone.
 *  - **Sort** is a `<select>` inside a GET form that carries the other filters
 *    as hidden fields, with a real submit button for anyone without JS. It does
 *    not auto-submit on change, because a select that navigates on keyboard
 *    arrow-through is a well-known accessibility trap.
 *
 * The one thing this does *not* do is hold state in React. A client-only
 * listing loses its filters on refresh and lies to the back button.
 *
 * @param props - {@link CatalogueControlsProps}
 * @returns The listing controls
 */
export function CatalogueControls({
  basePath,
  query,
  categories,
  total,
}: CatalogueControlsProps) {
  return (
    <div className={styles.controls}>
      <form action={basePath} method="get" role="search" className={styles.searchForm}>
        {/* Preserve the other filters when searching. */}
        {query.category ? <input type="hidden" name="category" value={query.category} /> : null}
        {query.sort !== 'featured' ? (
          <input type="hidden" name="sort" value={query.sort} />
        ) : null}

        <span className={styles.searchField}>
          <span className={styles.searchIcon}>
            <IconSearch size={17} aria-hidden="true" />
          </span>
          <label htmlFor="catalogue-search" className={storeUi.srOnly}>
            Search products
          </label>
          <input
            id="catalogue-search"
            className={cx(storeUi.input, styles.searchInput)}
            type="search"
            name="q"
            defaultValue={query.search}
            placeholder="Search products"
          />
        </span>
        <StoreButton type="submit" variant="secondary">
          Search
        </StoreButton>
      </form>

      <form action={basePath} method="get" className={styles.sortForm}>
        {query.search ? <input type="hidden" name="q" value={query.search} /> : null}
        {query.category ? <input type="hidden" name="category" value={query.category} /> : null}

        <label htmlFor="catalogue-sort" className={styles.sortLabel}>
          Sort by
        </label>
        <span className={storeUi.selectWrap}>
          <select
            id="catalogue-sort"
            name="sort"
            className={storeUi.select}
            defaultValue={query.sort}
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <span className={storeUi.selectChevron}>
            <IconChevronDown size={16} aria-hidden="true" />
          </span>
        </span>
        <StoreButton type="submit" variant="secondary" size="sm">
          Apply
        </StoreButton>
      </form>

      {categories.length > 0 ? (
        <nav className={styles.chips} aria-label="Filter by category">
          <Link
            href={catalogueHref(basePath, query, { category: '' })}
            className={cx(styles.chip, !query.category && styles.chipActive)}
            aria-current={!query.category ? 'page' : undefined}
          >
            All
            <span className={styles.chipCount}>{total}</span>
          </Link>
          {categories.map((category) => {
            const active = query.category === category.slug;
            return (
              <Link
                key={category.id}
                href={catalogueHref(basePath, query, { category: category.slug })}
                className={cx(styles.chip, active && styles.chipActive)}
                aria-current={active ? 'page' : undefined}
              >
                {category.name}
                <span className={styles.chipCount}>{category.productCount}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}

export interface PaginationProps {
  basePath: string;
  query: CatalogueQuery;
  page: number;
  totalPages: number;
}

/**
 * Work out which page numbers to show.
 *
 * Always the first and last page, plus a window around the current one, with
 * gaps collapsed. A catalogue with sixty pages must not render sixty links.
 *
 * @param page - The current page
 * @param totalPages - How many pages exist
 * @returns Page numbers, with `null` marking an elision
 */
function pageWindow(page: number, totalPages: number): Array<number | null> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);

  const out: Array<number | null> = [];
  let previous = 0;
  for (const current of sorted) {
    if (previous && current - previous > 1) out.push(null);
    out.push(current);
    previous = current;
  }
  return out;
}

/**
 * Page links for the listing.
 *
 * Real anchors with real hrefs, so a crawler can walk the catalogue and a
 * shopper can open page three in a new tab.
 *
 * @param props - {@link PaginationProps}
 * @returns The pager, or null when everything fits on one page
 */
export function Pagination({ basePath, query, page, totalPages }: PaginationProps) {
  if (totalPages <= 1) return null;

  const previousHref = catalogueHref(basePath, query, { page: page - 1 });
  const nextHref = catalogueHref(basePath, query, { page: page + 1 });

  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <Link
        href={page > 1 ? previousHref : '#'}
        className={cx(styles.page, page <= 1 && styles.pageDisabled)}
        aria-disabled={page <= 1 || undefined}
        rel="prev"
      >
        Previous
      </Link>

      {pageWindow(page, totalPages).map((entry, index) =>
        entry === null ? (
          <span key={`gap-${index}`} className={styles.gap} aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={entry}
            href={catalogueHref(basePath, query, { page: entry })}
            className={cx(styles.page, entry === page && styles.pageCurrent)}
            aria-current={entry === page ? 'page' : undefined}
            aria-label={`Page ${entry}`}
          >
            {entry}
          </Link>
        ),
      )}

      <Link
        href={page < totalPages ? nextHref : '#'}
        className={cx(styles.page, page >= totalPages && styles.pageDisabled)}
        aria-disabled={page >= totalPages || undefined}
        rel="next"
      >
        Next
      </Link>
    </nav>
  );
}
