'use client';

/**
 * The identity band at the top of a merchant's page.
 *
 * Two things have to be answerable without scrolling: who this is, and how to
 * look at their shop. So the storefront link is the primary action rather than
 * a link buried in a facts table — the single most common thing an operator
 * does after opening a merchant is go and look at what the customer sees.
 *
 * There is deliberately **no "Open store admin" button**. `/admin` is scoped to
 * the signed-in user's own store and the platform has no impersonation route,
 * so such a button would send an operator to their own admin while claiming to
 * open someone else's. A control that lies about where it goes is worse than a
 * missing one; if impersonation is ever built, this is where it belongs.
 */

import React from 'react';
import Link from 'next/link';
import { Button, CopyButton, Tooltip } from '@mantine/core';
import {
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconExternalLink,
  IconMail,
} from '@tabler/icons-react';
import { CustomizationBadge, StoreStateBadge } from './StoreBadges';
import { EmailAddress } from './EmailAddress';
import { RelativeDate } from './RelativeDate';
import type { PlatformCustomization, PlatformOwnerSummary, PlatformStoreSummary } from './types';
import styles from './customerDetailHeader.module.css';

export interface CustomerDetailHeaderProps {
  /** The store record. */
  store: PlatformStoreSummary;
  /** The merchant behind it. */
  owner: PlatformOwnerSummary;
  /** Theme state, for the customisation badge. */
  customization: PlatformCustomization;
}

/**
 * Renders the merchant's identity, state and primary actions.
 *
 * @param props - {@link CustomerDetailHeaderProps}
 * @returns The detail header.
 */
export function CustomerDetailHeader({
  store,
  owner,
  customization,
}: CustomerDetailHeaderProps): React.ReactElement {
  const storefrontHref = store.storeUrl || `/store/${store.storeSlug}`;

  return (
    <header className={styles.root}>
      <Link className={styles.back} href="/platform/customers">
        <IconArrowLeft size={15} aria-hidden="true" />
        All merchants
      </Link>

      <div className={styles.main}>
        <div className={styles.identity}>
          <h1 className={styles.title}>{store.storeName}</h1>

          <div className={styles.badges}>
            <StoreStateBadge isActive={store.isActive} isPublic={store.isPublic} size="md" />
            <CustomizationBadge
              customized={customization.themeCustomized}
              themeStatus={customization.themeStatus}
              size="md"
            />
          </div>

          <dl className={styles.facts}>
            <div className={styles.fact}>
              <dt>Storefront</dt>
              <dd>
                <span className={styles.mono}>/{store.storeSlug}</span>
                {store.domain ? <span className={styles.domain}>{store.domain}</span> : null}
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Owner</dt>
              <dd>
                {owner.name || 'Unnamed'}
                {/* Break at the @ and the dots, not mid-word: see `EmailAddress`. */}
                <EmailAddress address={owner.email} className={styles.email} asLink />
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Joined</dt>
              <dd>
                {/* One element carrying both readings and the separator between them; two stacked
                    elements read as "6 months ago9 Mar 2026" to anything consuming the text. */}
                <RelativeDate value={store.createdAt} withAbsolute />
              </dd>
            </div>
            <div className={styles.fact}>
              <dt>Last sign-in</dt>
              <dd>
                {/* "Never signed in" would be a lie: nothing in the product
                    writes `users.last_login`, so the column is null for every
                    merchant including the ones trading today. The API says
                    whether the field is tracked, and the UI says so too. */}
                <RelativeDate
                  value={owner.lastLoginTracked ? owner.lastLogin : null}
                  fallback={owner.lastLoginTracked ? 'Never signed in' : 'Not tracked'}
                />
                {owner.lastLoginTracked ? null : (
                  <span className={styles.subtle}>Sign-ins are not recorded yet</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        <div className={styles.actions}>
          {/* Mantine's polymorphic Button rather than the `ui` one: these two
              actions are anchors, and `ui/Button`'s props are typed to a
              `<button>`, so `target` and `rel` cannot be passed through it.
              The Mantine theme paints them in the same ink. */}
          <Button
            component="a"
            href={storefrontHref}
            target="_blank"
            rel="noopener noreferrer"
            leftSection={<IconExternalLink size={16} />}
          >
            Open storefront
          </Button>

          <Button
            component="a"
            href={`mailto:${owner.email}`}
            variant="default"
            leftSection={<IconMail size={16} />}
          >
            Email owner
          </Button>

          <CopyButton value={store.storeId} timeout={1500}>
            {({ copied, copy }) => (
              <Tooltip label={copied ? 'Copied' : 'Copy the store id for a ticket or a query'}>
                <Button
                  variant="subtle"
                  onClick={copy}
                  leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                >
                  {copied ? 'Copied' : 'Store ID'}
                </Button>
              </Tooltip>
            )}
          </CopyButton>
        </div>
      </div>
    </header>
  );
}
