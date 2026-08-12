/**
 * RebelShops Mantine theme.
 *
 * The admin surface is built almost entirely from Mantine, so without this file
 * it renders in stock Mantine blue with Mantine's radii and shadows — visibly a
 * different product from the storefront. Everything below maps Mantine's own
 * primitives onto the tokens in `/docs/design-system.md`.
 *
 * Consumed by `src/components/ui/AppProviders.tsx`.
 */

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Drawer,
  Input,
  Menu,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Pagination,
  Select,
  Switch,
  Table,
  Tabs,
  Textarea,
  TextInput,
  Tooltip,
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineThemeOverride,
} from '@mantine/core';
import { amber, azure, ember, ink, mint, rose } from '@/lib/design/tokens';

/** Turns a 10-key palette ramp into the tuple shape Mantine expects. */
const toTuple = (ramp: Record<number, string>): MantineColorsTuple =>
  [
    ramp[50],
    ramp[100],
    ramp[200],
    ramp[300],
    ramp[400],
    ramp[500],
    ramp[600],
    ramp[700],
    ramp[800],
    ramp[900],
  ] as unknown as MantineColorsTuple;

/*
 * Mantine ships `blue` as its own #228BE6 and any `color="blue"` in the admin
 * renders it, which is a third live colour system next to ours. Overriding the
 * ramp means a stray `color="blue"` lands on --azure-500 instead. §2: azure is
 * informational only, never a CTA.
 */
const azureTuple = [
  azure[50],
  '#DBE7FF',
  '#BFD2FE',
  '#93B4FD',
  '#6094F9',
  '#3B7AF2',
  azure[500],
  azure[600],
  azure[700],
  '#1B3480',
] as unknown as MantineColorsTuple;

const emberTuple = toTuple(ember);
const mintTuple = toTuple(mint);
const amberTuple = toTuple(amber);
const roseTuple = toTuple(rose);

/** Light → dark, matching Mantine's expectation for the `gray` scale. */
const inkTuple = [
  ink[50],
  ink[100],
  ink[200],
  ink[300],
  ink[400],
  ink[500],
  ink[600],
  ink[700],
  ink[800],
  ink[900],
] as unknown as MantineColorsTuple;

/** Mantine reads `dark[7]` as body and `dark[4]` as border in dark scheme. */
const darkTuple = [
  ink[100],
  ink[300],
  ink[400],
  ink[500],
  ink[600],
  ink[700],
  ink[800],
  ink[900],
  ink[950],
  '#050609',
] as unknown as MantineColorsTuple;

const FONT_SANS = 'var(--font-sans)';
const FONT_DISPLAY = 'var(--font-display)';
const FONT_MONO = 'var(--font-mono)';

/** Shared field geometry — §5 says inputs are 40px, 1px border, radius sm.
 *  Interactive states live in `src/styles/mantine-overrides.css`: Mantine v8's
 *  `styles` prop takes flat inline-style objects only, so `&:hover` etc. are
 *  silently dropped (and logged as "Unsupported style property"). */
const fieldStyles = {
  input: {
    minHeight: 40,
    height: 40,
    backgroundColor: 'var(--surface-raised)',
    borderColor: 'var(--border-control)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '0.9375rem',
    transition:
      'border-color var(--duration-micro) var(--ease-out), box-shadow var(--duration-micro) var(--ease-out)',
  },
  label: {
    fontSize: '0.8125rem',
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginBottom: 6,
  },
  description: { fontSize: '0.8125rem', color: 'var(--text-secondary)' },
  error: { fontSize: '0.8125rem', color: 'var(--danger-text)' },
} as const;

/**
 * The Mantine theme override. Pass to `<MantineProvider theme={...}>`.
 *
 * Note: `styles` entries are objects/functions, so this theme is not
 * serializable across the React server/client boundary — it must be imported
 * from a `'use client'` module (see `src/components/ui/AppProviders.tsx`).
 */
