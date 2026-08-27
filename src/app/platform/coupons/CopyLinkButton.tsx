'use client';

/**
 * The copy-link button.
 *
 * Plan §15 names this the thing that decides whether the whole feature gets used: the deliverable
 * of a signup coupon is a URL an operator pastes into a text message, and making them assemble
 * `https://<host>/join/` + code by hand is a small friction that gets it used less. The link is
 * built from `window.location.origin` at click time — on `rebelshops.com` that is the production
 * domain the operator actually wants to hand out; in local development it is `localhost`, which is
 * the honest link for that environment rather than a hardcoded production URL that would not work
 * from a dev session.
 */

import React, { useCallback, useState } from 'react';
import { IconCheck, IconLink } from '@tabler/icons-react';
import { Button } from '@/components/ui';

export interface CopyLinkButtonProps {
  /** The coupon's issued code, e.g. `"FRIENDS12"`. */
  code: string;
  /** How long the "Copied" confirmation stays up, in ms. @default 2000 */
  confirmMs?: number;
}

/**
 * Build the full `/join/<code>` URL for the host currently serving the page.
 *
 * @param code - The coupon's issued code.
 * @returns The absolute URL, or the path alone during server rendering (there is no `window` yet;
 *          the button only ever runs this at click time in the browser, so this branch is dead in
 *          practice and exists only so the function has no unsafe assumption baked in).
 */
function buildJoinUrl(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/join/${encodeURIComponent(code)}`;
}

/**
 * Copies a coupon's signup link to the clipboard and confirms it happened.
 *
 * @param props - {@link CopyLinkButtonProps}
 * @returns A button that copies the link and briefly confirms the copy.
 */
export function CopyLinkButton({ code, confirmMs = 2000 }: CopyLinkButtonProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleCopy = useCallback(async () => {
    const url = buildJoinUrl(code);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), confirmMs);
    } catch {
      // A blocked clipboard permission is the only realistic failure here. Say so rather than
      // pretending the copy worked — CLAUDE.md's "Honest results" rule applies to a button's own
      // feedback, not only to server responses.
      setFailed(true);
      window.setTimeout(() => setFailed(false), confirmMs);
    }
  }, [code, confirmMs]);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={handleCopy}
      leftIcon={copied ? <IconCheck size={14} /> : <IconLink size={14} />}
      aria-label={`Copy the signup link for ${code}`}
    >
      <span aria-live="polite">
        {copied ? 'Copied' : failed ? 'Could not copy — copy manually' : 'Copy link'}
      </span>
    </Button>
  );
}
