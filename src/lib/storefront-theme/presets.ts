/**
 * The six shipped storefront presets (spec section 6).
 *
 * A preset is a complete `StorefrontTheme`, not a hue rotation. Each one varies
 * *every* structural axis the contract exposes — font pairing, type scale,
 * corner radius, border weight, elevation, density, button treatment, product
 * card geometry, header layout and footer layout — so the six read as six
 * different shops rather than one shop painted six colors.
 *
 * Axis matrix (kept honest by `presets.test.ts`):
 *
 * |          | heading / body            | scale    | radius | border | shadow | density | buttons          | card                    | header               |
 * |----------|---------------------------|----------|--------|--------|--------|---------|------------------|-------------------------|----------------------|
 * | Studio   | Fraunces / Manrope        | spacious | soft   | 1      | none   | roomy   | outline          | square · contain · left | logo-left-nav-below  |
 * | Voltage  | Space Grotesk / Inter     | compact  | square | 1      | none   | compact | solid UPPER      | square · cover · left   | logo-left (sticky)   |
 * | Bloom    | Outfit / DM Sans          | default  | rounded| 0      | subtle | roomy   | soft             | portrait · cover · ctr  | logo-center          |
 * | Depot    | Archivo / Inter           | compact  | square | 1      | none   | compact | solid UPPER      | landscape · contain     | logo-left-nav-below  |
 * | Marquee  | Bricolage / Archivo       | spacious | square | 0      | none   | default | outline UPPER    | portrait · cover · left | logo-center          |
 * | Fresh    | Plus Jakarta / Plus Jak.  | default  | pill   | 1      | lifted | roomy   | solid            | square · cover · center | logo-left (sticky)   |
 *
 * Each preset also ships its **own home page composition** — see the section
 * block below. Tokens make a shop look different; composition and copy make it
 * a different shop, and a preset that only did the first is a colourway.
 *
 * **No preset enables the announcement bar.** It used to: picking a theme in
 * onboarding published a strip across the top of the merchant's live shop
 * reading things like "Next-day dispatch on every order placed before 3pm" or
 * "Free samples with every order" — delivery terms and offers the merchant had
 * never seen, on a step with no preview, that they then had to honour. Sample
 * copy inside a section is a starting point a merchant will edit; a promise in
 * the header is a commitment made on their behalf. The bar now ships off and
 * empty, and the customizer's Header panel carries the example wording as help
 * text instead.
 */

import { RADIUS_PX } from './defaults';
import { createSection, defaultSections } from './sections';
import type { PresetDefinition, Section, SectionType, StorefrontTheme } from './types';

/* ------------------------------------------------------------------ *
 * Studio — warm minimal, craft & homeware
 * ------------------------------------------------------------------ */

