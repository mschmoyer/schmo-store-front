import type { CategoryRecord, StoreRecord } from '@/app/store/_lib/types';
import type { ResolvedTheme, Section } from '@/lib/storefront-theme';

/**
 * Everything a section needs that is not in its own `settings`.
 *
 * Passed down from the page rather than re-fetched per section, so a home page
 * with three product bands does not run three copies of the same category
 * query.
 */
export interface SectionContext {
  store: StoreRecord;
  theme: ResolvedTheme;
  /** The store's non-empty categories, already loaded once for the whole page. */
  categories: CategoryRecord[];
  /** True when rendering inside the customizer's preview iframe. */
  isPreview: boolean;
}

/** The single prop shape every section component takes. */
export interface SectionProps {
  section: Section;
  ctx: SectionContext;
}

/** A section component. May be async — most of them query the catalogue. */
export type SectionComponent = (
  props: SectionProps,
) => React.ReactNode | Promise<React.ReactNode>;
