/**
 * The section type registry (spec section 8).
 *
 * The store home page is an ordered list of sections. Each type declares its
 * label, icon, description, default settings, an instance cap, and a **settings
 * schema** — an array of field descriptors the customizer turns into an editing
 * form generically. Adding a new section type therefore means adding an entry
 * here and a component to the renderer's map; it must never mean writing new
 * customizer UI.
 *
 * Icon names refer to `@tabler/icons-react` exports. The registry only carries
 * the name so this module stays free of React imports and can be used from the
 * API layer and from Node scripts.
 */

import type {
  Section,
  SectionDefinition,
  SectionType,
  SettingField,
} from './types';
import { SECTION_TYPES } from './types';

/**
 * Build the default settings object from a settings schema.
 * Keeps `defaultSettings` and `settingsSchema` from drifting apart.
 * @param fields - The section's settings schema
 * @returns A settings record populated with each field's default
 */
function defaultsFrom(fields: SettingField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) out[field.id] = field.default;
  return out;
}

const HEADING_ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
];

const heroFields: SettingField[] = [
  {
    id: 'eyebrow',
    label: 'Eyebrow',
    type: 'text',
    default: '',
    help: 'Small label above the headline. Leave blank to hide it.',
  },
  { id: 'heading', label: 'Headline', type: 'text', default: 'Built to last. Priced to move.' },
  {
    id: 'subheading',
    label: 'Supporting copy',
    type: 'textarea',
    default:
      '[One line on why someone should buy from you. Say only what you will honour.]',
  },
  { id: 'primaryLabel', label: 'Button label', type: 'text', default: 'Shop all' },
  {
    id: 'primaryHref',
    label: 'Button link',
    type: 'text',
    default: '/products',
    help: 'A path on your store, such as /products or /pages/about.',
  },
  { id: 'secondaryLabel', label: 'Secondary button label', type: 'text', default: '' },
  { id: 'secondaryHref', label: 'Secondary button link', type: 'text', default: '' },
  { id: 'image', label: 'Background image', type: 'image', default: '' },
  {
    id: 'layout',
    label: 'Layout',
    type: 'select',
    default: 'split',
    options: [
      { value: 'split', label: 'Text beside image' },
      { value: 'overlay', label: 'Text over image' },
      { value: 'text-only', label: 'Text only' },
    ],
  },
  {
    id: 'height',
    label: 'Height',
    type: 'select',
    default: 'medium',
    options: [
      { value: 'small', label: 'Small' },
      { value: 'medium', label: 'Medium' },
      { value: 'large', label: 'Full screen' },
    ],
  },
  { id: 'align', label: 'Text alignment', type: 'select', default: 'left', options: HEADING_ALIGN_OPTIONS },
  {
    id: 'overlayOpacity',
    label: 'Image dimming',
    type: 'range',
    default: 35,
    min: 0,
    max: 80,
    step: 5,
    help: 'Only applies to the overlay layout. Keeps text readable over a busy photo.',
  },
];

const featuredCollectionFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: 'Featured' },
  { id: 'subheading', label: 'Supporting copy', type: 'text', default: '' },
  {
    id: 'collection',
    label: 'Collection',
    type: 'collection',
    default: '',
    help: 'Leave blank to show your featured products.',
  },
  {
    id: 'products',
    label: 'Or pick products by hand',
    type: 'product-list',
    default: [],
    help: 'Overrides the collection when set.',
  },
  { id: 'limit', label: 'Products shown', type: 'range', default: 8, min: 2, max: 24, step: 1 },
  {
    id: 'columns',
    label: 'Columns on desktop',
    type: 'range',
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
  { id: 'showViewAll', label: 'Show "view all" link', type: 'toggle', default: true },
];

const collectionGridFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: 'Shop by category' },
  { id: 'limit', label: 'Collections shown', type: 'range', default: 6, min: 2, max: 12, step: 1 },
  { id: 'columns', label: 'Columns on desktop', type: 'range', default: 3, min: 2, max: 4, step: 1 },
  {
    id: 'shape',
    label: 'Tile shape',
    type: 'select',
    default: 'landscape',
    options: [
      { value: 'square', label: 'Square' },
      { value: 'portrait', label: 'Portrait' },
      { value: 'landscape', label: 'Landscape' },
    ],
  },
  { id: 'showCount', label: 'Show product counts', type: 'toggle', default: true },
];

const richTextFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: 'About us' },
  {
    id: 'body',
    label: 'Body',
    type: 'richtext',
    default:
      'We started in a garage with one pallet of stock and a label printer. Ten years later we still pack every order ourselves.',
  },
  { id: 'align', label: 'Alignment', type: 'select', default: 'center', options: HEADING_ALIGN_OPTIONS },
  {
    id: 'width',
    label: 'Text width',
    type: 'select',
    default: 'narrow',
    options: [
      { value: 'narrow', label: 'Narrow' },
      { value: 'full', label: 'Full width' },
    ],
  },
];

const imageWithTextFields: SettingField[] = [
  { id: 'image', label: 'Image', type: 'image', default: '' },
  { id: 'heading', label: 'Heading', type: 'text', default: 'Why people keep coming back' },
  {
    id: 'body',
    label: 'Body',
    type: 'textarea',
    default: 'Real stock counts, honest shipping estimates and a human on the other end of the email.',
  },
  { id: 'ctaLabel', label: 'Button label', type: 'text', default: '' },
  { id: 'ctaHref', label: 'Button link', type: 'text', default: '' },
  {
    id: 'imageSide',
    label: 'Image position',
    type: 'select',
    default: 'left',
    options: [
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
    ],
  },
  {
    id: 'imageRatio',
    label: 'Image shape',
    type: 'select',
    default: 'landscape',
    options: [
      { value: 'square', label: 'Square' },
      { value: 'portrait', label: 'Portrait' },
      { value: 'landscape', label: 'Landscape' },
    ],
  },
];

const valuePropsFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: '' },
  {
    id: 'items',
    label: 'Items',
    type: 'textarea',
    default: [
      { icon: 'IconTruck', title: '[Dispatch speed]', body: '[How fast do orders leave you?]' },
      { icon: 'IconRotateClockwise', title: '[Returns]', body: '[How long, and on what conditions?]' },
      { icon: 'IconShieldCheck', title: '[Your guarantee]', body: '[What is covered, and for how long?]' },
    ],
    help: 'Each item has an icon, a title and a line of copy.',
  },
  { id: 'columns', label: 'Columns on desktop', type: 'range', default: 3, min: 2, max: 4, step: 1 },
  {
    id: 'style',
    label: 'Style',
    type: 'select',
    default: 'plain',
    options: [
      { value: 'plain', label: 'Plain' },
      { value: 'cards', label: 'Cards' },
      { value: 'bar', label: 'Compact bar' },
    ],
  },
];

const testimonialsFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: 'What customers say' },
  {
    id: 'items',
    label: 'Testimonials',
    type: 'textarea',
    default: [
      { quote: 'Arrived next morning, exactly as described.', author: 'Dana R.', rating: 5 },
      { quote: 'The only shop I trust for hard-to-find parts.', author: 'Marcus T.', rating: 5 },
      { quote: 'Straight answers on stock. Rare these days.', author: 'Priya K.', rating: 5 },
    ],
  },
  {
    id: 'layout',
    label: 'Layout',
    type: 'select',
    default: 'grid',
    options: [
      { value: 'grid', label: 'Grid' },
      { value: 'carousel', label: 'Carousel' },
      { value: 'single', label: 'One at a time' },
    ],
  },
  { id: 'showRatings', label: 'Show star ratings', type: 'toggle', default: true },
];

const faqFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: 'Questions' },
  {
    id: 'items',
    label: 'Questions',
    type: 'textarea',
    default: [
      { question: 'How fast do you ship?', answer: '[Your dispatch and delivery times.]' },
      { question: 'Can I return something?', answer: '[Your returns window and conditions.]' },
    ],
  },
  { id: 'openFirst', label: 'Open the first answer', type: 'toggle', default: true },
];

const newsletterFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: 'Get restock alerts' },
  {
    id: 'body',
    label: 'Supporting copy',
    type: 'text',
    default: 'One email when something you want is back in stock. Nothing else.',
  },
  { id: 'buttonLabel', label: 'Button label', type: 'text', default: 'Subscribe' },
  { id: 'placeholder', label: 'Input placeholder', type: 'text', default: 'you@example.com' },
  {
    id: 'background',
    label: 'Background',
    type: 'select',
    default: 'sunken',
    options: [
      { value: 'surface', label: 'Page background' },
      { value: 'sunken', label: 'Inset panel' },
      { value: 'brand', label: 'Brand color' },
    ],
  },
  {
    id: 'consentText',
    label: 'Consent line',
    type: 'text',
    default: 'Unsubscribe any time.',
  },
];

const blogPostsFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: 'From the journal' },
  { id: 'limit', label: 'Posts shown', type: 'range', default: 3, min: 1, max: 9, step: 1 },
  { id: 'showExcerpt', label: 'Show excerpts', type: 'toggle', default: true },
  { id: 'showDate', label: 'Show dates', type: 'toggle', default: true },
];

const logoBarFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: 'Brands we carry' },
  {
    id: 'logos',
    label: 'Logos',
    type: 'textarea',
    default: [],
    help: 'Each logo has an image and an optional link.',
  },
  { id: 'grayscale', label: 'Desaturate logos', type: 'toggle', default: true },
  { id: 'scroll', label: 'Scroll continuously', type: 'toggle', default: false },
];

const countdownFields: SettingField[] = [
  { id: 'heading', label: 'Heading', type: 'text', default: 'Sale ends soon' },
  {
    id: 'endsAt',
    label: 'Ends at',
    // `SettingFieldType` has no `datetime` member yet, so this is declared as
    // text and the customizer renders a real date picker for it (see
    // `controls/registry.ts`). Add `'datetime'` to `SETTING_FIELD_TYPES` and
    // this becomes an ordinary schema entry.
    type: 'text',
    default: '',
    help: 'The section hides itself once this passes.',
  },
  { id: 'ctaLabel', label: 'Button label', type: 'text', default: 'Shop the sale' },
  { id: 'ctaHref', label: 'Button link', type: 'text', default: '/products' },
  {
    id: 'background',
    label: 'Background',
    type: 'select',
    default: 'brand',
    options: [
      { value: 'surface', label: 'Page background' },
      { value: 'sunken', label: 'Inset panel' },
      { value: 'brand', label: 'Brand color' },
    ],
  },
  { id: 'hideWhenExpired', label: 'Hide when the timer runs out', type: 'toggle', default: true },
];

