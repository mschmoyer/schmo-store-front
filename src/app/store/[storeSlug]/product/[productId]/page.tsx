import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { IconRuler2, IconTruck, IconWeight } from '@tabler/icons-react';

import { ProductSchema } from '@/components/product/ProductSchema';
import { StorefrontShell } from '@/components/store/StorefrontShell';
import { BuyBox } from '@/components/store/product/BuyBox';
import { ProductGallery } from '@/components/store/product/ProductGallery';
import { ProductGrid } from '@/components/store/product/ProductGrid';
import {
  Notice,
  Pill,
  SectionHeading,
  StockIndicator,
  StoreBand,
  StoreContainer,
  StorePrice,
  cx,
} from '@/components/store/ui';

import { loadStorefront, type SearchParams } from '../../../_lib/load';
import { getProduct, getRelatedProducts, getStoreBySlug } from '../../../_lib/queries';
import { resolveRetiredSlug } from '@/lib/catalog/slug';
import { sanitizeRichText, toParagraphs } from '../../../_lib/html';
import {
  formatDimensions,
  formatWeight,
  isPurchasable,
  productHref,
  stockState,
} from '../../../_lib/present';
import styles from '@/components/store/product/ProductDetail.module.css';
import sectionStyles from '@/components/store/sections/Sections.module.css';

interface ProductPageProps {
  params: Promise<{ storeSlug: string; productId: string }>;
  searchParams: Promise<SearchParams>;
}

/**
 * Metadata built from the product's own copy.
 * @param props - Route params
 * @returns Product-specific metadata
 */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { storeSlug, productId } = await params;
  const lookup = await getStoreBySlug(storeSlug);
  if (!lookup.ok) return { title: 'Shop unavailable' };

  const product = await getProduct(lookup.store.id, productId);
  if (!product) return { title: 'Product not found' };

  const description =
    product.metaDescription || product.shortDescription || product.longDescription || '';

  return {
    title: product.metaTitle || product.name,
    description: description.slice(0, 300),
    openGraph: {
      title: product.name,
      description: description.slice(0, 300),
      type: 'website',
      ...(product.featuredImageUrl ? { images: [product.featuredImageUrl] } : {}),
    },
  };
}

/**
 * The product detail page.
 *
 * Built around what a shopper actually needs to decide: a gallery they can
 * operate with the keyboard, an honest price with a real compare-at, a concrete
 * stock state, a quantity control, and — because this platform is
 * shipping-centric — the recorded weight and boxed dimensions stated plainly
 * rather than hidden in a spec table nobody opens.
 *
 * Any merchant HTML in the description is sanitised before rendering; see
 * `_lib/html.ts`. Structured data is emitted from real fields only, with no
 * fabricated ratings or reviews.
 *
 * @param props - Route and search params
 * @returns The themed product page
 */
