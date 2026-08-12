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
  Accordion,
  ActionIcon,
  Alert,
  Anchor,
  AppShell,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Divider,
  Drawer,
  Indicator,
  Input,
  Loader,
  Menu,
  Modal,
  MultiSelect,
  NavLink,
  NumberInput,
  Paper,
  Pagination,
  PasswordInput,
  Progress,
  RingProgress,
  SegmentedControl,
  Select,
  Skeleton,
  Slider,
  Stepper,
  Switch,
  Table,
  Tabs,
  Textarea,
  TextInput,
  ThemeIcon,
  Timeline,
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
 * `azure` is the one informational hue §2 still permits, and it never appears
 * on the marketing site. It is NOT wired to any Mantine name — nothing in the
 * admin should reach for it by accident — but the ramp stays exported so an
 * explicit `color="azure"` remains possible for a genuinely informational
 * state.
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
    azure: azureTuple,
    gray: inkTuple,
    dark: darkTuple,

    /*
     * ------------------------------------------------------------------
     * Every Mantine hue name, re-pointed at the palette.
     * ------------------------------------------------------------------
     * The admin is ~11k lines of Mantine written before the design system
     * existed, and it names hues directly: `color="blue"` on an active nav
     * item, `color="violet"` on "View Store", `color="teal"` on an
     * integration icon. Migrating all ~240 call sites by hand is necessary
     * but not SUFFICIENT — the next person to type `color="cyan"` would put
     * the hue straight back.
     *
     * So the hue names are redefined rather than merely avoided. There is no
     * string an author can pass that produces a colour outside the palette:
     *
     *   decorative hues -> ink        (blue, cyan, indigo, violet, grape,
     *                                  pink, purple, lime, teal)
     *   green           -> mint       the ONE signal: money, stock, success
     *   yellow / orange -> amber      warning
     *   red             -> rose       destructive and error
     *
     * `teal` and `lime` deliberately land on INK, not on mint. They were used
     * decoratively (an integration icon, a chart series); routing them to the
     * signal would spray green across the admin and destroy exactly the
     * discipline §2 is about — green means money, stock or success and
     * nothing else. Only the literal name `green` earns the signal.
     */
    blue: inkTuple,
    cyan: inkTuple,
    indigo: inkTuple,
    violet: inkTuple,
    grape: inkTuple,
    pink: inkTuple,
    teal: inkTuple,
    lime: inkTuple,
    /* Not a Mantine hue at all — which is why `color="purple"` fell through to
       the CSS named colour and rendered actual #800080 in the sidebar. */
    purple: inkTuple,

    green: mintTuple,
    yellow: amberTuple,
    orange: amberTuple,
    red: roseTuple,
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

    PasswordInput: PasswordInput.extend({ styles: fieldStyles }),

    Checkbox: Checkbox.extend({ defaultProps: { radius: 'xs' } }),
    /* Was `color: 'ember'`. The primary colour is ink, and an "on" switch is an
       active state, not a success — §2 forbids using the signal for that. */
    Switch: Switch.extend({ defaultProps: { color: 'ink' } }),

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
        /* §5: numeric columns are tabular so digits line up down the column.
           Applied to every cell — proportional figures in a table of money is
           the single most common way an admin grid reads as amateur. */
        td: { fontVariantNumeric: 'tabular-nums' },
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

    Pagination: Pagination.extend({ defaultProps: { radius: 'xs' } }),

    /* ----------------------------------------------------------------------
     * Below: components the admin leans on that had no mapping at all, so they
     * rendered stock Mantine. Each one was a visible off-palette surface.
     * ------------------------------------------------------------------- */

    /* The app shell itself. Without this the header and navbar inherit
       Mantine's own `--mantine-color-body`, and the admin header was painting
       a near-black gradient over the top of it. */
    AppShell: AppShell.extend({
      styles: {
        header: {
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
        },
        navbar: {
          backgroundColor: 'var(--surface)',
          borderColor: 'var(--border)',
        },
        main: { backgroundColor: 'var(--surface)' },
      },
    }),

    /*
     * §2's active-state rule, expressed once: an active nav item is weight, a
     * `--surface-2` fill and an ink left rule — never a colour. Mantine's
     * default paints `--mantine-primary-color-light`, which is how the sidebar
     * ended up with a blue Dashboard, a purple View Store and a red Logout.
     */
    NavLink: NavLink.extend({
      defaultProps: { color: 'ink' },
      styles: {
        root: {
          borderRadius: 'var(--radius-sm)',
          paddingBlock: 9,
          color: 'var(--text-secondary)',
          borderLeft: '2px solid transparent',
        },
        label: { fontSize: '0.9375rem', fontWeight: 500 },
      },
    }),

    Alert: Alert.extend({
      defaultProps: { radius: 'md', variant: 'light' },
      styles: {
        root: { borderWidth: 1, borderStyle: 'solid' },
        title: { fontWeight: 600, fontSize: '0.9375rem' },
        message: { fontSize: '0.875rem' },
      },
    }),

    ThemeIcon: ThemeIcon.extend({ defaultProps: { variant: 'light', color: 'ink', radius: 'sm' } }),

    ActionIcon: ActionIcon.extend({ defaultProps: { variant: 'subtle', color: 'ink' } }),

    Anchor: Anchor.extend({
      styles: { root: { color: 'var(--accent-text)', textUnderlineOffset: '0.2em' } },
    }),

    /* Progress bars sit under stat cards. A coloured bar per card is exactly
       the "one tint each" pattern the dashboard was rebuilt to remove. */
    Progress: Progress.extend({
      defaultProps: { color: 'ink', radius: 'xl', size: 'sm' },
      styles: { root: { backgroundColor: 'var(--surface-inset)' } },
    }),

    RingProgress: RingProgress.extend({ defaultProps: { rootColor: 'var(--surface-inset)' } }),

    Loader: Loader.extend({ defaultProps: { color: 'ink', type: 'oval' } }),

    Skeleton: Skeleton.extend({ defaultProps: { radius: 'sm' } }),

    SegmentedControl: SegmentedControl.extend({
      defaultProps: { radius: 'sm', color: 'ink' },
      styles: {
        root: { backgroundColor: 'var(--surface-inset)', border: '1px solid var(--border)' },
        label: { fontWeight: 600, fontSize: '0.875rem' },
      },
    }),

    Stepper: Stepper.extend({ defaultProps: { color: 'ink' } }),
    Timeline: Timeline.extend({ defaultProps: { color: 'ink' } }),
    Slider: Slider.extend({ defaultProps: { color: 'ink' } }),
    Indicator: Indicator.extend({ defaultProps: { color: 'ink' } }),
    Accordion: Accordion.extend({
      defaultProps: { radius: 'md' },
      styles: { control: { fontWeight: 600 }, item: { borderColor: 'var(--border)' } },
    }),

    Avatar: Avatar.extend({
      defaultProps: { color: 'ink', radius: 'sm' },
      styles: { root: { backgroundColor: 'var(--surface-inset)' } },
    }),

    Code: Code.extend({
      styles: {
        root: {
          fontFamily: FONT_MONO,
          backgroundColor: 'var(--surface-inset)',
          color: 'var(--text-primary)',
        },
      },
    }),
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