/** Every section type the storefront can render, keyed by type. */
export const SECTION_REGISTRY: Record<SectionType, SectionDefinition> = {
  hero: {
    type: 'hero',
    label: 'Hero',
    icon: 'IconLayoutNavbarExpand',
    description: 'The first thing a visitor sees: a headline, a line of copy and a call to action.',
    maxPerPage: 2,
    settingsSchema: heroFields,
    defaultSettings: defaultsFrom(heroFields),
  },
  'featured-collection': {
    type: 'featured-collection',
    label: 'Featured products',
    icon: 'IconLayoutGrid',
    description: 'A grid of products pulled from a collection, or hand-picked.',
    maxPerPage: 6,
    settingsSchema: featuredCollectionFields,
    defaultSettings: defaultsFrom(featuredCollectionFields),
  },
  'collection-grid': {
    type: 'collection-grid',
    label: 'Collection grid',
    icon: 'IconCategory',
    description: 'Category tiles that send visitors into the right part of the catalogue.',
    maxPerPage: 3,
    settingsSchema: collectionGridFields,
    defaultSettings: defaultsFrom(collectionGridFields),
  },
  'rich-text': {
    type: 'rich-text',
    label: 'Text',
    icon: 'IconTypography',
    description: 'A block of formatted copy. Good for a story, a policy or a promise.',
    maxPerPage: 6,
    settingsSchema: richTextFields,
    defaultSettings: defaultsFrom(richTextFields),
  },
  'image-with-text': {
    type: 'image-with-text',
    label: 'Image with text',
    icon: 'IconLayoutColumns',
    description: 'A photo beside a paragraph. The workhorse of a good home page.',
    maxPerPage: 6,
    settingsSchema: imageWithTextFields,
    defaultSettings: defaultsFrom(imageWithTextFields),
  },
  'value-props': {
    type: 'value-props',
    label: 'Value props',
    icon: 'IconBadges',
    description: 'Three or four short reasons to buy here rather than somewhere else.',
    maxPerPage: 3,
    settingsSchema: valuePropsFields,
    defaultSettings: defaultsFrom(valuePropsFields),
  },
  testimonials: {
    type: 'testimonials',
    label: 'Testimonials',
    icon: 'IconQuote',
    description: 'Customer quotes, with optional star ratings.',
    maxPerPage: 2,
    settingsSchema: testimonialsFields,
    defaultSettings: defaultsFrom(testimonialsFields),
  },
  faq: {
    type: 'faq',
    label: 'FAQ',
    icon: 'IconHelpCircle',
    description: 'Accordion of questions. Answers the objections that stop a checkout.',
    maxPerPage: 2,
    settingsSchema: faqFields,
    defaultSettings: defaultsFrom(faqFields),
  },
  newsletter: {
    type: 'newsletter',
    label: 'Newsletter',
    icon: 'IconMail',
    description: 'Email capture with a single field and one clear promise.',
    maxPerPage: 2,
    settingsSchema: newsletterFields,
    defaultSettings: defaultsFrom(newsletterFields),
  },
  'blog-posts': {
    type: 'blog-posts',
    label: 'Blog posts',
    icon: 'IconArticle',
    description: 'The most recent posts from your blog.',
    maxPerPage: 2,
    settingsSchema: blogPostsFields,
    defaultSettings: defaultsFrom(blogPostsFields),
  },
  'logo-bar': {
    type: 'logo-bar',
    label: 'Logo bar',
    icon: 'IconBuildingStore',
    description: 'A row of brand or partner logos. Borrowed credibility.',
    maxPerPage: 2,
    settingsSchema: logoBarFields,
    defaultSettings: defaultsFrom(logoBarFields),
  },
  countdown: {
    type: 'countdown',
    label: 'Countdown',
    icon: 'IconClockHour4',
    description: 'A timer for a sale or a drop. Hides itself once the deadline passes.',
    maxPerPage: 1,
    settingsSchema: countdownFields,
    defaultSettings: defaultsFrom(countdownFields),
  },
};

/** The registry as an array, in the order the "add section" menu should list it. */
export const SECTION_LIST: SectionDefinition[] = SECTION_TYPES.map(
  (type) => SECTION_REGISTRY[type],
);

/**
 * Look up a section definition.
 * @param type - Candidate section type
 * @returns The definition, or undefined for unknown types
 */
export function getSectionDefinition(type: string): SectionDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(SECTION_REGISTRY, type)
    ? SECTION_REGISTRY[type as SectionType]
    : undefined;
}

/**
 * Type guard for section types arriving off the wire.
 * @param type - Candidate value
 * @returns True when the value is a known section type
 */
export function isSectionType(type: unknown): type is SectionType {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(SECTION_REGISTRY, type);
}