const studio: StorefrontTheme = {
  version: 1,
  preset: 'studio',
  brand: {
    color: '#8a6a4f',
    surface: '#faf7f2',
    surfaceRaised: '#ffffff',
    text: '#1c1917',
    textMuted: '#6b625a',
    border: '#e7e0d5',
    success: '#3f7d52',
    warning: '#a3742a',
    danger: '#b03f31',
    scheme: 'light',
  },
  typography: {
    headingFont: 'fraunces',
    bodyFont: 'manrope',
    scale: 'spacious',
    headingWeight: 500,
    headingCase: 'none',
    headingTracking: -0.012,
  },
  shape: {
    radius: 'soft',
    borderWidth: 1,
    shadow: 'none',
    density: 'roomy',
  },
  buttons: { style: 'outline', uppercase: false },
  productCard: {
    imageRatio: 'square',
    imageFit: 'contain',
    align: 'left',
    showVendor: true,
    showQuickAdd: false,
    hoverEffect: 'none',
  },
  header: {
    layout: 'logo-left-nav-below',
    sticky: false,
    announcement: { text: '', enabled: false },
  },
  footer: { layout: 'columns', showNewsletter: true },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Voltage — dark, high contrast, electronics & streetwear
 * ------------------------------------------------------------------ */

const voltage: StorefrontTheme = {
  version: 1,
  preset: 'voltage',
  brand: {
    // Acid lime on near-black: the auto-contrast rule must flip button ink to
    // dark here. If a future change breaks that, this preset shows it first.
    color: '#c6f135',
    surface: '#08090b',
    surfaceRaised: '#14161b',
    text: '#f2f4f7',
    textMuted: '#98a0ae',
    border: '#272c35',
    success: '#3ddc97',
    warning: '#ffb020',
    danger: '#ff5c5c',
    scheme: 'dark',
  },
  typography: {
    headingFont: 'space-grotesk',
    bodyFont: 'inter',
    scale: 'compact',
    headingWeight: 700,
    headingCase: 'uppercase',
    headingTracking: -0.005,
  },
  shape: {
    radius: 'square',
    borderWidth: 1,
    shadow: 'none',
    density: 'compact',
  },
  buttons: { style: 'solid', uppercase: true },
  productCard: {
    imageRatio: 'square',
    imageFit: 'cover',
    align: 'left',
    showVendor: false,
    showQuickAdd: true,
    hoverEffect: 'swap',
  },
  header: {
    layout: 'logo-left',
    sticky: true,
    announcement: { text: '', enabled: false },
  },
  footer: { layout: 'minimal', showNewsletter: true },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Bloom — soft, rounded, beauty & wellness
 * ------------------------------------------------------------------ */

const bloom: StorefrontTheme = {
  version: 1,
  preset: 'bloom',
  brand: {
    color: '#e0819f',
    surface: '#fffbfc',
    surfaceRaised: '#ffffff',
    text: '#3a2b33',
    textMuted: '#7d6a72',
    border: '#f3e3e9',
    success: '#3f9c78',
    warning: '#bb7f2c',
    danger: '#cc4f5c',
    scheme: 'light',
  },
  typography: {
    headingFont: 'outfit',
    bodyFont: 'dm-sans',
    scale: 'default',
    headingWeight: 600,
    headingCase: 'none',
    headingTracking: -0.01,
  },
  shape: {
    radius: 'rounded',
    borderWidth: 0,
    shadow: 'subtle',
    density: 'roomy',
  },
  buttons: { style: 'soft', uppercase: false },
  productCard: {
    imageRatio: 'portrait',
    imageFit: 'cover',
    align: 'center',
    showVendor: false,
    showQuickAdd: true,
    hoverEffect: 'lift',
  },
  header: {
    layout: 'logo-center',
    sticky: true,
    announcement: { text: '', enabled: false },
  },
  footer: { layout: 'minimal', showNewsletter: true },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Depot — dense, utilitarian, parts & B2B
 * ------------------------------------------------------------------ */

const depot: StorefrontTheme = {
  version: 1,
  preset: 'depot',
  brand: {
    color: '#1b4fa0',
    surface: '#f3f4f6',
    surfaceRaised: '#ffffff',
    text: '#14181d',
    textMuted: '#576270',
    border: '#cfd5dd',
    success: '#1a7f4b',
    warning: '#9a6600',
    danger: '#b42318',
    scheme: 'light',
  },
  typography: {
    headingFont: 'archivo',
    bodyFont: 'inter',
    scale: 'compact',
    headingWeight: 700,
    headingCase: 'none',
    headingTracking: -0.004,
  },
  shape: {
    radius: 'square',
    borderWidth: 1,
    shadow: 'none',
    density: 'compact',
  },
  buttons: { style: 'solid', uppercase: true },
  productCard: {
    imageRatio: 'landscape',
    imageFit: 'contain',
    align: 'left',
    showVendor: true,
    showQuickAdd: true,
    hoverEffect: 'none',
  },
  header: {
    layout: 'logo-left-nav-below',
    sticky: true,
    announcement: { text: '', enabled: false },
  },
  footer: { layout: 'columns', showNewsletter: false },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Marquee — editorial, oversized display type, apparel
 * ------------------------------------------------------------------ */

const marquee: StorefrontTheme = {
  version: 1,
  preset: 'marquee',
  brand: {
    // Near-black brand: the auto-contrast rule must flip button ink to white.
    color: '#111111',
    surface: '#ffffff',
    surfaceRaised: '#ffffff',
    text: '#0a0a0a',
    textMuted: '#6b6b6b',
    border: '#e4e4e4',
    success: '#2f7a4f',
    warning: '#8a6a00',
    danger: '#a52a1a',
    scheme: 'light',
  },
  typography: {
    headingFont: 'bricolage-grotesque',
    bodyFont: 'archivo',
    scale: 'spacious',
    headingWeight: 800,
    headingCase: 'uppercase',
    headingTracking: -0.03,
  },
  shape: {
    radius: 'square',
    borderWidth: 0,
    shadow: 'none',
    density: 'default',
  },
  buttons: { style: 'outline', uppercase: true },
  productCard: {
    imageRatio: 'portrait',
    imageFit: 'cover',
    align: 'left',
    showVendor: true,
    showQuickAdd: false,
    hoverEffect: 'swap',
  },
  header: {
    layout: 'logo-center',
    sticky: false,
    announcement: { text: '', enabled: false },
  },
  footer: { layout: 'minimal', showNewsletter: false },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Fresh — bright, friendly, food & supplements
 * ------------------------------------------------------------------ */

const fresh: StorefrontTheme = {
  version: 1,
  preset: 'fresh',
  brand: {
    color: '#12b76a',
    surface: '#f5fbf7',
    surfaceRaised: '#ffffff',
    text: '#0f231a',
    textMuted: '#4f665b',
    border: '#d5e7dc',
    success: '#0e9f5f',
    warning: '#b4791c',
    danger: '#cc4437',
    scheme: 'light',
  },
  typography: {
    headingFont: 'plus-jakarta',
    bodyFont: 'plus-jakarta',
    scale: 'default',
    headingWeight: 800,
    headingCase: 'none',
    headingTracking: -0.022,
  },
  shape: {
    radius: 'pill',
    borderWidth: 1,
    shadow: 'lifted',
    density: 'roomy',
  },
  buttons: { style: 'solid', uppercase: false },
  productCard: {
    imageRatio: 'square',
    imageFit: 'cover',
    align: 'center',
    showVendor: false,
    showQuickAdd: true,
    hoverEffect: 'zoom',
  },
  header: {
    layout: 'logo-left',
    sticky: true,
    announcement: { text: '', enabled: false },
  },
  footer: { layout: 'columns', showNewsletter: true },
  custom: {},
};

/* ------------------------------------------------------------------ *
 * Section compositions
 *
 * A preset is a design, and half of a design is *composition*. Colour and type
 * make a shop look different; the order of the page and the words on it make it
 * a different shop. Each preset therefore ships its own home page: a different
 * set of section types, in a different order, carrying copy written for that
 * preset's vertical.
 *
 * Rules these six follow, so the set stays honest:
 *  - no two presets share a sequence of section types;
 *  - no two presets share a hero headline;
 *  - what a preset leads with matches its register. Depot opens on a category
 *    grid because a parts buyer is navigating, not browsing; Marquee opens on
 *    one oversized image because an apparel shopper is being sold a look.
 *
 * Hero images are deliberately left blank. The renderer falls back to the
 * store's own hero art, so a merchant's photograph appears without them having
 * to re-enter it into every preset they try.
 * ------------------------------------------------------------------ */

/** Studio — the maker's story first, product second. */
function studioSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: 'Small batch',
      heading: 'Made slowly, in a workshop you could visit.',
      subheading:
        'Every piece is finished by hand, so no two are identical. What is on the shelf is what we have.',
      primaryLabel: 'Browse the collection',
      primaryHref: '/products',
      layout: 'split',
      height: 'medium',
      align: 'left',
    }),
    createSection('rich-text', '1', {
      heading: 'A note from the bench',
      body: 'We keep the workshop small on purpose. One kiln, two benches, and a rule that nothing leaves until it would be good enough for our own table.',
      align: 'center',
      width: 'narrow',
    }),
    createSection('featured-collection', '1', {
      heading: 'New this season',
      subheading: 'Fresh off the bench, in the quantities we could actually make.',
      limit: 6,
      columns: 3,
      showViewAll: true,
    }),
    createSection('image-with-text', '1', {
      heading: 'Why our things cost what they cost',
      body: 'Hand work is slow work. A mug takes four days from wheel to wrapping, most of which is drying and firing. We would rather charge honestly for that than thin the clay.',
      imageSide: 'right',
      imageRatio: 'portrait',
    }),
    createSection('collection-grid', '1', {
      heading: 'By room',
      limit: 8,
      columns: 4,
      shape: 'portrait',
      showCount: false,
    }),
    createSection('newsletter', '1', {
      heading: 'Know when the kiln opens',
      body: 'One email per firing, with what came out of it. Nothing else.',
      buttonLabel: 'Keep me posted',
      background: 'surface',
    }),
  ];
}

/** Voltage — the drop, the spec, the proof, in that order. */
function voltageSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: 'In stock now',
      heading: 'Gear that ships before you finish reading this.',
      subheading:
        '[Say what makes ordering from you easy — stock accuracy, dispatch speed, whatever is true.]',
      primaryLabel: 'Shop the range',
      primaryHref: '/products',
      secondaryLabel: 'New arrivals',
      secondaryHref: '/products?sort=newest',
      layout: 'overlay',
      height: 'medium',
      align: 'left',
      overlayOpacity: 60,
    }),
    createSection('value-props', '1', {
      style: 'bar',
      columns: 3,
      items: [
        { icon: 'IconBolt', title: '[Dispatch speed]', body: '[How fast do orders leave you?]' },
        { icon: 'IconShieldCheck', title: '[Your guarantee]', body: '[What is covered, and for how long?]' },
        { icon: 'IconRotateClockwise', title: '[Returns]', body: '[How long, and on what conditions?]' },
      ],
    }),
    createSection('featured-collection', '1', {
      heading: 'Just landed',
      subheading: 'The newest stock, still warm from receiving.',
      limit: 8,
      columns: 4,
      showViewAll: true,
    }),
    createSection('collection-grid', '1', {
      heading: 'By category',
      limit: 8,
      columns: 4,
      shape: 'square',
      showCount: true,
    }),
    createSection('faq', '1', {
      heading: 'Before you buy',
      items: [
        {
          question: 'Is the stock count real?',
          answer: 'Yes. It is read straight from the warehouse, not from a nightly export.',
        },
        {
          question: 'What if it arrives faulty?',
          answer: 'Tell us within two years and we replace it. You do not pay return postage.',
        },
      ],
      openFirst: false,
    }),
    createSection('newsletter', '1', {
      heading: 'Get the drop first',
      body: 'One message when something lands or comes back in stock.',
      buttonLabel: 'Notify me',
      background: 'brand',
    }),
  ];
}

