/**
 * Canonical types for the storefront theme contract.
 *
 * See `docs/storefront-theme-spec.md` sections 2 and 8. This module is the
 * single source of truth for the shape of a merchant theme; the customizer, the
 * renderer and the API all import from here.
 *
 * Two flavours of every object exist:
 *  - `StorefrontTheme` / `Section`: the fully-populated shape.
 *  - `StorefrontThemeInput`: the wire shape, where **every field is optional**
 *    so a partial patch is always valid and always deep-mergeable.
 */

import { z } from 'zod';

import { storeNavigationSchema } from './navigation';

/* ------------------------------------------------------------------ *
 * Fonts
 * ------------------------------------------------------------------ */

/** Ids of the curated Google fonts merchants may choose from (spec section 5). */
export const FONT_IDS = [
  'inter',
  'space-grotesk',
  'manrope',
  'dm-sans',
  'plus-jakarta',
  'outfit',
  'playfair-display',
  'fraunces',
  'instrument-serif',
  'lora',
  'bricolage-grotesque',
  'archivo',
  'jetbrains-mono',
] as const;

export type FontId = (typeof FONT_IDS)[number];

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

export type ColorScheme = 'light' | 'dark';
export type TypeScale = 'compact' | 'default' | 'spacious';
export type HeadingWeight = 500 | 600 | 700 | 800;
export type HeadingCase = 'none' | 'uppercase';
export type RadiusStyle = 'square' | 'soft' | 'rounded' | 'pill';
export type BorderWidth = 0 | 1 | 2;
export type ShadowStyle = 'none' | 'subtle' | 'lifted';
export type Density = 'compact' | 'default' | 'roomy';
export type ButtonStyle = 'solid' | 'outline' | 'soft';
export type ImageRatio = 'square' | 'portrait' | 'landscape';
export type ImageFit = 'cover' | 'contain';
export type CardAlign = 'left' | 'center';
export type CardHoverEffect = 'none' | 'lift' | 'zoom' | 'swap';
export type HeaderLayout = 'logo-left' | 'logo-center' | 'logo-left-nav-below';
export type FooterLayout = 'columns' | 'minimal';

export interface ThemeBrand {
  /** Merchant's primary/accent color. */
  color: string;
  /** Ink that sits on the brand color. Auto-derived for contrast when omitted. */
  colorOnBrand?: string;
  /** Page ground. */
  surface: string;
  /** Card ground. */
  surfaceRaised: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
  /** Drives derived shadows and overlays. */
  scheme: ColorScheme;
}

export interface ThemeTypography {
  headingFont: FontId;
  bodyFont: FontId;
  /** Multiplies the type ramp. */
  scale: TypeScale;
  headingWeight: HeadingWeight;
  headingCase: HeadingCase;
  /** Letter-spacing in em, -0.04..0.04. */
  headingTracking: number;
}

export interface ThemeShape {
  /** 0 / 8 / 16 / 999 px on cards and buttons. */
  radius: RadiusStyle;
  borderWidth: BorderWidth;
  shadow: ShadowStyle;
  /** Spacing multiplier 0.85 / 1 / 1.2. */
  density: Density;
}

export interface ThemeButtons {
  style: ButtonStyle;
  uppercase: boolean;
}

export interface ThemeProductCard {
  imageRatio: ImageRatio;
  imageFit: ImageFit;
  align: CardAlign;
  showVendor: boolean;
  showQuickAdd: boolean;
  /** `swap` shows the second product image on hover. */
  hoverEffect: CardHoverEffect;
}

export interface ThemeAnnouncement {
  text: string;
  href?: string;
  enabled: boolean;
}

export interface ThemeHeader {
  layout: HeaderLayout;
  sticky: boolean;
  announcement?: ThemeAnnouncement;
}

export interface ThemeFooter {
  layout: FooterLayout;
  showNewsletter: boolean;
}

export interface ThemeCustom {
  /** Merchant-authored CSS. Hostile input; always run through `sanitizeCustomCss`. */
  css?: string;
}

export interface StorefrontTheme {
  version: 1;
  /** Id of the preset this theme was forked from. */
  preset: string;
  brand: ThemeBrand;
  typography: ThemeTypography;
  shape: ThemeShape;
  buttons: ThemeButtons;
  productCard: ThemeProductCard;
  header: ThemeHeader;
  footer: ThemeFooter;
  custom?: ThemeCustom;
}

