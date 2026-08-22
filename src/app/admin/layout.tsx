import type { Metadata } from 'next';

import { AdminAppShell } from './AdminAppShell';

/**
 * The merchant admin's title, inherited by every page under `/admin` that does not set its own.
 *
 * A tab that reads "RebelShops — Your ShipStation catalog, now a storefront" — the marketing
 * title, inherited from the root layout — tells a merchant nothing about which of their open tabs
 * is their shop's back office. The two operational surfaces name themselves: this one and the
 * operator console at `/platform`.
 *
 * A page with a title of its own still wins; `/admin/design` keeps "Design your storefront".
 */
export const metadata: Metadata = {
  title: 'RebelShops - Admin',
};

/**
 * The `/admin` layout.
 *
 * A server component so it can carry the title above. Everything with state in it — the auth
 * context, the app shell, the breadcrumbs — lives in {@link AdminAppShell}.
 *
 * @param props.children - The routed admin page.
 * @returns The admin shell.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminAppShell>{children}</AdminAppShell>;
}