/** Bloom — product, reassurance, ritual. */
function bloomSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: 'Skin first',
      heading: 'Short ingredient lists. Nothing you have to look up.',
      subheading:
        'Formulated with the fewest things that work, and the full list printed on the front of the bottle.',
      primaryLabel: 'Shop skincare',
      primaryHref: '/products',
      layout: 'split',
      height: 'medium',
      align: 'center',
    }),
    createSection('featured-collection', '1', {
      heading: 'Loved right now',
      subheading: 'What is repurchased most often, this month.',
      limit: 6,
      columns: 3,
      showViewAll: true,
    }),
    createSection('image-with-text', '1', {
      heading: 'A routine you will actually keep',
      body: 'Three steps, twice a day, four minutes. We would rather you finish a small routine than abandon a big one.',
      imageSide: 'left',
      imageRatio: 'square',
      ctaLabel: 'Build your routine',
      ctaHref: '/products',
    }),
    createSection('testimonials', '1', {
      heading: 'In their words',
      layout: 'single',
      showRatings: true,
      items: [
        { quote: 'Six weeks in and my skin has stopped arguing with me.', author: 'Nadia S.', rating: 5 },
        { quote: 'The only serum that did not make me break out.', author: 'Joelle P.', rating: 5 },
        { quote: 'I can pronounce everything on the label. That sold me.', author: 'Ren M.', rating: 5 },
      ],
    }),
    createSection('collection-grid', '1', {
      heading: 'Shop by concern',
      limit: 4,
      columns: 2,
      shape: 'portrait',
      showCount: false,
    }),
    createSection('newsletter', '1', {
      heading: 'Restock reminders',
      body: 'We will nudge you roughly when your bottle should be running out.',
      buttonLabel: 'Remind me',
      background: 'sunken',
    }),
  ];
}