/**
 * A fully-resolved theme: defaults merged with a preset merged with the
 * merchant's overrides. Everything the renderer needs is present, and
 * `brand.colorOnBrand` has been auto-derived if the merchant did not set it.
 */
export type ResolvedTheme = Omit<StorefrontTheme, 'brand' | 'header' | 'custom'> & {
  brand: ThemeBrand & { colorOnBrand: string };
  header: ThemeHeader & { announcement: ThemeAnnouncement };
  custom: ThemeCustom;
};

/** Recursively optional. The wire format of a theme patch. */
export type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** The wire shape of a theme: every field optional, always deep-mergeable. */
export type StorefrontThemeInput = DeepPartial<StorefrontTheme>;

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

export const SECTION_TYPES = [
  'hero',
  'featured-collection',
  'collection-grid',
  'rich-text',
  'image-with-text',
  'value-props',
  'testimonials',
  'faq',
  'newsletter',
  'blog-posts',
  'logo-bar',
  'countdown',
] as const;

export type SectionType = (typeof SECTION_TYPES)[number];

export interface Section {
  id: string;
  type: SectionType;
  enabled: boolean;
  settings: Record<string, unknown>;
}

/** Control types the customizer knows how to render generically. */
export const SETTING_FIELD_TYPES = [
  'text',
  'textarea',
  'richtext',
  'image',
  'select',
  'toggle',
  'range',
  'color',
  'collection',
  'product-list',
] as const;

export type SettingFieldType = (typeof SETTING_FIELD_TYPES)[number];

export interface SettingFieldOption {
  value: string;
  label: string;
}

export interface SettingField {
  id: string;
  label: string;
  type: SettingFieldType;
  default: unknown;
  help?: string;
  /** Required for `select`. */
  options?: SettingFieldOption[];
  /** Bounds for `range`. */
  min?: number;
  max?: number;
  step?: number;
}

