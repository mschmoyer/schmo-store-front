'use client';

/**
 * The copy-link button.
 *
 * A signup coupon's deliverable is a URL an operator pastes into a text message (plan §15); this
 * saves them assembling it by hand. Built from `window.location.origin` at click time rather than
 * a hardcoded domain, so it's still correct in local dev.
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
 * @returns The absolute URL, or the path alone if there's no `window` (never happens in practice —
 *          only called at click time — but keeps the function honest about its assumptions).
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