/** Depot — navigation first. A parts buyer is not browsing. */
function depotSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: 'Trade counter',
      heading: 'Parts, in stock, with the numbers on them.',
      subheading:
        '[How buyers find a part here, and the account terms you actually offer.]',
      primaryLabel: 'Search the catalogue',
      primaryHref: '/products',
      layout: 'text-only',
      height: 'small',
      align: 'left',
    }),
    createSection('collection-grid', '1', {
      heading: 'Browse by category',
      limit: 12,
      columns: 4,
      shape: 'landscape',
      showCount: true,
    }),
    createSection('featured-collection', '1', {
      heading: 'Fast movers',
      subheading: 'The lines that leave the shelf most often.',
      limit: 12,
      columns: 4,
      showViewAll: false,
    }),
    createSection('value-props', '1', {
      style: 'cards',
      columns: 4,
      items: [
        { icon: 'IconTruck', title: '[Dispatch speed]', body: '[On which lines, ordered by when?]' },
        { icon: 'IconReceipt', title: '[Payment terms]', body: '[Which terms do you offer, and to whom?]' },
        { icon: 'IconRuler', title: 'Full specifications', body: 'Dimensions and weights on every line.' },
        { icon: 'IconPackages', title: '[Volume pricing]', body: '[Where do your price breaks start?]' },
      ],
    }),
    createSection('faq', '1', {
      heading: 'Account and ordering',
      items: [
        {
          question: 'Can I order without an account?',
          answer: '[Do you require an account? Say what one adds.]',
        },
        {
          question: 'Do you ship on a pallet?',
          answer: '[How do you ship heavy or oversized items, and how is that quoted?]',
        },
        {
          question: 'Is the stock figure live?',
          answer: '[Is your stock figure live? Say so only if it is.]',
        },
      ],
      openFirst: true,
    }),
  ];
}

