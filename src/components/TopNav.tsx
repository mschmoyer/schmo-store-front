'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge, Box, Container, Group, Text } from '@mantine/core';
import { IconShoppingBag, IconUser } from '@tabler/icons-react';

/**
 * Pull the store slug out of the current path.
 *
 * Handles the three shapes that carry one: `/store/{slug}/…`, `/blog/{slug}/…`
 * and a bare `/{slug}`. Admin and marketing routes have no store context.
 *
 * @param pathname - The current path
 * @returns The slug, or null when this page does not belong to a shop
 */
function storeSlugFromPath(pathname: string | null): string | null {
  const segments = pathname?.split('/').filter(Boolean) ?? [];
  if (segments.length === 0) return null;
  if (segments.length === 1) return segments[0];
  if (segments[0] === 'store' || segments[0] === 'blog') return segments[1] ?? null;
  return null;
}

/**
 * Read the cart count out of shared storage.
 * @returns The total number of items
 */
function readCartCount(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem('cart');
    if (!raw) return 0;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return 0;
    return parsed.reduce<number>((sum, item) => {
      const quantity = Number((item as { quantity?: unknown })?.quantity);
      return sum + (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
    }, 0);
  } catch {
    return 0;
  }
}

/**
 * The shared top navigation for pages outside the themed storefront shell.
 *
 * **It shows the merchant's name, not ours.** This component used to render a
 * hardcoded "RebelShops" wordmark and our logo on top of every merchant's blog
 * and checkout — a shopper buying a kettlebell has no idea what RebelShops is,
 * and putting our brand above someone else's checkout is both confusing and
 * bad for the merchant. When the path identifies a shop, the shop's own name is
 * fetched and shown; the platform name appears nowhere.
 *
 * The store pages themselves no longer use this at all — they render the fully
 * themed `StoreHeader` inside `StorefrontShell`. This remains for the blog and
 * checkout routes, which are owned by other tracks.
 *
 * @returns The top navigation bar
 */
export default function TopNav() {
  const pathname = usePathname();
  const storeSlug = storeSlugFromPath(pathname);

  const [cartCount, setCartCount] = useState(0);
  const [storeName, setStoreName] = useState<string | null>(null);

  useEffect(() => {
    const sync = (): void => setCartCount(readCartCount());
    sync();

    // `storage` covers other tabs; the custom event covers this one.
    window.addEventListener('storage', sync);
    window.addEventListener('cartUpdated', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('cartUpdated', sync);
    };
  }, []);

  useEffect(() => {
    if (!storeSlug) {
      setStoreName(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/stores/public?slug=${encodeURIComponent(storeSlug)}`,
        );
        if (!response.ok) return;
        const payload = await response.json();
        const name = payload?.data?.store_name;
        if (!cancelled && typeof name === 'string') setStoreName(name);
      } catch {
        // Falling back to the slug is fine; showing our brand instead is not.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  const homeHref = storeSlug ? `/store/${storeSlug}` : '/store';
  // Until the name arrives, the slug is a far better placeholder than our name.
  const displayName = storeName ?? (storeSlug ? storeSlug.replace(/-/g, ' ') : 'Shops');

  return (
    <Box
      style={{
        borderBottom: '1px solid var(--theme-border)',
        background: 'var(--theme-background)',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}
    >
      <Container size="xl" py="sm">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Link href={homeHref} style={{ textDecoration: 'none', minWidth: 0 }}>
            <Text
              size="lg"
              fw={700}
              style={{
                color: 'var(--theme-text)',
                textTransform: 'capitalize',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {displayName}
            </Text>
          </Link>

          <Group gap="lg" visibleFrom="sm" wrap="nowrap">
            <Link href={homeHref} style={{ textDecoration: 'none' }}>
              <Text size="sm" style={{ color: 'var(--theme-text)' }}>
                Shop
              </Text>
            </Link>
            {storeSlug ? (
              <Link href={`/blog/${storeSlug}`} style={{ textDecoration: 'none' }}>
                <Text size="sm" style={{ color: 'var(--theme-text)' }}>
                  Journal
                </Text>
              </Link>
            ) : null}
          </Group>

          <Group gap="xs" wrap="nowrap">
            <Link
              href={storeSlug ? `/store/${storeSlug}/account` : '/account'}
              aria-label="Account"
              style={{ display: 'inline-flex', padding: 8, color: 'var(--theme-text)' }}
            >
              <IconUser size={22} aria-hidden="true" />
            </Link>

            <Link
              href={storeSlug ? `/store/${storeSlug}/cart` : '/cart'}
              aria-label={
                cartCount > 0
                  ? `Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`
                  : 'Cart, empty'
              }
              style={{
                position: 'relative',
                display: 'inline-flex',
                padding: 8,
                color: 'var(--theme-text)',
              }}
            >
              <IconShoppingBag size={22} aria-hidden="true" />
              {cartCount > 0 ? (
                <Badge
                  size="xs"
                  variant="filled"
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    minWidth: 18,
                    height: 18,
                    padding: 0,
                    borderRadius: 999,
                    backgroundColor: 'var(--theme-primary)',
                    color: 'var(--theme-text-on-primary)',
                  }}
                >
                  {cartCount > 99 ? '99+' : cartCount}
                </Badge>
              ) : null}
            </Link>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}
