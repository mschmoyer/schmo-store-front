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
import { amber, ember, ink, mint, rose } from '@/lib/design/tokens';

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

/** Shared field geometry — §5 says inputs are 40px, 1px border, radius sm. */
const fieldStyles = {
  input: {
    minHeight: 40,
    height: 40,
    backgroundColor: 'var(--surface-raised)',
    borderColor: 'var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: '0.9375rem',
    transition:
      'border-color var(--duration-micro) var(--ease-out), box-shadow var(--duration-micro) var(--ease-out)',
    '&::placeholder': { color: 'var(--text-tertiary)' },
    '&:hover:not(:disabled):not([data-error])': { borderColor: 'var(--border-strong)' },
    '&:focus, &:focus-within': {
      borderColor: 'var(--accent)',
      boxShadow: 'var(--focus-ring)',
    },
    '&[data-error]': { borderColor: 'var(--danger)', color: 'var(--text-primary)' },
    '&:disabled': {
      backgroundColor: 'var(--surface-inset)',
      color: 'var(--text-disabled)',
      opacity: 1,
    },
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
 * Note: `styles` entries are functions/objects, so this object is not
 * serializable across the React server/client boundary — it must be imported
 * from a `'use client'` module.
 */
export const rebelMantineTheme: MantineThemeOverride = createTheme({
  colors: {
    ember: emberTuple,
    mint: mintTuple,
    amber: amberTuple,
    rose: roseTuple,
    gray: inkTuple,
    dark: darkTuple,
  },
  primaryColor: 'ember',
  /** ember-500 is index 5 of our ramp, not Mantine's usual 6. */
  primaryShade: { light: 5, dark: 5 },

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
  radius: {
    xs: '6px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },

  shadows: {
    xs: '0 1px 2px rgba(16,18,22,.06)',
    sm: '0 1px 2px rgba(16,18,22,.06), 0 2px 6px rgba(16,18,22,.05)',
    md: '0 2px 4px rgba(16,18,22,.05), 0 8px 20px -4px rgba(16,18,22,.10)',
    lg: '0 4px 8px rgba(16,18,22,.04), 0 20px 44px -8px rgba(16,18,22,.14)',
    xl: '0 8px 16px rgba(16,18,22,.05), 0 36px 80px -16px rgba(16,18,22,.20)',
  },

  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  fontSizes: {
    xs: '0.75rem',
    sm: '0.875rem',
    md: '1rem',
    lg: '1.125rem',
    xl: '1.375rem',
  },

  focusRing: 'auto',
  cursorType: 'pointer',
  respectReducedMotion: true,

  components: {
    Button: Button.extend({
      defaultProps: { radius: 'sm' },
      styles: (_theme, props) => ({
        root: {
          fontFamily: FONT_SANS,
          fontWeight: 600,
          letterSpacing: '-0.005em',
          height: props.size === 'lg' ? 48 : props.size === 'xs' || props.size === 'sm' ? 32 : 40,
          transition:
            'transform var(--duration-micro) var(--ease-out), box-shadow var(--duration-micro) var(--ease-out), background-color var(--duration-micro) var(--ease-out), border-color var(--duration-micro) var(--ease-out)',
          boxShadow: props.variant === 'filled' ? 'var(--shadow-ember-sm)' : 'none',
          '&:hover:not([data-disabled]):not(:disabled)': {
            transform: 'translateY(-1px)',
            boxShadow: props.variant === 'filled' ? 'var(--shadow-ember)' : 'var(--shadow-xs)',
          },
          '&:active:not([data-disabled]):not(:disabled)': {
            transform: 'translateY(0)',
            boxShadow: 'var(--shadow-xs)',
          },
          '&:focus-visible': { boxShadow: 'var(--focus-ring)' },
        },
      }),
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

    Checkbox: Checkbox.extend({
      defaultProps: { radius: 'xs' },
      styles: {
        input: {
          borderColor: 'var(--border-strong)',
          backgroundColor: 'var(--surface-raised)',
          cursor: 'pointer',
          '&:checked': { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)' },
          '&:focus-visible': { boxShadow: 'var(--focus-ring)' },
        },
        label: { color: 'var(--text-primary)', fontSize: '0.9375rem' },
      },
    }),

    Switch: Switch.extend({
      styles: {
        track: {
          borderColor: 'transparent',
          backgroundColor: 'var(--border-strong)',
          cursor: 'pointer',
          transition: 'background-color var(--duration-micro) var(--ease-out)',
        },
        label: { color: 'var(--text-primary)', fontSize: '0.9375rem' },
      },
    }),

    Badge: Badge.extend({
      defaultProps: { radius: 'full', variant: 'light' },
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
        thead: { backgroundColor: 'var(--surface-sunken)' },
        th: {
          fontFamily: FONT_SANS,
          fontSize: '0.75rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          borderColor: 'var(--border)',
        },
        td: { borderColor: 'var(--border-subtle)' },
        tr: { borderColor: 'var(--border-subtle)' },
      },
    }),

    Modal: Modal.extend({
      defaultProps: { radius: 'lg', centered: true, overlayProps: { blur: 2 } },
      styles: {
        content: {
          backgroundColor: 'var(--surface-overlay)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
        },
        header: { backgroundColor: 'var(--surface-overlay)', borderBottom: '1px solid var(--border-subtle)' },
        title: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.125rem' },
        overlay: { backgroundColor: 'var(--surface-scrim)' },
      },
    }),

    Drawer: Drawer.extend({
      styles: {
        content: { backgroundColor: 'var(--surface-overlay)' },
        header: { backgroundColor: 'var(--surface-overlay)', borderBottom: '1px solid var(--border-subtle)' },
        title: { fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: '1.125rem' },
        overlay: { backgroundColor: 'var(--surface-scrim)' },
      },
    }),

    Menu: Menu.extend({
      defaultProps: { radius: 'md', shadow: 'md' },
      styles: {
        dropdown: {
          backgroundColor: 'var(--surface-overlay)',
          borderColor: 'var(--border)',
          padding: 6,
        },
        item: { borderRadius: 'var(--radius-xs)', fontSize: '0.9375rem' },
      },
    }),

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
      styles: {
        tab: {
          fontWeight: 600,
          fontSize: '0.9375rem',
          color: 'var(--text-secondary)',
          transition: 'color var(--duration-micro) var(--ease-out)',
        },
        list: { borderColor: 'var(--border)' },
      },
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
   LEGACY — the Tailwind class bundles below predate the design system and are
   still imported by src/components/landing/**. Values have been repointed at
   the new palette so those pages do not read as a different product, but do
   not use `rebelTheme` in new code: use the tokens in globals.css instead.
   ========================================================================== */

/**
 * Legacy class-name bundles kept for the landing page components.
 * @deprecated Use design-system tokens / `src/components/ui` primitives.
 */
export const rebelTheme = {
  colors: {
    primary: {
      orange: ember[500],
      amber: amber[500],
      tan: '#D4A574',
      green: mint[500],
      blue: '#2563EB',
      red: rose[500],
    },
    text: {
      primary: ink[900],
      secondary: ink[500],
      muted: ink[400],
      white: '#FFFFFF',
    },
    background: {
      primary: '#FBFAF8',
      cream: '#FFF8F0',
      lightOrange: ember[50],
      lightAmber: amber[50],
      lightGreen: mint[50],
      lightBlue: '#F0F8FF',
      lightTan: '#FDF5E6',
    },
    interactive: {
      primary: ember[500],
      secondary: mint[500],
      tertiary: '#2563EB',
      accent: amber[500],
      hover: {
        primary: ember[600],
        secondary: mint[600],
        tertiary: '#1D4ED8',
        accent: amber[600],
      },
    },
  },

  sections: {
    hero: 'bg-gradient-to-br from-orange-50 to-amber-50',
    features: 'bg-gradient-to-br from-blue-50 to-cyan-50',
    howItWorks: 'bg-gradient-to-br from-green-50 to-emerald-50',
    demoStores: 'bg-gradient-to-br from-amber-50 to-yellow-50',
    cta: 'bg-gradient-to-br from-orange-100 to-amber-100',
    footer: 'bg-gradient-to-br from-gray-50 to-stone-50',
  },

  classes: {
    button: {
      primary: '!bg-orange-600 hover:!bg-orange-700 !text-white !border-orange-600',
      secondary: '!bg-green-600 hover:!bg-green-700 !text-white !border-green-600',
      tertiary: '!bg-blue-600 hover:!bg-blue-700 !text-white !border-blue-600',
      accent: '!bg-amber-500 hover:!bg-amber-600 !text-gray-900 !border-amber-500',
      outline: {
        primary: '!border-2 !border-orange-600 !text-orange-600 hover:!bg-orange-50 hover:!text-orange-700',
        primaryDark: '!border-2 !border-orange-700 !text-orange-700 hover:!bg-orange-100 hover:!text-orange-800',
        secondary: '!border-2 !border-green-600 !text-green-600 hover:!bg-green-50 hover:!text-green-700',
        tertiary: '!border-2 !border-blue-600 !text-blue-600 hover:!bg-blue-50 hover:!text-blue-700',
        accent: '!border-2 !border-amber-500 !text-amber-600 hover:!bg-amber-50 hover:!text-amber-700',
      },
    },
    text: {
      heading: 'text-gray-900',
      body: 'text-gray-700',
      muted: 'text-gray-600',
      light: 'text-gray-500',
      white: 'text-white',
    },
    link: {
      primary: '!text-orange-600 hover:!text-orange-700',
      secondary: '!text-green-600 hover:!text-green-700',
      tertiary: '!text-blue-600 hover:!text-blue-700',
      accent: '!text-amber-600 hover:!text-amber-700',
    },
    card: {
      background: 'bg-white',
      border: 'border-gray-200',
      shadow: 'shadow-sm hover:shadow-md',
    },
  },
} as const;

export type RebelTheme = typeof rebelTheme;
