/**
 * The cart route's layout.
 *
 * Intentionally a pass-through. This used to render `TopNav`, which put
 * RebelShops branding above a merchant's cart; the cart page now renders the
 * themed `StorefrontShell` like every other storefront page, so the merchant's
 * own header and footer wrap it.
 *
 * @param props.children - The cart page
 * @returns The children, untouched
 */
export default function StoreCartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
