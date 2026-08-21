'use client';

import React from 'react';
import { NavLink, ScrollArea, Stack, Text } from '@mantine/core';
import {
  IconArticle,
  IconBrain,
  IconCategory,
  IconChartLine,
  IconCreditCard,
  IconDashboard,
  IconExternalLink,
  IconLogout,
  IconPackage,
  IconPalette,
  IconPlug,
  IconSettings,
  IconShieldLock,
  IconShoppingCart,
  IconTicket,
  IconTruckDelivery,
  IconUser,
} from '@tabler/icons-react';
import { usePathname } from 'next/navigation';
import { useAdmin } from '@/contexts/AdminContext';
import styles from './AdminChrome.module.css';

interface AdminNavProps {
  onNavClick?: () => void;
}

interface NavItem {
  label: string;
  icon: typeof IconDashboard;
  href: string;
  enabled: boolean;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
}

/**
 * The sidebar's information architecture.
 *
 * Grouping replaces what colour used to do. The old nav gave every item its own
 * hue — Dashboard blue, Products orange, Inventory teal, Coupons purple, AI
 * violet, Blog indigo — which is decoration standing in for structure: eleven
 * hues told you nothing about which screens belong together. Four headings do.
 *
 * Fourteen declared items (eleven enabled) was too many for a merchant with one
 * employee and ten minutes. The list is now eight, and the changes are all
 * about matching the nav to the jobs rather than to the database:
 *
 * - **Orders is added, second.** It is the most-visited screen in any store
 *   admin and it had no route at all — 27 orders and 51 tracking numbers with
 *   no door into them.
 * - **Purchase Orders is removed** as a top-level item, reached from Inventory's
 *   overflow menu instead. The reasoning here used to say it was "already a tab
 *   inside Inventory" — it was not, and had not been since Inventory was
 *   rewritten; its tabs are stock views. One door, and this comment now
 *   describes where it is.
 * - **Coupons is removed** as a top-level item and reached from Products. A
 *   merchant edits promotions monthly, not daily, and a coupon is part of
 *   pricing the catalog.
 * - **AI Assistant is removed.** Four of its seven cards read "Coming Soon";
 *   a top-level slot advertising unbuilt features to a paying customer is the
 *   worst trade in the nav. The three working generators stay reachable at
 *   `/admin/ai` for anyone who has the link.
 *
 * The routes still exist and still work — this is an information-architecture
 * change, not a deletion.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { label: 'Dashboard', icon: IconDashboard, href: '/admin', enabled: true },
      { label: 'Orders', icon: IconTruckDelivery, href: '/admin/orders', enabled: true },
      { label: 'Analytics', icon: IconChartLine, href: '/admin/analytics', enabled: true },
    ],
  },
  {
    heading: 'Catalog',
    items: [
      { label: 'Products', icon: IconShoppingCart, href: '/admin/products', enabled: true },
      { label: 'Inventory', icon: IconPackage, href: '/admin/inventory', enabled: true },
      { label: 'Categories', icon: IconCategory, href: '/admin/categories', enabled: false },
      /* Reached from Products → Pricing & promotions. */
      { label: 'Coupons & Discounts', icon: IconTicket, href: '/admin/coupons', enabled: false },
      /* Reached from Inventory → More → Purchase orders. */
      {
        label: 'Purchase Orders',
        icon: IconTruckDelivery,
        href: '/admin/purchase-orders',
        enabled: false,
      },
    ],
  },
  {
    heading: 'Selling',
    items: [
      { label: 'Page Design', icon: IconPalette, href: '/admin/design', enabled: true },
      { label: 'Blog', icon: IconArticle, href: '/admin/blog', enabled: true },
      /* Three working generators behind four "Coming Soon" cards. Not a destination. */
      { label: 'AI Assistant', icon: IconBrain, href: '/admin/ai', enabled: false },
    ],
  },
  {
    heading: 'Account',
    items: [
      { label: 'Integrations', icon: IconPlug, href: '/admin/integrations', enabled: true },
      { label: 'Billing', icon: IconCreditCard, href: '/admin/billing', enabled: true },
      { label: 'Profile', icon: IconUser, href: '/admin/account', enabled: false },
      { label: 'Settings', icon: IconSettings, href: '/admin/settings', enabled: false },
    ],
  },
];

const ICON_PROPS = { size: 18, stroke: 1.6 } as const;

/**
 * The admin sidebar.
 *
 * §2's discipline, applied: **an active item is weight, a `--surface-2` fill
 * and an ink left rule — never a colour.** The previous nav carried three
 * off-palette accents in the same 600px column: purple for "View Store", blue
 * for the active Dashboard state and red for "Logout". The red was the worst of
 * the three, because destructive red is a promise that something will be
 * destroyed and signing out destroys nothing — it is ordinary navigation, so it
 * is now styled as ordinary navigation.
 *
 * @param props - {@link AdminNavProps}
 * @returns The navigation column rendered inside `AppShell.Navbar`.
 */
export function AdminNav({ onNavClick }: AdminNavProps) {
  const pathname = usePathname();
  const { user, logout } = useAdmin();

  const handleViewStore = () => {
    if (user?.store?.slug) {
      window.open(`/store/${user.store.slug}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleLogout = async () => {
    await logout();
    onNavClick?.();
  };

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : Boolean(pathname?.startsWith(href));

  return (
    <div className={styles.nav}>
      <ScrollArea className={styles.navScroll} scrollbarSize={6}>
        <Stack gap={22} p="md">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => item.enabled);
            if (items.length === 0) return null;

            return (
              <div key={group.heading}>
                <Text component="h2" className={styles.navHeading}>
                  {group.heading}
                </Text>
                <Stack gap={2} mt={8}>
                  {items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <NavLink
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        leftSection={<item.icon {...ICON_PROPS} />}
                        active={active}
                        onClick={onNavClick}
                        className={styles.navItem}
                        data-active-item={active ? 'true' : undefined}
                      />
                    );
                  })}
                </Stack>
              </div>
            );
          })}
        </Stack>
      </ScrollArea>

      <div className={styles.navFooter}>
        {/*
         * The platform operator's door, and the only footer entry that is a destination rather
         * than an action — so it leads. It is deliberately an ordinary `navItem`: no accent, no
         * badge. A second colour here would say "this is a different product", and it is not; it
         * is one more place this person can go.
         *
         * Hiding it is NOT access control. `/platform` and every `/api/platform/*` route call
         * `requirePlatformAdmin`, which re-reads `users.is_admin` from the database on each
         * request — a merchant who types the URL, or who forges `isAdmin: true` in their own
         * browser memory, gets a 403 and no data. This flag only decides whether we bother
         * drawing the link for someone who would be let through.
         */}
        {user?.isAdmin && (
          <NavLink
            href="/platform"
            label="Admin"
            leftSection={<IconShieldLock {...ICON_PROPS} />}
            onClick={onNavClick}
            className={styles.navItem}
          />
        )}

        {user?.store?.slug && (
          <NavLink
            component="button"
            type="button"
            label="View store"
            description="Opens in a new tab"
            leftSection={<IconExternalLink {...ICON_PROPS} />}
            onClick={handleViewStore}
            className={styles.navItem}
          />
        )}

        <NavLink
          component="button"
          type="button"
          label="Sign out"
          leftSection={<IconLogout {...ICON_PROPS} />}
          onClick={handleLogout}
          className={styles.navItem}
        />
      </div>
    </div>
  );
}