export interface SectionDefinition {
  type: SectionType;
  label: string;
  /** Name of a `@tabler/icons-react` export, e.g. `IconLayoutNavbar`. */
  icon: string;
  description: string;
  defaultSettings: Record<string, unknown>;
  /** How many of this section a single page may hold. */
  maxPerPage: number;
  settingsSchema: SettingField[];
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

/** Everything a customizer thumbnail needs to draw a preset without rendering it. */
export interface PresetThumbnail {
  background: string;
  surface: string;
  brand: string;
  onBrand: string;
  text: string;
  textMuted: string;
  border: string;
  /** Corner radius in px used by the thumbnail's card/button shapes. */
  radiusPx: number;
  headingFont: FontId;
  bodyFont: FontId;
  headingCase: HeadingCase;
  buttonStyle: ButtonStyle;
  imageRatio: ImageRatio;
  headerLayout: HeaderLayout;
}

export interface PresetDefinition {
  id: string;
  name: string;
  /** One-line pitch shown under the thumbnail. */
  description: string;
  /** The vertical this look is aimed at. */
  register: string;
  thumbnail: PresetThumbnail;
  theme: StorefrontTheme;
  /**
   * The home page this preset opens with.
   *
   * A preset is a **design**, not a palette (spec section 6), and half of a
   * design is composition: which sections a shop leads with, in what order,
   * carrying what copy. Without this field every preset fell through to one
   * hardcoded list and the six looks were six colourways of a single page.
   *
   * Required, and required to be *different* per preset —
   * `presets.test.ts` fails if any two presets share a composition.
   */
  sections: Section[];
}

/* ------------------------------------------------------------------ *
 * Zod schemas
 * ------------------------------------------------------------------ */

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** A hex color string. Rejects anything the color engine cannot do math on. */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(HEX_COLOR, 'Must be a hex color such as #1a2b3c');

export const fontIdSchema = z.enum(FONT_IDS);
export const sectionTypeSchema = z.enum(SECTION_TYPES);

export const themeBrandInputSchema = z
  .object({
    color: hexColorSchema,
    colorOnBrand: hexColorSchema,
    surface: hexColorSchema,
    surfaceRaised: hexColorSchema,
    text: hexColorSchema,
    textMuted: hexColorSchema,
    border: hexColorSchema,
    success: hexColorSchema,
    warning: hexColorSchema,
    danger: hexColorSchema,
    scheme: z.enum(['light', 'dark']),
  })
  .partial()
  .strict();

export const themeTypographyInputSchema = z
  .object({
    headingFont: fontIdSchema,
    bodyFont: fontIdSchema,
    scale: z.enum(['compact', 'default', 'spacious']),
    headingWeight: z.union([
      z.literal(500),
      z.literal(600),
      z.literal(700),
      z.literal(800),
    ]),
    headingCase: z.enum(['none', 'uppercase']),
    headingTracking: z.number().min(-0.04).max(0.04),
  })
  .partial()
  .strict();

export const themeShapeInputSchema = z
  .object({
    radius: z.enum(['square', 'soft', 'rounded', 'pill']),
    borderWidth: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    shadow: z.enum(['none', 'subtle', 'lifted']),
    density: z.enum(['compact', 'default', 'roomy']),
  })
  .partial()
  .strict();

export const themeButtonsInputSchema = z
  .object({
    style: z.enum(['solid', 'outline', 'soft']),
    uppercase: z.boolean(),
  })
  .partial()
  .strict();

export const themeProductCardInputSchema = z
  .object({
    imageRatio: z.enum(['square', 'portrait', 'landscape']),
    imageFit: z.enum(['cover', 'contain']),
    align: z.enum(['left', 'center']),
    showVendor: z.boolean(),
    showQuickAdd: z.boolean(),
    hoverEffect: z.enum(['none', 'lift', 'zoom', 'swap']),
  })
  .partial()
  .strict();

export const themeAnnouncementInputSchema = z
  .object({
    text: z.string().max(200),
    href: z.string().max(2048),
    enabled: z.boolean(),
  })
  .partial()
  .strict();

export const themeHeaderInputSchema = z
  .object({
    layout: z.enum(['logo-left', 'logo-center', 'logo-left-nav-below']),
    sticky: z.boolean(),
    announcement: themeAnnouncementInputSchema,
  })
  .partial()
  .strict();

export const themeFooterInputSchema = z
  .object({
    layout: z.enum(['columns', 'minimal']),
    showNewsletter: z.boolean(),
  })
  .partial()
  .strict();

/** Hard cap on merchant CSS. Mirrors `MAX_CUSTOM_CSS_LENGTH` in `sanitize.ts`. */
export const MAX_CUSTOM_CSS_LENGTH = 20_000;

export const themeCustomInputSchema = z
  .object({
    css: z.string().max(MAX_CUSTOM_CSS_LENGTH, 'Custom CSS is too long'),
  })
  .partial()
  .strict();

/**
 * The validated wire shape of a theme patch. Every field is optional; unknown
 * keys are rejected so a typo silently persisting into JSONB is impossible.
 */
export const storefrontThemeInputSchema = z
  .object({
    version: z.literal(1),
    preset: z.string().min(1).max(64),
    brand: themeBrandInputSchema,
    typography: themeTypographyInputSchema,
    shape: themeShapeInputSchema,
    buttons: themeButtonsInputSchema,
    productCard: themeProductCardInputSchema,
    header: themeHeaderInputSchema,
    footer: themeFooterInputSchema,
    custom: themeCustomInputSchema,
  })
  .partial()
  .strict();

/** A single home-page section. Settings are free-form but bounded in size. */
export const sectionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Section ids may only contain letters, numbers, - and _'),
  type: sectionTypeSchema,
  enabled: z.boolean(),
  settings: z.record(z.unknown()).default({}),
});

/** Maximum sections a single home page may hold. */
export const MAX_SECTIONS_PER_PAGE = 40;

export const sectionsSchema = z
  .array(sectionSchema)
  .max(MAX_SECTIONS_PER_PAGE)
  .superRefine((sections, ctx) => {
    const seen = new Set<string>();
    for (const [index, section] of sections.entries()) {
      if (seen.has(section.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'id'],
          message: `Duplicate section id "${section.id}"`,
        });
      }
      seen.add(section.id);
    }
  });

/** Body accepted by `PUT /api/admin/storefront-theme`. */
export const saveDraftBodySchema = z
  .object({
    theme: storefrontThemeInputSchema.optional(),
    sections: sectionsSchema.optional(),
    /**
     * Header and footer menus. Publishes in the same transaction as the
     * sections that link to them — see migration 025 for why they are not a
     * separate resource.
     */
    navigation: storeNavigationSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.theme !== undefined || body.sections !== undefined || body.navigation !== undefined,
    'Provide at least one of "theme", "sections" or "navigation"',
  );

export type SaveDraftBody = z.infer<typeof saveDraftBodySchema>;
