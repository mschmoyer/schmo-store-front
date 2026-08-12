import { htmlToText } from '@/app/store/_lib/html';
import { stockState } from '@/app/store/_lib/present';
import type { ProductRecord, StoreRecord } from '@/app/store/_lib/types';

export interface ProductSchemaProps {
  product: ProductRecord;
  store: StoreRecord;
  /** Absolute origin, e.g. `https://shop.example`. Relative URLs are emitted when absent. */
  baseUrl?: string;
  /** Canonical path of the product page, used for the offer URL and breadcrumb. */
  path: string;
}

/**
 * `schema.org` markup for a product page.
 *
 * **Everything here is a fact we actually hold.** The previous implementation
 * routed through `generateCompleteProductStructuredData`, which appended an
 * `Organization` block containing a hardcoded name ("Premium Products Store"),
 * a fake support telephone number and invented social profiles — on every
 * merchant's storefront. It also emitted `AggregateRating` from a review
 * summary. This application has no review data for these products, and
 * fabricating rating signal to win rich snippets is both a lie to shoppers and
 * a straightforward Google structured-data penalty.
 *
 * So: no `aggregateRating`, no `review`, no invented organisation, no FAQ built
 * from fields that do not exist. Name, description, SKU, image, price,
 * currency, availability and the seller's real name — nothing else.
 *
 * @param props - {@link ProductSchemaProps}
 * @returns Two JSON-LD script elements: the product and its breadcrumb
 */
export function ProductSchema({ product, store, baseUrl = '', path }: ProductSchemaProps) {
  const absolute = (value: string): string =>
    baseUrl && value.startsWith('/') ? `${baseUrl}${value}` : value;

  const state = stockState(product);
  const availability =
    state === 'out-of-stock'
      ? 'https://schema.org/OutOfStock'
      : state === 'backorder'
        ? 'https://schema.org/BackOrder'
        : 'https://schema.org/InStock';

  const description =
    htmlToText(product.descriptionHtml, 400) ||
    product.shortDescription ||
    product.longDescription ||
    '';

  const images = [product.featuredImageUrl, ...product.galleryImages]
    .filter((url): url is string => Boolean(url))
    .slice(0, 6)
    .map(absolute);

  const productLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    ...(description ? { description } : {}),
    ...(images.length > 0 ? { image: images } : {}),
    ...(product.categoryName ? { category: product.categoryName } : {}),
    offers: {
      '@type': 'Offer',
      url: absolute(path),
      priceCurrency: store.currency,
      price: product.price.toFixed(2),
      availability,
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: store.storeName },
    },
  };

  // Shipping weight is a real, recorded measurement, so it can be stated.
  if (product.weight && product.weight > 0) {
    productLd.weight = {
      '@type': 'QuantitativeValue',
      value: product.weight,
      unitText: product.weightUnit,
    };
  }

  const storePath = `/store/${store.storeSlug}`;
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: store.storeName, item: absolute(storePath) },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Products',
        item: absolute(`${storePath}/products`),
      },
      ...(product.categoryName && product.categorySlug
        ? [
            {
              '@type': 'ListItem',
              position: 3,
              name: product.categoryName,
              item: absolute(
                `${storePath}/products?category=${encodeURIComponent(product.categorySlug)}`,
              ),
            },
          ]
        : []),
      {
        '@type': 'ListItem',
        position: product.categoryName ? 4 : 3,
        name: product.name,
        item: absolute(path),
      },
    ],
  };

  return (
    <>
      {[productLd, breadcrumbLd].map((data, index) => (
        <script
          key={index}
          type="application/ld+json"
          // `<` is escaped below so a string in the data cannot close the tag.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(data).replace(/</g, '\\u003c'),
          }}
        />
      ))}
    </>
  );
}
