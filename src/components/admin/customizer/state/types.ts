/**
 * Shared types for the customizer's working state.
 *
 * The customizer edits a single **document** — a theme patch plus an ordered
 * section list — and keeps three copies of it: what the merchant is looking at
 * (`present`), what the server last accepted (`saved`), and what the public
 * storefront is currently serving (`published`). Every status indicator in the
 * UI is derived from comparing those three, which is why "is my work safe?" is
 * never a guess.
 */

import type { Section, StorefrontThemeInput } from '@/lib/storefront-theme';

/** The unit of work: everything the customizer can change about a storefront. */
export interface CustomizerDoc {
  theme: StorefrontThemeInput;
  sections: Section[];
}

/** Which panel the settings rail is showing. */
export type Selection =
  | { kind: 'root' }
  | { kind: 'section'; id: string }
  | { kind: 'theme'; group: ThemeGroupId };

/** The theme panels, in rail order. */
export type ThemeGroupId =
  | 'presets'
  | 'colors'
  | 'typography'
  | 'shape'
  | 'buttons'
  | 'product-card'
  | 'header'
  | 'footer'
  | 'custom-css';

/** Where the rail's tab bar is pointed. */
export type RailTab = 'sections' | 'theme';

export interface CustomizerState {
  /** What the merchant is editing and what the preview shows. */
  present: CustomizerDoc;
  /** Bounded undo stack, oldest first. */
  past: CustomizerDoc[];
  /** Bounded redo stack, most-recently-undone first. */
  future: CustomizerDoc[];
  /** The document the server last confirmed it saved as the draft. */
  saved: CustomizerDoc;
  /** The document the live storefront is serving, or null if never published. */
  published: CustomizerDoc | null;
  /** Current rail panel. */
  selection: Selection;
  /** Which rail tab is active. */
  tab: RailTab;
  /**
   * The last coalescable edit. Dragging a slider fires dozens of changes; they
   * collapse into one undo step while the key and the clock agree.
   */
  lastEdit: { key: string; at: number } | null;
}
