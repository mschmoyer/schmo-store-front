import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { StorefrontShell } from '@/components/store/StorefrontShell';
import { SectionList } from '@/components/store/sections';
import { SectionHeading, StoreBand, StoreContainer } from '@/components/store/ui';
import { getDraftPage, getPublishedPage } from '@/lib/storefront-theme/pages.db';

import { loadStorefront, type SearchParams } from '../../../_lib/load';

interface StorePageProps {
  params: Promise<{ storeSlug: string; pageSlug: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * Read the page this route is for, honouring preview.
 *
 * Behind a valid preview token the **draft** is served, so a merchant can see
 * an unpublished page before committing to it — the same contract the home page
 * has. Without one, only the published row exists as far as this route is
 * concerned, and an unpublished page is a 404 rather than a hidden page a
 * guessed URL could reach.
 *
 * @param storeId - The store being rendered
 * @param pageSlug - The requested page
 * @param isPreview - Whether this request is authorised to see drafts
 * @returns The page record, or null
 */
async function readPage(storeId: string, pageSlug: string, isPreview: boolean) {
  if (isPreview) {
    const draft = await getDraftPage(storeId, pageSlug);
    if (draft) return draft;
  }
  return getPublishedPage(storeId, pageSlug);
}

/**
 * SEO for a custom page.
 *
 * Falls back to the page title and the shop name, and honours the merchant's
 * `noindex` — which exists for thank-you and campaign landing pages that should
 * not compete with the shop in search results.
 *
 * @param props - Route params
 * @returns Page metadata
 */
export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const { storeSlug, pageSlug } = await params;
  const result = await loadStorefront(storeSlug);
  if (!result.ok) return {};

  const { store } = result.data;
  const page = await getPublishedPage(store.id, pageSlug);
  if (!page) return {};

  return {
    title: page.seo.metaTitle || `${page.title} — ${store.storeName}`,
    description: page.seo.metaDescription || undefined,
    ...(page.seo.noindex ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * A merchant-authored page.
 *
 * Renders the page's ordered `Section[]` through the **same registry** the home
 * page uses. That is the whole design: the section engine was already generic,
 * so custom pages needed a table and a route rather than any new rendering
 * primitive, and a section type added tomorrow works here for free.
 *
 * A page with no sections still renders its chrome and title rather than a
 * blank body — a merchant who has created a page and not yet composed it should
 * see an empty page, not a broken one.
 *
 * @param props - Route params and search params
 * @returns The themed page
 */
export default async function StoreCustomPage({ params, searchParams }: StorePageProps) {
  const { storeSlug, pageSlug } = await params;
  const search = await searchParams;

  const result = await loadStorefront(storeSlug, search);
  if (!result.ok) return result.fallback;

  const { store, theme, categories, isPreview } = result.data;

  const page = await readPage(store.id, pageSlug, isPreview);
  if (!page) notFound();

  const enabled = page.sections.filter((section) => section.enabled);

  return (
    <StorefrontShell {...result.data}>
      {enabled.length > 0 ? (
        <SectionList sections={page.sections} ctx={{ store, theme, categories, isPreview }} />
      ) : (
        <StoreBand>
          <StoreContainer width="narrow">
            <SectionHeading align="center" heading={page.title} />
          </StoreContainer>
        </StoreBand>
      )}
    </StorefrontShell>
  );
}