export const rebelMantineTheme: MantineThemeOverride = createTheme({
  colors: {
    ink: inkTuple,
    /* Alias. `ember` no longer carries a hue — the tuple resolves to the
       neutral ramp — but admin/product code still names it, so removing the
       key would throw rather than merely look wrong. */
    ember: emberTuple,
    mint: mintTuple,
    amber: amberTuple,
    rose: roseTuple,
    gray: inkTuple,
    dark: darkTuple,
    blue: azureTuple,
  },
  primaryColor: 'ink',
  /*
   * Index 9 = ink-900 (#111214), the primary button fill. White on it measures
   * 18.74:1. The previous mapping used index 6 = ember-600 at 4.51:1, one
   * rounding error from failing AA, and index 5 (ember-500, 3.42:1) failed
   * outright. See docs/design-system.md §2.
   */
  primaryShade: { light: 9, dark: 0 },

  fontFamily: FONT_SANS,
  fontFamilyMonospace: FONT_MONO,
  headings: {
    fontFamily: FONT_DISPLAY,
    fontWeight: '700',
    sizes: {
      h1: { fontSize: 'clamp(2.25rem, 4vw, 3.25rem)', lineHeight: '1.08' },
      h2: { fontSize: 'clamp(1.75rem, 2.6vw, 2.25rem)', lineHeight: '1.15' },
      h3: { fontSize: '1.375rem', lineHeight: '1.25' },
      h4: { fontSize: '1.125rem', lineHeight: '1.35' },
      h5: { fontSize: '1rem', lineHeight: '1.4' },
      h6: { fontSize: '0.875rem', lineHeight: '1.45' },
    },
  },

  defaultRadius: 'sm',
  radius: { xs: '6px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },

  /* Warm-tinted (R > G > B), matching --shadow-* in globals.css. */
  shadows: {
    xs: '0 1px 2px rgba(38,26,20,.06), 0 1px 3px rgba(38,26,20,.03)',
    sm: '0 1px 2px rgba(38,26,20,.07), 0 2px 6px rgba(38,26,20,.05)',
    md: '0 2px 4px rgba(38,26,20,.05), 0 8px 20px -4px rgba(38,26,20,.11)',
    lg: '0 4px 8px rgba(38,26,20,.05), 0 20px 44px -8px rgba(38,26,20,.15)',
    xl: '0 8px 16px rgba(38,26,20,.06), 0 36px 80px -16px rgba(38,26,20,.20)',
  },

  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  fontSizes: { xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.375rem' },

  focusRing: 'auto',
  cursorType: 'pointer',
  respectReducedMotion: true,

  components: {
    Button: Button.extend({
      defaultProps: { radius: 'sm' },
      styles: {
        root: {
          fontFamily: FONT_SANS,
          fontWeight: 600,
          letterSpacing: '-0.005em',
        },
      },
    }),

    Paper: Paper.extend({
      defaultProps: { radius: 'lg', withBorder: true },
      styles: {
        root: {
          backgroundColor: 'var(--surface-raised)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        },
      },
    }),

    Card: Card.extend({
      defaultProps: { radius: 'lg', withBorder: true, shadow: 'sm' },
      styles: {
        root: {
          backgroundColor: 'var(--surface-raised)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
          transition:
            'border-color var(--duration-standard) var(--ease-out), box-shadow var(--duration-standard) var(--ease-out)',
        },
      },
    }),

    Input: Input.extend({ styles: { input: fieldStyles.input } }),
    TextInput: TextInput.extend({ styles: fieldStyles }),
    Textarea: Textarea.extend({
      styles: {
        ...fieldStyles,
        input: { ...fieldStyles.input, height: 'auto', minHeight: 88, paddingBlock: 10 },
      },
    }),
    NumberInput: NumberInput.extend({ styles: fieldStyles }),
    Select: Select.extend({ styles: fieldStyles }),
    MultiSelect: MultiSelect.extend({
      styles: { ...fieldStyles, input: { ...fieldStyles.input, height: 'auto' } },
    }),

    Checkbox: Checkbox.extend({ defaultProps: { radius: 'xs' } }),
    Switch: Switch.extend({ defaultProps: { color: 'ember' } }),

    Badge: Badge.extend({
      defaultProps: { radius: 'xl', variant: 'light' },
      styles: {
        root: {
          fontFamily: FONT_SANS,
          fontWeight: 600,
          letterSpacing: '0.01em',
          textTransform: 'none',
        },
      },
    }),

    Table: Table.extend({
      styles: {
        table: { fontSize: '0.875rem', color: 'var(--text-primary)' },
        th: {
          fontFamily: FONT_SANS,
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
        },
      },
    }),

    Modal: Modal.extend({
      defaultProps: { radius: 'lg', centered: true, overlayProps: { blur: 3, backgroundOpacity: 0.55 } },
    }),

    Drawer: Drawer.extend({
      defaultProps: { overlayProps: { blur: 3, backgroundOpacity: 0.5 } },
    }),

    Menu: Menu.extend({ defaultProps: { radius: 'md', shadow: 'md' } }),

    Tooltip: Tooltip.extend({
      defaultProps: { radius: 'xs', withArrow: true, openDelay: 180 },
      styles: {
        tooltip: {
          backgroundColor: 'var(--surface-inverse)',
          color: 'var(--text-inverse)',
          fontSize: '0.8125rem',
          fontWeight: 500,
          padding: '6px 10px',
          boxShadow: 'var(--shadow-md)',
        },
      },
    }),

    Tabs: Tabs.extend({
      styles: { tab: { fontWeight: 600, fontSize: '0.9375rem' } },
    }),

    Divider: Divider.extend({ styles: { root: { borderColor: 'var(--border)' } } }),

    Pagination: Pagination.extend({ defaultProps: { radius: 'xs', color: 'ember' } }),
  },
});

/**
 * Maps Mantine's internal color variables onto our semantic tokens so that
 * Mantine internals we have not explicitly styled still land on the palette.
 *
 * @returns Variable maps for the shared, light and dark scopes.
 */
export const rebelCssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--mantine-font-family': FONT_SANS,
    '--mantine-font-family-headings': FONT_DISPLAY,
    '--mantine-font-family-monospace': FONT_MONO,
  },
  light: {
    '--mantine-color-body': 'var(--surface)',
    '--mantine-color-text': 'var(--text-primary)',
    '--mantine-color-dimmed': 'var(--text-secondary)',
    '--mantine-color-default': 'var(--surface-raised)',
    '--mantine-color-default-hover': 'var(--surface-sunken)',
    '--mantine-color-default-border': 'var(--border)',
    '--mantine-color-default-color': 'var(--text-primary)',
    '--mantine-color-placeholder': 'var(--text-tertiary)',
    '--mantine-color-anchor': 'var(--accent-text)',
    '--mantine-color-error': 'var(--danger)',
  },
  dark: {
    '--mantine-color-body': 'var(--surface)',
    '--mantine-color-text': 'var(--text-primary)',
    '--mantine-color-dimmed': 'var(--text-secondary)',
    '--mantine-color-default': 'var(--surface-raised)',
    '--mantine-color-default-hover': 'var(--surface-inset)',
    '--mantine-color-default-border': 'var(--border)',
    '--mantine-color-default-color': 'var(--text-primary)',
    '--mantine-color-placeholder': 'var(--text-tertiary)',
    '--mantine-color-anchor': 'var(--accent-text)',
    '--mantine-color-error': 'var(--danger)',
  },
});

/* ==========================================================================
   The `rebelTheme` legacy class bundles that used to sit here have been
   DELETED. Their only consumer was `src/components/landing/**`, an orphaned
   duplicate of the marketing site that the rebuild removed; nothing imports
   them now. Use the tokens in globals.css or the primitives in
   `src/components/ui`.
   ========================================================================== */