/**
 * Create a section instance with its defaults applied.
 *
 * Ids are derived from the type plus a caller-supplied suffix rather than a
 * random value, so `defaultSections()` stays deterministic and diffable.
 *
 * @param type - Section type
 * @param suffix - Unique suffix for the id
 * @param overrides - Settings to merge over the defaults
 * @returns A ready-to-persist section
 */
export function createSection(
  type: SectionType,
  suffix: string,
  overrides: Record<string, unknown> = {},
): Section {
  const definition = SECTION_REGISTRY[type];
  return {
    id: `${type}-${suffix}`,
    type,
    enabled: true,
    settings: { ...definition.defaultSettings, ...overrides },
  };
}

/**
 * The section list a brand-new store starts with.
 *
 * Every setting is pre-filled with copy that reads as intentional, so a merchant
 * who signs up and publishes without touching the customizer still gets a
 * storefront that looks designed rather than empty.
 *
 * @returns A fresh, ordered section list
 */
export function defaultSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: 'New arrivals',
      heading: '[Your headline]',
      subheading:
        'Live inventory straight from our warehouse, so what you see is genuinely on the shelf.',
      primaryLabel: 'Shop all products',
      primaryHref: '/products',
      layout: 'split',
      height: 'medium',
    }),
    createSection('value-props', '1', {
      style: 'bar',
    }),
    createSection('featured-collection', '1', {
      heading: 'Best sellers',
      subheading: 'What people are actually buying this month.',
      limit: 8,
      columns: 4,
    }),
    createSection('image-with-text', '1', {
      heading: 'Run by people who pack the boxes',
      body:
        '[Two or three sentences on who you are and why someone should buy from you.]',
      imageSide: 'left',
    }),
    createSection('collection-grid', '1', {
      heading: 'Shop by category',
      limit: 6,
      columns: 3,
    }),
    createSection('testimonials', '1'),
    createSection('newsletter', '1'),
  ];
}

/**
 * Drop unknown or malformed sections and clamp per-type instance limits.
 *
 * One bad section must never blank a merchant's storefront (spec section 8), so
 * this fails soft: it returns whatever is valid and reports what it dropped.
 *
 * @param sections - Raw sections, typically from JSONB
 * @returns The usable sections plus a list of problems found
 */
export function normalizeSections(sections: unknown): {
  sections: Section[];
  problems: string[];
} {
  const problems: string[] = [];
  if (!Array.isArray(sections)) {
    return { sections: [], problems: ['Sections payload was not an array.'] };
  }

  const counts = new Map<SectionType, number>();
  const seenIds = new Set<string>();
  const out: Section[] = [];

  for (const [index, raw] of sections.entries()) {
    if (typeof raw !== 'object' || raw === null) {
      problems.push(`Section ${index} is not an object.`);
      continue;
    }
    const candidate = raw as Partial<Section>;
    if (!isSectionType(candidate.type)) {
      problems.push(`Section ${index} has unknown type "${String(candidate.type)}".`);
      continue;
    }
    const definition = SECTION_REGISTRY[candidate.type];
    const used = counts.get(candidate.type) ?? 0;
    if (used >= definition.maxPerPage) {
      problems.push(
        `Dropped an extra "${definition.label}" section: the limit is ${definition.maxPerPage} per page.`,
      );
      continue;
    }

    let id = typeof candidate.id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(candidate.id)
      ? candidate.id
      : `${candidate.type}-${index + 1}`;
    while (seenIds.has(id)) id = `${id}-${index + 1}`;
    seenIds.add(id);

    counts.set(candidate.type, used + 1);
    out.push({
      id,
      type: candidate.type,
      enabled: candidate.enabled !== false,
      settings: {
        ...definition.defaultSettings,
        ...(typeof candidate.settings === 'object' && candidate.settings !== null
          ? candidate.settings
          : {}),
      },
    });
  }

  return { sections: out, problems };
}
