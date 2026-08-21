'use client';

/**
 * An email address that breaks where an address breaks.
 *
 * An email has no whitespace in it, so a browser given `overflow-wrap: anywhere` will break it
 * wherever the box happens to end — the merchant list shipped that, and produced
 * `another.user@exa` / `mple.com`. The comment above the rule claimed it would break "at the @ or a
 * dot before it breaks mid-word"; `anywhere` does no such thing, and only the absence of a narrow
 * column hid it.
 *
 * The fix is to give the string real break opportunities. `<wbr>` after the `@` and after each dot
 * in the domain marks the places a reader would break it themselves, and the stylesheet then uses
 * `overflow-wrap: break-word`, which prefers a marked opportunity and falls back to breaking a word
 * only when a single unbreakable run is genuinely wider than its column. The local part is left
 * whole: `mike.schmoyer` split across two lines is the same defect one field to the left.
 *
 * **The address is rendered as text, never as markup.** It is merchant-supplied data; it goes
 * through React's normal escaping like every other string on these screens.
 */

import React from 'react';
import styles from './emailAddress.module.css';

export interface EmailAddressProps {
  /** The address to display. Rendered verbatim, with break opportunities inserted around it. */
  address: string;
  /** Class applied to the wrapper, so callers keep control of size and colour. */
  className?: string;
  /** Renders a `mailto:` link instead of plain text. @default false */
  asLink?: boolean;
}

/**
 * Splits an address into the runs between its natural break points.
 *
 * @param address - The address.
 * @returns The runs, in order. Joining them reproduces the input exactly, so nothing is ever
 *   dropped or reordered by the display layer.
 */
function breakRuns(address: string): string[] {
  const at = address.indexOf('@');
  if (at < 0) return [address];

  const local = address.slice(0, at + 1);
  const domain = address.slice(at + 1);

  /* Keep each dot with the label it follows, so a break lands before a label rather than orphaning
     a full stop at the end of a line. */
  const labels = domain.split('.');
  const domainRuns = labels.map((label, index) => (index === 0 ? label : `.${label}`));

  return [local, ...domainRuns].filter((run) => run.length > 0);
}

/**
 * Renders an email address with sensible wrapping.
 *
 * @param props - {@link EmailAddressProps}
 * @returns The address, as text or as a `mailto:` link.
 */
export function EmailAddress({
  address,
  className,
  asLink = false,
}: EmailAddressProps): React.ReactElement {
  const runs = breakRuns(address);

  const body = runs.map((run, index) => (
    <React.Fragment key={`${index}-${run}`}>
      {index > 0 ? <wbr /> : null}
      {run}
    </React.Fragment>
  ));

  const classes = className ? `${styles.email} ${className}` : styles.email;

  if (asLink) {
    return (
      <a className={classes} href={`mailto:${address}`}>
        {body}
      </a>
    );
  }

  return <span className={classes}>{body}</span>;
}