/** Marquee — the image is the argument. Almost no chrome. */
function marqueeSections(): Section[] {
  return [
    createSection('hero', '1', {
      heading: 'The Autumn Edit',
      subheading: 'Eighteen pieces. Cut once, in a mill we have used for nine years.',
      primaryLabel: 'See the edit',
      primaryHref: '/products',
      layout: 'overlay',
      height: 'large',
      align: 'center',
      overlayOpacity: 25,
    }),
    createSection('featured-collection', '1', {
      heading: 'The edit',
      subheading: '',
      limit: 4,
      columns: 2,
      showViewAll: false,
    }),
    createSection('image-with-text', '1', {
      heading: 'One mill, nine years',
      body: 'We buy the whole run rather than a sample, which is why a colour disappears and does not come back.',
      imageSide: 'right',
      imageRatio: 'portrait',
      ctaLabel: 'Read the notes',
      ctaHref: '/products',
    }),
    createSection('featured-collection', '2', {
      heading: 'Back in stock',
      subheading: '',
      limit: 8,
      columns: 4,
      showViewAll: true,
    }),
    createSection('rich-text', '1', {
      heading: '[Your stance on discounting]',
      body:
        '[If you have a pricing philosophy worth stating, state it here. Leave this section out if you would rather not commit to one.]',
      align: 'left',
      width: 'full',
    }),
    createSection('collection-grid', '1', {
      heading: '',
      limit: 3,
      columns: 3,
      shape: 'portrait',
      showCount: false,
    }),
  ];
}

/** Fresh — friendly, and heavy on reassurance before the ask. */
function freshSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: '[Your subscription offer]',
      heading: 'Order it once. It turns up on schedule.',
      subheading:
        '[What a subscriber can change, and how easily. Only promise what you will honour.]',
      primaryLabel: 'Start a subscription',
      primaryHref: '/products',
      secondaryLabel: 'How it works',
      secondaryHref: '/products',
      layout: 'split',
      height: 'medium',
      align: 'left',
    }),
    createSection('value-props', '1', {
      style: 'cards',
      columns: 3,
      items: [
        { icon: 'IconCalendarEvent', title: 'Skip any delivery', body: 'From the app or the email.' },
        { icon: 'IconTruck', title: '[Shipping offer]', body: '[Free over what, on which orders?]' },
        { icon: 'IconRotateClockwise', title: '[How to cancel]', body: '[Describe your cancellation policy.]' },
      ],
    }),
    createSection('featured-collection', '1', {
      heading: 'Customer favourites',
      subheading: 'Reordered more than anything else on the site.',
      limit: 8,
      columns: 4,
      showViewAll: true,
    }),
    createSection('testimonials', '1', {
      heading: 'What subscribers say',
      layout: 'grid',
      showRatings: true,
      items: [
        { quote: 'Cancelled twice, came back twice. That is my review.', author: 'Tom A.', rating: 5 },
        { quote: 'Turns up on the day it says it will, every time.', author: 'Bea C.', rating: 5 },
        { quote: 'Skipping a week takes one tap. That is rarer than it should be.', author: 'Iva L.', rating: 5 },
      ],
    }),
    createSection('faq', '1', {
      heading: 'The awkward questions',
      items: [
        { question: 'Can I cancel?', answer: '[How, and how quickly?]' },
        { question: 'What if I am away?', answer: '[Can deliveries be skipped, and are skipped weeks charged?]' },
      ],
      openFirst: true,
    }),
    createSection('collection-grid', '1', {
      heading: 'Shop by aisle',
      limit: 8,
      columns: 4,
      shape: 'square',
      showCount: true,
    }),
    createSection('newsletter', '1', {
      heading: 'News and restocks',
      body: 'One email a week: what is new, and what came back in stock.',
      buttonLabel: 'Sign me up',
      background: 'brand',
    }),
  ];
}

