'use client';

/**
 * Suppliers.
 *
 * `SuppliersManagement` has always been a real, working component — it was mounted inside a tab on
 * the inventory page, three clicks from anywhere and impossible to link to. Now that inventory no
 * longer nests other surfaces as tabs, suppliers needs a home of its own, and it deserves one: who
 * you buy from is referenced by every purchase order and by every product's reorder policy, and it
 * is a list a merchant maintains rather than something they do to stock.
 */

import React from 'react';
import { Stack } from '@mantine/core';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import SuppliersManagement from '@/components/admin/SuppliersManagement';

/**
 * The suppliers page.
 *
 * @returns The supplier list with its create and edit flows.
 */
export default function SuppliersPage(): React.ReactElement {
  return (
    <Stack gap="lg">
      <AdminPageHeader
        title="Suppliers"
        description="Who you buy from, their terms, and how they have performed."
      />
      <SuppliersManagement />
    </Stack>
  );
}
