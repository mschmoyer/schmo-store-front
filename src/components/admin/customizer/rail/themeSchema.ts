/**
 * The theme settings, described in exactly the same `SettingField` vocabulary
 * the engine uses for sections.
 *
 * Doing it this way means the theme panels reuse the very same controls as the
 * section panels — one colour picker, one range control, one toggle in the
 * whole product. The only extra a theme field needs over a section field is the
 * dotted path it writes to and, for the few numeric enums, a coercion back off
 * the string a `<select>` hands us.
 *
 * Option lists mirror `types.ts`. They are deliberately spelled out rather than
 * derived from the Zod schemas, because the merchant-facing wording ("Rounded",
 * "Roomy") is a product decision, not a type.
 */

import type { SettingField } from '@/lib/storefront-theme';

import type { ThemeGroupId } from '../state/types';

export interface ThemeFieldDescriptor {
  /** Dotted path into the theme patch, e.g. `brand.color`. */
  path: string;
  field: SettingField;
  /**
   * Convert the control's output before it is written to the theme.
   * Needed for the numeric enums, since a `<select>` only speaks strings.
   * @param value - Whatever the control produced
   */
  coerce?: (value: unknown) => unknown;
  /** Render a select as a segmented control. Set for short, scannable choices. */
  segmented?: boolean;
}

export interface ThemeGroup {
  id: ThemeGroupId;
  label: string;
  /** `@tabler/icons-react` export name. */
  icon: string;
  /** One line under the group title in the rail. */
  description: string;
  /** Empty for the groups that need a bespoke panel (presets, type, CSS). */
  fields: ThemeFieldDescriptor[];
}

/**
 * Build a colour descriptor.
 * @param path - Dotted theme path
 * @param label - Merchant-facing label
 * @param help - Optional help text
 * @param optional - True when clearing the field hands the choice to the engine
 * @returns A theme field descriptor
 */
function color(
  path: string,
  label: string,
  help?: string,
  optional = false,
): ThemeFieldDescriptor {
  return {
    path,
    field: { id: path, label, type: 'color', default: optional ? '' : '#000000', help },
  };
}

/**
 * Build a select descriptor.
 * @param path - Dotted theme path
 * @param label - Merchant-facing label
 * @param options - Value/label pairs
 * @param extra - Segmented flag, coercion and help text
 * @returns A theme field descriptor
 */
function select(
  path: string,
  label: string,
  options: Array<[string, string]>,
  extra: { segmented?: boolean; coerce?: (value: unknown) => unknown; help?: string } = {},
): ThemeFieldDescriptor {
  return {
    path,
    field: {
      id: path,
      label,
      type: 'select',
      default: options[0][0],
      options: options.map(([value, optionLabel]) => ({ value, label: optionLabel })),
      help: extra.help,
    },
    segmented: extra.segmented ?? options.length <= 4,
    coerce: extra.coerce,
  };
}

/**
 * Build a toggle descriptor.
 * @param path - Dotted theme path
 * @param label - Merchant-facing label
 * @param help - Optional help text
 * @returns A theme field descriptor
 */
function toggle(path: string, label: string, help?: string): ThemeFieldDescriptor {
  return { path, field: { id: path, label, type: 'toggle', default: false, help } };
}

/**
 * Build a text descriptor.
 * @param path - Dotted theme path
 * @param label - Merchant-facing label
 * @param help - Optional help text
 * @returns A theme field descriptor
 */
function text(path: string, label: string, help?: string): ThemeFieldDescriptor {
  return { path, field: { id: path, label, type: 'text', default: '', help } };
}

/** `<select>` gives us strings; the theme's numeric enums need numbers back. */
const toNumber = (value: unknown): number => Number(value);

export const COLOR_FIELDS: ThemeFieldDescriptor[] = [
  color('brand.color', 'Brand colour', 'Buttons, links and accents across your shop.'),
  color(
    'brand.colorOnBrand',
    'Text on brand',
    'Leave on auto and this is always readable, whatever brand colour you pick.',
    true,
  ),
  color('brand.surface', 'Page background'),
  color('brand.surfaceRaised', 'Card background'),
  color('brand.text', 'Text'),
  color('brand.textMuted', 'Muted text', 'Captions, meta lines and secondary copy.'),
  color('brand.border', 'Borders'),
  color('brand.success', 'In stock / success'),
  color('brand.warning', 'Low stock / warning'),
  color('brand.danger', 'Out of stock / error'),
  select(
    'brand.scheme',
    'Colour scheme',
    [
      ['light', 'Light'],
      ['dark', 'Dark'],
    ],
    { segmented: true, help: 'Tells the engine how to build shadows and overlays.' },
  ),
];

export const TYPOGRAPHY_FIELDS: ThemeFieldDescriptor[] = [
  select(
    'typography.scale',
    'Type scale',
    [
      ['compact', 'Compact'],
      ['default', 'Default'],
      ['spacious', 'Spacious'],
    ],
    { segmented: true },
  ),
  select(
    'typography.headingWeight',
    'Heading weight',
    [
      ['500', 'Medium'],
      ['600', 'Semibold'],
      ['700', 'Bold'],
      ['800', 'Heavy'],
    ],
    { segmented: true, coerce: toNumber },
  ),
  select(
    'typography.headingCase',
    'Heading case',
    [
      ['none', 'As typed'],
      ['uppercase', 'UPPERCASE'],
    ],
    { segmented: true },
  ),
  {
    path: 'typography.headingTracking',
    field: {
      id: 'typography.headingTracking',
      label: 'Heading letter spacing',
      type: 'range',
      default: 0,
      min: -0.04,
      max: 0.04,
      step: 0.005,
      help: 'Negative tightens, positive opens up. Measured in em.',
    },
  },
];

