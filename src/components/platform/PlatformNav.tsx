'use client';

import React from 'react';
import { NavLink, ScrollArea, Stack } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconBuildingStore,
  IconChartArrowsVertical,
  IconHeartRateMonitor,
  IconLayoutDashboard,
  IconTicket,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { usePathname } from 'next/navigation';
import styles from './PlatformChrome.module.css';

export interface PlatformNavProps {
  /** Called after a link is followed, so the mobile drawer can close itself. */
  onNavClick?: () => void;
}

interface PlatformNavItem {
  label: string;
  icon: typeof IconLayoutDashboard;
  href: string;
  /** One line of what lives there. The console has six destinations; each can afford a sentence. */
  description: string;
}

interface PlatformNavGroup {
  /** Stable slug, used to wire the group's label to the group it names. */
  id: string;
  heading: string;
  items: PlatformNavItem[];
}

/**
 * The console's information architecture.
 *
 * Five destinations, and **every one of them resolves to something that exists**. That constraint
 * did the design work here. Traffic, Fulfilment and Health are real operator concerns, but they are
 * panels on the overview today rather than routes of their own — so they are listed as what they
 * are, section links into `/platform`, instead of as top-level routes that would 404 or as greyed
 * "coming soon" rows. `AdminNav` learned the same lesson the expensive way: a nav slot advertising
 * an unbuilt screen is the worst trade in a sidebar.
 *
 * When Traffic earns a page of its own, its `href` changes here and nowhere else.
 */
const NAV_GROUPS: PlatformNavGroup[] = [
  {
    id: 'console',
    heading: 'Console',
    items: [
      {
        label: 'Overview',
        icon: IconLayoutDashboard,
        href: '/platform',
        description: 'Every tenant, one screen',
      },
      {
        label: 'Customers',
        icon: IconBuildingStore,
        href: '/platform/customers',
        description: 'Merchants and their stores',
      },
      /* Phase 3 of docs/plans/platform-coupons.md: the screen this links to now exists — both
         tabs, create, deactivate and copy-link — so this item is safe under the rule above. It
         does not belong under "Overview sections": those are anchors into panels on the overview
         that have no route of their own, and this is a routed screen with its own write surface. */
      {
        label: 'Coupons',
        icon: IconTicket,
        href: '/platform/coupons',
        description: 'Signup offers and redemptions',
      },
    ],
  },
  {
    id: 'sections',
    heading: 'Overview sections',
    items: [
      /* Same order as the overview itself. A rail that lists a page's sections in an order the
         page does not use is a map of a different building. */
      {
        label: 'Health',
        icon: IconHeartRateMonitor,
        href: '/platform#health',
        description: 'Sync state across the fleet',
      },
      {
        label: 'Traffic',
        icon: IconChartArrowsVertical,
        href: '/platform#traffic',
        description: 'Clicks and the buyer funnel',
      },
      {
        label: 'Fulfilment',
        icon: IconTruckDelivery,
        href: '/platform#fulfilment',
        description: 'Orders received and shipped',
      },
      /* The worklist is the last section on the overview, so this link is the thing that keeps it
         one click from anywhere rather than one scroll. */
      {
        label: 'Needs an operator',
        icon: IconAlertTriangle,
        href: '/platform#attention',
        description: 'Stuck orders and open alerts',
      },
    ],
  },
];

const ICON_PROPS = { size: 18, stroke: 1.6 } as const;

/**
 * The operator console's sidebar.
 *
 * It borrows `AdminNav`'s discipline wholesale — an active item is weight plus a `--surface-2`
 * fill, never a hue — and departs from it in exactly one way: the rail sits on the sunken surface
 * rather than on white. That is the console's "you are somewhere else" signal, and it is a token
 * the palette already contains. Inverting the chrome would have read as a different product and
 * would have broken §2's one-inverted-block rule; a shade of grey does the job.
 *
 * @param props - {@link PlatformNavProps}
 * @returns The navigation column rendered inside `AppShell.Navbar`.
 */
export function PlatformNav({ onNavClick }: PlatformNavProps): React.ReactElement {
  const pathname = usePathname();

  /* Section links share the overview's route, so only the route part decides the active item. */
  const isActive = (href: string) => {
    const [route] = href.split('#');
    if (route === '/platform') return pathname === '/platform' && !href.includes('#');
    return Boolean(pathname?.startsWith(route));
  };

  return (
    <div className={styles.nav}>
      <ScrollArea className={styles.navScroll} scrollbarSize={6}>
        <Stack gap={22} p="md">
          {NAV_GROUPS.map((group) => (
            /*
              A group label, not a heading.
              These two labels used to be `<h2>`s, and because the sidebar precedes the routed page
              in the DOM they arrived before the page's `<h1>` — so the console's heading outline
              opened with "CONSOLE" and "OVERVIEW SECTIONS" and only then reached the title of the
              screen. An outline that starts below the top level is worse than no outline: a screen
              reader user navigating by heading lands in the furniture. The label is now a `<p>`
              that names a `role="group"`, which is what these actually are — a set of related
              links — and the page keeps a single `<h1>` at its root.
            */
            <div key={group.heading} role="group" aria-labelledby={`platform-nav-${group.id}`}>
              <p className={styles.navHeading} id={`platform-nav-${group.id}`}>
                {group.heading}
              </p>
              <Stack gap={2} mt={8}>
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      description={item.description}
                      leftSection={<item.icon {...ICON_PROPS} />}
                      active={active}
                      onClick={onNavClick}
                      className={styles.navItem}
                      aria-current={active ? 'page' : undefined}
                    />
                  );
                })}
              </Stack>
            </div>
          ))}
        </Stack>
      </ScrollArea>

      <div className={styles.navFooter}>
        {/*
          The way back. An operator is a merchant too — they have their own store behind the same
          session — and without this the only exit from the console is the browser's back button.
        */}
        <NavLink
          href="/admin"
          label="Back to my store"
          leftSection={<IconArrowBackUp {...ICON_PROPS} />}
          className={styles.navItem}
          onClick={onNavClick}
        />
      </div>
    </div>
  );
}
