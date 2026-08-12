'use client';

/**
 * The merchant's real catalogue, made available to the schema-generated
 * controls.
 *
 * `collection` and `product-list` fields must offer the merchant's actual
 * collections and products — a customizer that asks someone to type a product
 * UUID is a settings form. The data is fetched once by the customizer shell
 * from `/api/admin/storefront-theme/catalog` and shared through this context so
 * that adding a tenth product picker costs nothing.
 */

import * as React from 'react';

export interface CatalogCollection {
  id: string;
  name: string;
  slug: string;
  productCount: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  price: number | null;
  imageUrl: string | null;
}

export interface Catalog {
  collections: CatalogCollection[];
  products: CatalogProduct[];
  loading: boolean;
  error: string | null;
}

const EMPTY: Catalog = { collections: [], products: [], loading: false, error: null };

const CatalogContext = React.createContext<Catalog>(EMPTY);

export interface CatalogProviderProps {
  value: Catalog;
  children: React.ReactNode;
}

/**
 * Provide the catalogue to every control below.
 * @param props - {@link CatalogProviderProps}
 * @returns A context provider
 */
export function CatalogProvider({ value, children }: CatalogProviderProps): React.ReactElement {
  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

/**
 * Read the merchant's catalogue.
 * @returns Collections and products, plus load state
 */
export function useCatalog(): Catalog {
  return React.useContext(CatalogContext);
}