/**
 * Build the thumbnail payload for a preset.
 *
 * `onBrand` is resolved lazily by the customizer through `resolveTheme`; here we
 * hand over the raw inputs plus the structural cues a thumbnail needs to draw a
 * miniature of the real layout.
 *
 * @param theme - The preset's theme
 * @param onBrand - Pre-computed ink for the brand swatch
 * @returns Thumbnail data
 */
function thumbnailFor(theme: StorefrontTheme, onBrand: string): PresetDefinition['thumbnail'] {
  return {
    background: theme.brand.surface,
    surface: theme.brand.surfaceRaised,
    brand: theme.brand.color,
    onBrand,
    text: theme.brand.text,
    textMuted: theme.brand.textMuted,
    border: theme.brand.border,
    radiusPx: Math.min(RADIUS_PX[theme.shape.radius], 24),
    headingFont: theme.typography.headingFont,
    bodyFont: theme.typography.bodyFont,
    headingCase: theme.typography.headingCase,
    buttonStyle: theme.buttons.style,
    imageRatio: theme.productCard.imageRatio,
    headerLayout: theme.header.layout,
  };
}

/** The shipped presets, keyed by id. */
export const PRESETS: Record<string, PresetDefinition> = {
  studio: {
    id: 'studio',
    name: 'Studio',
    description:
      'Warm paper, an old-style serif and a lot of air. Contain-fit imagery so nothing gets cropped.',
    register: 'Craft, homeware, ceramics',
    thumbnail: thumbnailFor(studio, '#ffffff'),
    theme: studio,
    sections: studioSections(),
  },
  voltage: {
    id: 'voltage',
    name: 'Voltage',
    description:
      'Near-black ground, acid accent, square corners and tight uppercase headings. Loud on purpose.',
    register: 'Electronics, streetwear, gear',
    thumbnail: thumbnailFor(voltage, '#0d1102'),
    theme: voltage,
    sections: voltageSections(),
  },
  bloom: {
    id: 'bloom',
    name: 'Bloom',
    description:
      'Borderless rounded cards, centered product info, portrait imagery and soft-fill buttons.',
    register: 'Beauty, wellness, self-care',
    thumbnail: thumbnailFor(bloom, '#33141f'),
    theme: bloom,
    sections: bloomSections(),
  },
  depot: {
    id: 'depot',
    name: 'Depot',
    description:
      'Compact rows, hard edges, landscape spec shots and vendor names on every card. Built for scanning.',
    register: 'Parts, industrial, B2B',
    thumbnail: thumbnailFor(depot, '#ffffff'),
    theme: depot,
    sections: depotSections(),
  },
  marquee: {
    id: 'marquee',
    name: 'Marquee',
    description:
      'Oversized display type, uppercase headings, no borders and no shadows. The product is the page.',
    register: 'Apparel, footwear, editorial',
    thumbnail: thumbnailFor(marquee, '#ffffff'),
    theme: marquee,
    sections: marqueeSections(),
  },
  fresh: {
    id: 'fresh',
    name: 'Fresh',
    description:
      'Pill buttons, lifted cards, mint accent and roomy spacing. Friendly without being childish.',
    register: 'Food, supplements, subscriptions',
    thumbnail: thumbnailFor(fresh, '#03210f'),
    theme: fresh,
    sections: freshSections(),
  },
};

