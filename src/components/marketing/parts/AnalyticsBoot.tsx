'use client';

import { useEffect } from 'react';
import { initializeAnalytics } from '@/lib/analytics';

/**
 * Starts the first-party page-view tracker on marketing routes. Renders
 * nothing; exists so the surrounding page can stay a server component.
 *
 * @returns `null`.
 */
export function AnalyticsBoot(): null {
  useEffect(() => {
    const cleanup = initializeAnalytics();
    return cleanup;
  }, []);

  return null;
}

export default AnalyticsBoot;