export const SHAPE_FIELDS: ThemeFieldDescriptor[] = [
  select(
    'shape.radius',
    'Corners',
    [
      ['square', 'Square'],
      ['soft', 'Soft'],
      ['rounded', 'Rounded'],
      ['pill', 'Pill'],
    ],
    { segmented: true },
  ),
  select(
    'shape.borderWidth',
    'Border weight',
    [
      ['0', 'None'],
      ['1', 'Hairline'],
      ['2', 'Heavy'],
    ],
    { segmented: true, coerce: toNumber },
  ),
  select(
    'shape.shadow',
    'Elevation',
    [
      ['none', 'Flat'],
      ['subtle', 'Subtle'],
      ['lifted', 'Lifted'],
    ],
    { segmented: true },
  ),
  select(
    'shape.density',
    'Density',
    [
      ['compact', 'Compact'],
      ['default', 'Default'],
      ['roomy', 'Roomy'],
    ],
    { segmented: true, help: 'Scales every gap and page width at once.' },
  ),
];

export const BUTTON_FIELDS: ThemeFieldDescriptor[] = [
  select(
    'buttons.style',
    'Button style',
    [
      ['solid', 'Solid'],
      ['outline', 'Outline'],
      ['soft', 'Soft'],
    ],
    { segmented: true },
  ),
  toggle('buttons.uppercase', 'Uppercase button labels'),
];

export const PRODUCT_CARD_FIELDS: ThemeFieldDescriptor[] = [
  select(
    'productCard.imageRatio',
    'Image shape',
    [
      ['square', 'Square'],
      ['portrait', 'Portrait'],
      ['landscape', 'Landscape'],
    ],
    { segmented: true },
  ),
  select(
    'productCard.imageFit',
    'Image fit',
    [
      ['cover', 'Fill the frame'],
      ['contain', 'Fit inside'],
    ],
    { segmented: true, help: 'Use "fit inside" when your photos are cut-outs on white.' },
  ),
  select(
    'productCard.align',
    'Text alignment',
    [
      ['left', 'Left'],
      ['center', 'Centered'],
    ],
    { segmented: true },
  ),
  select(
    'productCard.hoverEffect',
    'Hover effect',
    [
      ['none', 'None'],
      ['lift', 'Lift'],
      ['zoom', 'Zoom'],
      ['swap', 'Second image'],
    ],
    { segmented: true },
  ),
  toggle('productCard.showVendor', 'Show the vendor name'),
  toggle('productCard.showQuickAdd', 'Show a quick-add button'),
];

export const HEADER_FIELDS: ThemeFieldDescriptor[] = [
  select('header.layout', 'Layout', [
    ['logo-left', 'Logo left, nav beside it'],
    ['logo-center', 'Logo centered'],
    ['logo-left-nav-below', 'Logo left, nav below'],
  ]),
  toggle('header.sticky', 'Stick to the top when scrolling'),
  toggle('header.announcement.enabled', 'Show an announcement bar'),
  text('header.announcement.text', 'Announcement text', 'Free shipping over $50, and so on.'),
  text('header.announcement.href', 'Announcement link', 'Optional. A path such as /products.'),
];

export const FOOTER_FIELDS: ThemeFieldDescriptor[] = [
  select(
    'footer.layout',
    'Layout',
    [
      ['columns', 'Columns'],
      ['minimal', 'Minimal'],
    ],
    { segmented: true },
  ),
  toggle('footer.showNewsletter', 'Show the newsletter signup'),
];

/** The theme panels, in the order the rail lists them. */
export const THEME_GROUPS: ThemeGroup[] = [
  {
    id: 'presets',
    label: 'Presets',
    icon: 'IconTemplate',
    description: 'Six complete looks to start from',
    fields: [],
  },
  {
    id: 'colors',
    label: 'Colours',
    icon: 'IconPalette',
    description: 'Brand, backgrounds, text and status',
    fields: COLOR_FIELDS,
  },
  {
    id: 'typography',
    label: 'Typography',
    icon: 'IconLetterCase',
    description: 'Fonts, scale, weight and tracking',
    fields: TYPOGRAPHY_FIELDS,
  },
  {
    id: 'shape',
    label: 'Shape & density',
    icon: 'IconBorderRadius',
    description: 'Corners, borders, elevation, spacing',
    fields: SHAPE_FIELDS,
  },
  {
    id: 'buttons',
    label: 'Buttons',
    icon: 'IconClick',
    description: 'Fill style and label casing',
    fields: BUTTON_FIELDS,
  },
  {
    id: 'product-card',
    label: 'Product cards',
    icon: 'IconLayoutBoard',
    description: 'Image shape, alignment, hover',
    fields: PRODUCT_CARD_FIELDS,
  },
  {
    id: 'header',
    label: 'Header',
    icon: 'IconLayoutNavbar',
    description: 'Layout, sticky, announcement bar',
    fields: HEADER_FIELDS,
  },
  {
    id: 'footer',
    label: 'Footer',
    icon: 'IconLayoutBottombar',
    description: 'Layout and newsletter',
    fields: FOOTER_FIELDS,
  },
  {
    id: 'custom-css',
    label: 'Custom CSS',
    icon: 'IconCode',
    description: 'Sanitised and scoped to your shop',
    fields: [],
  },
];