/** Preset ids in customizer display order. */
export const PRESET_IDS: readonly string[] = [
  'studio',
  'voltage',
  'bloom',
  'depot',
  'marquee',
  'fresh',
];

/** The presets as an array, in display order. */
export const PRESET_LIST: PresetDefinition[] = PRESET_IDS.map((id) => PRESETS[id]);

/**
 * Look up a preset by id.
 * @param id - Candidate preset id
 * @returns The preset definition, or undefined when the id is unknown
 */
export function getPreset(id: string | undefined): PresetDefinition | undefined {
  if (!id) return undefined;
  return Object.prototype.hasOwnProperty.call(PRESETS, id) ? PRESETS[id] : undefined;
}

/**
 * The home page composition a preset opens with.
 *
 * Returns a **deep copy**, so a caller that persists it and then edits a
 * section cannot mutate the shipped preset for every other store in the
 * process. An unknown id falls back to the generic starter page rather than
 * throwing: a theme row written by an older build naming a preset this build
 * has dropped must still render a shop.
 *
 * @param id - Preset id, typically `theme.preset`
 * @returns A fresh, ordered section list
 */
export function presetSections(id: string | undefined): Section[] {
  const preset = getPreset(id);
  const source = preset ? preset.sections : defaultSections();
  // Settings are JSONB by definition, so a JSON round-trip is a complete deep
  // copy here and works in every runtime this module is imported from.
  return source.map((section) => ({
    ...section,
    settings: JSON.parse(JSON.stringify(section.settings)) as Record<string, unknown>,
  }));
}

/**
 * Read one setting out of a preset's shipped composition.
 *
 * The renderer uses this to tell "the merchant wrote this" from "this is the
 * preset's placeholder still sitting where we put it" — which matters because
 * a shop's own `hero_title` is real copy the merchant typed, and it should beat
 * a preset default while losing to anything they set in the customizer.
 *
 * @param presetId - Preset id, typically `theme.preset`
 * @param type - Section type to look inside
 * @param key - Setting id
 * @returns The shipped default as a string, or an empty string
 */
export function presetSectionDefault(
  presetId: string | undefined,
  type: SectionType,
  key: string,
): string {
  const section = getPreset(presetId)?.sections.find((entry) => entry.type === type);
  const value = section?.settings[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Map a legacy `stores.theme_name` value onto a modern preset plus the brand
 * color that made the old palette recognisable (spec section 9).
 *
 * The old system was eleven color swatches; the new one is six designs. Each
 * legacy name lands on the preset whose *register* is closest, then keeps its
 * original accent so a merchant's shop does not change color overnight.
 */
export const LEGACY_THEME_MAP: Record<
  string,
  { preset: string; brandColor?: string; scheme?: 'light' | 'dark' }
> = {
  default: { preset: 'fresh', brandColor: '#1aa35c' },
  ocean: { preset: 'depot', brandColor: '#2563eb' },
  sunset: { preset: 'fresh', brandColor: '#e2620f' },
  purple: { preset: 'bloom', brandColor: '#7c3aed' },
  dark: { preset: 'voltage', brandColor: '#22c55e', scheme: 'dark' },
  rose: { preset: 'bloom', brandColor: '#e11d48' },
  teal: { preset: 'fresh', brandColor: '#0d9488' },
  amber: { preset: 'studio', brandColor: '#c07908' },
  slate: { preset: 'depot', brandColor: '#475569' },
  crimson: { preset: 'marquee', brandColor: '#c62222' },
};

/**
 * Convert a legacy theme name into a theme patch for the migration path.
 * @param legacyName - Value from `stores.theme_name`
 * @returns A partial theme to merge over the mapped preset
 */
export function themeFromLegacyName(legacyName: string | null | undefined): {
  preset: string;
  brand: { color?: string; scheme?: 'light' | 'dark' };
} {
  const mapping =
    (legacyName && LEGACY_THEME_MAP[legacyName]) || LEGACY_THEME_MAP.default;
  return {
    preset: mapping.preset,
    brand: {
      ...(mapping.brandColor ? { color: mapping.brandColor } : {}),
      ...(mapping.scheme ? { scheme: mapping.scheme } : {}),
    },
  };
}