export default async function ProductPage({ params, searchParams }: ProductPageProps) {
  const [{ storeSlug, productId }, search] = await Promise.all([params, searchParams]);

  const result = await loadStorefront(storeSlug, search);
  if (!result.ok) return result.fallback;

  const { store, theme } = result.data;
  const product = await getProduct(store.id, productId);
  if (!product) {
    /*
     * Before giving up, check whether this URL used to belong to a product.
     *
     * `product_slug_history`, the unique index on it, the writes from the edit and import routes,
     * and `resolveRetiredSlug` itself all existed and nothing called any of it — so renaming a
     * product still 404'd every link, bookmark and search result pointing at the old URL, which is
     * the entire loss migration 025 built the table to prevent. A 301 is what tells a search engine
     * to move its ranking across rather than drop the page.
     */
    const currentSlug = await resolveRetiredSlug(store.id, productId);
    if (currentSlug) {
      permanentRedirect(`/store/${storeSlug}/product/${currentSlug}`);
    }
    notFound();
  }

  const related = await getRelatedProducts(product, 4);

  const state = stockState(product);
  const purchasable = isPurchasable(product);
  const weight = formatWeight(product);
  const dimensions = formatDimensions(product);
  const base = `/store/${store.storeSlug}`;
  const path = productHref(store.storeSlug, product);

  const images = [product.featuredImageUrl, ...product.galleryImages]
    .filter((url): url is string => Boolean(url))
    // The featured image is often repeated in the gallery column.
    .filter((url, index, all) => all.indexOf(url) === index);

  const descriptionHtml = sanitizeRichText(product.descriptionHtml);
  const paragraphs = descriptionHtml ? [] : toParagraphs(product.longDescription);

  const maxQuantity =
    product.trackInventory && !product.allowBackorder
      ? Math.max(product.stockQuantity, 1)
      : 99;

  return (
    <StorefrontShell {...result.data}>
      <ProductSchema product={product} store={store} path={path} />

      <StoreBand>
        <StoreContainer>
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link href={base} className={styles.crumbLink}>
              {store.storeName}
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <Link href={`${base}/products`} className={styles.crumbLink}>
              Products
            </Link>
            {product.categoryName && product.categorySlug ? (
              <>
                <span className={styles.crumbSep} aria-hidden="true">
                  /
                </span>
                <Link
                  href={`${base}/products?category=${encodeURIComponent(product.categorySlug)}`}
                  className={styles.crumbLink}
                >
                  {product.categoryName}
                </Link>
              </>
            ) : null}
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span className={styles.crumbCurrent} aria-current="page">
              {product.name}
            </span>
          </nav>

          <div className={styles.layout}>
            <ProductGallery images={images} name={product.name} sku={product.sku} />

            <div className={styles.buy}>
              <div className={styles.titleBlock}>
                {product.categoryName ? (
                  <span className={styles.category}>{product.categoryName}</span>
                ) : null}
                <h1>{product.name}</h1>
                <span className={styles.sku}>SKU {product.sku}</span>
              </div>

              <div className={styles.priceRow}>
                <StorePrice
                  value={product.price}
                  compareAt={product.compareAtPrice}
                  currency={store.currency}
                  size="lg"
                />
                <StockIndicator state={state} quantity={product.stockQuantity} />
              </div>

              {product.shortDescription ? (
                <p className={styles.summary}>{product.shortDescription}</p>
              ) : null}

              <BuyBox
                productId={product.id}
                productName={product.name}
                maxQuantity={maxQuantity}
                disabled={!purchasable}
                cartHref={`${base}/cart`}
              />

              {weight || dimensions || product.requiresShipping ? (
                <div className={styles.facts}>
                  {weight ? (
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>
                        <IconWeight size={15} aria-hidden="true" />
                        Shipping weight
                      </span>
                      <span className={styles.factValue}>{weight}</span>
                    </div>
                  ) : null}
                  {dimensions ? (
                    <div className={styles.fact}>
                      <span className={styles.factLabel}>
                        <IconRuler2 size={15} aria-hidden="true" />
                        Boxed size
                      </span>
                      <span className={styles.factValue}>{dimensions}</span>
                    </div>
                  ) : null}
                  <div className={styles.fact}>
                    <span className={styles.factLabel}>
                      <IconTruck size={15} aria-hidden="true" />
                      Delivery
                    </span>
                    <span className={styles.factValue}>
                      {product.requiresShipping ? 'Ships to you' : 'No shipping needed'}
                    </span>
                  </div>
                </div>
              ) : null}

              <Notice icon={<IconTruck size={16} />}>
                Shipping is calculated at checkout from your delivery address — we do not estimate
                it here, because a guess would be wrong as often as it was right.
              </Notice>

              {product.tags.length > 0 ? (
                <div className={styles.tags}>
                  {product.tags.slice(0, 8).map((tag) => (
                    <Pill key={tag}>{tag}</Pill>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {descriptionHtml || paragraphs.length > 0 ? (
            <div className={styles.description}>
              <SectionHeading heading="Details" level={2} />
              <div className={sectionStyles.prose}>
                {descriptionHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: descriptionHtml }} />
                ) : (
                  paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)
                )}
              </div>
            </div>
          ) : null}
        </StoreContainer>
      </StoreBand>

      {related.length > 0 ? (
        <StoreBand tone="sunken">
          <StoreContainer>
            <SectionHeading heading="You might also like" level={2} />
            <ProductGrid
              products={related}
              storeSlug={store.storeSlug}
              currency={store.currency}
              card={theme.productCard}
              columns={4}
              priorityCount={0}
              className={cx()}
            />
          </StoreContainer>
        </StoreBand>
      ) : null}
    </StorefrontShell>
  );
}
