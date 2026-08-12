/**
 * The checkout route's layout.
 *
 * Intentionally a pass-through, for the same reason `cart/layout.tsx` is: this
 * used to render `TopNav`, which put RebelShops branding — a different logo, a
 * different font, a "Shop / Journal" nav belonging to us rather than to the
 * merchant — directly above a shopper's payment form. The checkout page now
 * renders the themed `StorefrontShell` like every other storefront page, so the
 * merchant's own header and footer wrap it.
 *
 * @param props.children - The checkout page
 * @returns The children, untouched
 */
export default function StoreCheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
