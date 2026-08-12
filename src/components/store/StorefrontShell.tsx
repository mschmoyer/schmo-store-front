import { storefrontFontVariables } from '@/lib/storefront-theme/fonts.next';
import type { StorefrontData } from '@/app/store/_lib/load';

import { AnnouncementBar } from './chrome/AnnouncementBar';
import { StoreFooter } from './chrome/StoreFooter';
import { StoreHeader } from './chrome/StoreHeader';
import { CartProvider } from './cart/CartProvider';
import { PreviewBridge } from './theme/PreviewBridge';
import { StorefrontStyle } from './theme/StorefrontStyle';
import { themeDataAttributes } from './theme/vars';
import styles from './StorefrontShell.module.css';

export interface StorefrontShellProps extends StorefrontData {
  children: React.ReactNode;
  /**
   * Set by the home page when it has already rendered a newsletter section.
   *
   * Only the home page renders sections, so this cannot be inferred from
   * `sections` here — doing that would wrongly strip the footer's signup from
   * the cart and product pages, which have no newsletter of their own.
   */
  suppressFooterNewsletter?: boolean;
}

/**
 * The themed storefront shell: tokens, chrome, cart state.
 *
 * This is where the no-flash guarantee lives. Everything it needs was resolved
 * on the server by `loadStorefront`, and `StorefrontStyle` emits the merchant's
 * resolved custom properties inline **before** any child renders — so the
 * browser parses the palette in the same pass as the markup it applies to.
 * There is no `useEffect`, no `setTimeout`, no `!important`, and no frame in
 * which a shopper sees RebelShops' colours on someone else's shop.
 *
 * The wrapper carries the literal `storefront` class plus `data-store-id`,
 * which is exactly the selector the engine's `storefrontScope()` emits. Scoping
 * to this element rather than `:root` is what keeps a storefront rendered
 * inside the customizer's preview iframe from bleeding into admin chrome
 * (spec section 4).
 *
 * The wrapper also carries the full curated font-variable class list, so
 * switching fonts in the customizer is a repaint rather than a font download.
 *
 * @param props - {@link StorefrontShellProps}
 * @returns The complete themed page shell
 */
export function StorefrontShell({
  store,
  theme,
  categories,
  isPreview,
  suppressFooterNewsletter = false,
  children,
}: StorefrontShellProps) {
  return (
    <>
      <StorefrontStyle storeId={store.id} theme={theme} />
      <div
        className={`storefront ${styles.root} ${storefrontFontVariables}`}
        data-store-id={store.id}
        {...themeDataAttributes(theme)}
      >
        <CartProvider storeId={store.id}>
          <a href="#store-main" className={styles.skipLink}>
            Skip to content
          </a>

          <AnnouncementBar announcement={theme.header.announcement} storeSlug={store.storeSlug} />
          <StoreHeader store={store} theme={theme} categories={categories} />

          <main id="store-main" className={styles.main}>
            {children}
          </main>

          <StoreFooter
            store={store}
            theme={theme}
            categories={categories}
            suppressNewsletter={suppressFooterNewsletter}
          />
        </CartProvider>

        {isPreview ? <PreviewBridge storeId={store.id} /> : null}
      </div>
    </>
  );
}
