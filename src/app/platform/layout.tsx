import type { Metadata } from 'next';

import { PlatformConsoleShell } from './PlatformConsoleShell';

/**
 * The operator console's title, inherited by every page under `/platform`.
 *
 * The console reads every merchant's data and is usually open beside a merchant's own admin. Two
 * tabs carrying the marketing title is how an operator ends up acting on the wrong screen, so each
 * operational surface names itself.
 */
export const metadata: Metadata = {
  title: 'RebelShops - Operator Dashboard',
};

/**
 * The `/platform` layout.
 *
 * A server component so it can carry the title above. The access check, the chrome and every
 * refusal state live in {@link PlatformConsoleShell}, which is a client component.
 *
 * @param props.children - The routed console page.
 * @returns The console shell.
 */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <PlatformConsoleShell>{children}</PlatformConsoleShell>;
}
