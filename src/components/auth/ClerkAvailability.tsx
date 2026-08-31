'use client';

import * as React from 'react';

/**
 * Whether a `<ClerkProvider>` is mounted above this tree.
 *
 * Client code cannot work this out for itself. The publishable key is inlined into the browser
 * bundle but `CLERK_SECRET_KEY` is not, so a client component asking "is Clerk configured?" can
 * only see half the answer — and half is the dangerous half: a publishable key with no secret
 * mounts a widget that signs people in against an instance no route can verify a session from.
 * The server decides, and passes its answer down here.
 *
 * The value is fixed for the life of the process, which is what makes it safe for the two call
 * sites that branch on it to pick a *subtree* rather than a prop: hook order cannot change.
 */
const ClerkAvailabilityContext = React.createContext(false);

export interface ClerkAvailabilityProviderProps {
  /** The server's `isClerkConfigured()` — both keys present. */
  available: boolean;
  children: React.ReactNode;
}

/**
 * Publishes the server's Clerk verdict to the client tree.
 *
 * @param props.available - Whether both Clerk keys are configured.
 * @param props.children - The application tree.
 * @returns The provider.
 */
export function ClerkAvailabilityProvider({
  available,
  children,
}: ClerkAvailabilityProviderProps): React.ReactElement {
  return (
    <ClerkAvailabilityContext.Provider value={available}>
      {children}
    </ClerkAvailabilityContext.Provider>
  );
}

/**
 * Whether Clerk's hooks and components may be used in this tree.
 *
 * `false` means no provider is mounted, so `useClerk` / `useUser` would throw and the UI must fall
 * back to the native path or a labelled "not configured" state.
 *
 * @returns `true` when a `<ClerkProvider>` is mounted above the caller.
 */
export function useClerkAvailable(): boolean {
  return React.useContext(ClerkAvailabilityContext);
}
