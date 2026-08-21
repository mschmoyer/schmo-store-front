/**
 * Starter compositions for the pages every shop needs and nobody enjoys
 * building.
 *
 * A merchant opening a blank page editor has to decide what a Shipping &
 * Returns page even contains before they can write one, and that blank-page
 * moment is where storefronts stall. Each template here is an ordered
 * `Section[]` — the same shape the home page uses — pre-filled with the
 * *structure* of a good version of that page.
 *
 * **The copy is scaffolding, not content, and it says so on the page.**
 *
 * This is the load-bearing decision in this file. It would be easy to ship a
 * returns policy that reads like a finished returns policy, and a merchant in a
 * hurry would publish it unread. They would then be advertising a 30-day window
 * they never agreed to, in a jurisdiction nobody checked, as a term of sale a
 * customer can hold them to. The platform does not know the merchant's
 * carriers, their restocking terms, their statutory obligations, or their
 * address.
 *
 * So every placeholder that states a *commitment* is written as a visible
 * bracketed prompt — `[How many days do customers have to return an item?]` —
 * which is obviously unfinished on the rendered page and in the editor. Copy
 * that is purely structural ("Returns", "How to start a return") is written
 * normally, because a heading commits nobody to anything. The same reasoning
 * kept the announcement bar empty in `presets.ts`: sample copy inside a section
 * is a starting point a merchant will edit, but a promise made on their behalf
 * is a promise they have to honour.
 */

import { createSection } from './sections';
import type { Section } from './types';

/** A page a merchant can create pre-composed rather than blank. */
export interface PageTemplate {
  id: string;
  /** Page title, also the default `<h1>`. */
  title: string;
  /** Proposed URL slug. The merchant may change it before creating. */
  slug: string;
  /** One-line description of what the page is for, shown in the picker. */
  description: string;
  /** `@tabler/icons-react` export name. */
  icon: string;
  /**
   * Grouping for the picker. `essential` pages are the ones a shop is expected
   * to have before it takes money; `growth` pages are optional.
   */
  group: 'essential' | 'growth';
  /** The starter composition. */
  build: () => Section[];
}

/* ------------------------------------------------------------------ *
 * Essential pages
 * ------------------------------------------------------------------ */

/**
 * About — the page that turns a catalogue into a shop somebody trusts.
 * @returns The starter composition
 */
function aboutSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: 'About us',
      heading: '[One line on who you are]',
      subheading: '[What you sell, who you make it for, and why you started.]',
      primaryLabel: 'Shop all',
      primaryHref: '/products',
      secondaryLabel: '',
      secondaryHref: '',
      layout: 'text-only',
      height: 'small',
      align: 'center',
    }),
    createSection('image-with-text', '1', {
      heading: '[How it started]',
      body: '[The short version of your story. Two or three sentences is plenty — people are reading this to decide whether to buy from you, not for a biography.]',
      imageSide: 'left',
      imageRatio: 'landscape',
      ctaLabel: '',
      ctaHref: '',
    }),
    createSection('value-props', '1', {
      style: 'cards',
      columns: 3,
      items: [
        { icon: 'IconHeart', title: '[What you stand for]', body: '[One sentence.]' },
        { icon: 'IconLeaf', title: '[How you make it]', body: '[One sentence.]' },
        { icon: 'IconUsers', title: '[Who you make it with]', body: '[One sentence.]' },
      ],
    }),
    createSection('rich-text', '1', {
      heading: '[Where we are today]',
      body: '<p>[Anything that did not fit above — your team, your workshop, what is next.]</p>',
      align: 'left',
      width: 'narrow',
    }),
  ];
}

/**
 * Shipping & Returns — required reading for shoppers, and Stripe asks for the
 * URL during Connect onboarding.
 * @returns The starter composition
 */
function shippingReturnsSections(): Section[] {
  return [
    createSection('rich-text', '1', {
      heading: 'Shipping & returns',
      body: '<p>[Replace every bracketed prompt below before publishing. These are the questions shoppers ask, not answers — the answers are yours and this page becomes a term of sale once it is live.]</p>',
      align: 'left',
      width: 'narrow',
    }),
    createSection('faq', '1', {
      heading: 'Shipping',
      items: [
        {
          question: 'When will my order be dispatched?',
          answer: '[How long between an order being placed and leaving you? State it in business days.]',
        },
        {
          question: 'How long does delivery take?',
          answer: '[Delivery times per service you offer, and whether they are estimates or guarantees.]',
        },
        {
          question: 'What does shipping cost?',
          answer: '[Your rates, and any free-shipping threshold. Say which currency.]',
        },
        {
          question: 'Where do you ship to?',
          answer: '[Countries or regions. Note who pays import duty if you ship internationally.]',
        },
      ],
      openFirst: true,
    }),
    createSection('faq', '2', {
      heading: 'Returns',
      items: [
        {
          question: 'How long do I have to return something?',
          answer: '[How many days from delivery? Check the statutory minimum where your customers are — in several markets it is set by law, not by you.]',
        },
        {
          question: 'What condition does it need to be in?',
          answer: '[Unused, tags attached, original packaging — whatever you actually require.]',
        },
        {
          question: 'Who pays return postage?',
          answer: '[You or the customer, and whether that changes for a faulty item. In many places a faulty item must be returned at your cost.]',
        },
        {
          question: 'How do I start a return?',
          answer: '[The exact steps, and the email address or form to use.]',
        },
        {
          question: 'When will I be refunded?',
          answer: '[How long after you receive the item, and to which payment method.]',
        },
      ],
      openFirst: false,
    }),
    createSection('rich-text', '2', {
      heading: 'Still need help?',
      body: '<p>[Your support email address, and the hours somebody is reading it.]</p>',
      align: 'left',
      width: 'narrow',
    }),
  ];
}

/**
 * Contact — the page that stops support email going to a form nobody built.
 * @returns The starter composition
 */
function contactSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: '',
      heading: 'Get in touch',
      subheading: '[Which questions you answer here, and how quickly.]',
      primaryLabel: '',
      primaryHref: '',
      secondaryLabel: '',
      secondaryHref: '',
      layout: 'text-only',
      height: 'small',
      align: 'center',
    }),
    createSection('value-props', '1', {
      style: 'cards',
      columns: 3,
      items: [
        { icon: 'IconMail', title: 'Email', body: '[your@address.com — and your usual reply time.]' },
        { icon: 'IconPhone', title: 'Phone', body: '[Number, and the hours it is answered.]' },
        { icon: 'IconMapPin', title: 'Find us', body: '[Address, or "online only".]' },
      ],
    }),
    createSection('faq', '1', {
      heading: 'Before you write',
      items: [
        {
          question: 'Where is my order?',
          answer: '[Point people at their dispatch email and tracking link — this is the question you will get most.]',
        },
        {
          question: 'Can I change or cancel an order?',
          answer: '[Up to what point, and how.]',
        },
      ],
      openFirst: true,
    }),
  ];
}

/* ------------------------------------------------------------------ *
 * Growth pages
 * ------------------------------------------------------------------ */

/**
 * FAQ — a standalone page for shops whose home page FAQ has outgrown itself.
 * @returns The starter composition
 */
function faqSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: '',
      heading: 'Questions & answers',
      subheading: '[The things people ask before they buy.]',
      primaryLabel: '',
      primaryHref: '',
      secondaryLabel: '',
      secondaryHref: '',
      layout: 'text-only',
      height: 'small',
      align: 'center',
    }),
    createSection('faq', '1', {
      heading: 'Ordering',
      items: [
        { question: '[A question you are asked weekly]', answer: '[Your answer.]' },
        { question: '[Another one]', answer: '[Your answer.]' },
      ],
      openFirst: true,
    }),
    createSection('faq', '2', {
      heading: 'The products',
      items: [
        { question: '[Sizing, materials, compatibility — whatever applies to you]', answer: '[Your answer.]' },
      ],
      openFirst: false,
    }),
    createSection('newsletter', '1', {
      heading: 'Did not find it?',
      body: '[Tell people how to reach you, or drop this section.]',
      buttonLabel: 'Subscribe',
      background: 'surface',
    }),
  ];
}

/**
 * A landing page for one campaign, drop or collection.
 * @returns The starter composition
 */
function landingSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: '[Campaign name]',
      heading: '[The offer, in one line]',
      subheading: '[What it is, who it is for, and when it ends.]',
      primaryLabel: 'Shop the drop',
      primaryHref: '/products',
      secondaryLabel: '',
      secondaryHref: '',
      layout: 'overlay',
      height: 'large',
      align: 'center',
      overlayOpacity: 35,
    }),
    createSection('featured-collection', '1', {
      heading: '[What is in it]',
      subheading: '',
      limit: 8,
      columns: 4,
      showViewAll: true,
    }),
    createSection('image-with-text', '1', {
      heading: '[Why this one is worth it]',
      body: '[The argument. One paragraph.]',
      imageSide: 'right',
      imageRatio: 'landscape',
      ctaLabel: 'Shop now',
      ctaHref: '/products',
    }),
    createSection('testimonials', '1', {
      heading: '[What people said last time]',
      layout: 'grid',
      showRatings: true,
      items: [
        { quote: '[A real quote from a real customer.]', author: '[Name]', rating: 5 },
        { quote: '[Another real one.]', author: '[Name]', rating: 5 },
      ],
    }),
    createSection('countdown', '1', {
      heading: '[Ends soon]',
      ctaLabel: 'Shop the drop',
      ctaHref: '/products',
      hideWhenExpired: true,
    }),
  ];
}

/**
 * Size guide — apparel and footwear cannot launch without one, and it is the
 * single highest-leverage page for cutting returns.
 * @returns The starter composition
 */
function sizeGuideSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: '',
      heading: 'Size guide',
      subheading: '[How to measure, and what to do if you are between sizes.]',
      primaryLabel: '',
      primaryHref: '',
      secondaryLabel: '',
      secondaryHref: '',
      layout: 'text-only',
      height: 'small',
      align: 'center',
    }),
    createSection('rich-text', '1', {
      heading: 'How to measure',
      body: '<p>[Where to put the tape for each measurement you list below. A sentence each.]</p>',
      align: 'left',
      width: 'narrow',
    }),
    createSection('rich-text', '2', {
      heading: 'Measurements',
      // A real table, because this is the one page where a table is the content.
      body:
        '<table><thead><tr><th>Size</th><th>Chest</th><th>Waist</th><th>Length</th></tr></thead>' +
        '<tbody>' +
        '<tr><td>XS</td><td>[in / cm]</td><td>[in / cm]</td><td>[in / cm]</td></tr>' +
        '<tr><td>S</td><td>[in / cm]</td><td>[in / cm]</td><td>[in / cm]</td></tr>' +
        '<tr><td>M</td><td>[in / cm]</td><td>[in / cm]</td><td>[in / cm]</td></tr>' +
        '<tr><td>L</td><td>[in / cm]</td><td>[in / cm]</td><td>[in / cm]</td></tr>' +
        '<tr><td>XL</td><td>[in / cm]</td><td>[in / cm]</td><td>[in / cm]</td></tr>' +
        '</tbody></table>',
      align: 'left',
      width: 'full',
    }),
    createSection('faq', '1', {
      heading: 'Fit questions',
      items: [
        { question: 'I am between sizes — which should I take?', answer: '[Size up or size down, and for which items.]' },
        { question: 'Does it shrink?', answer: '[Washing and care, and whether the measurements are pre- or post-wash.]' },
        { question: 'What if it does not fit?', answer: '[Link your returns page and say how exchanges work.]' },
      ],
      openFirst: true,
    }),
  ];
}

/**
 * Wholesale / trade — for shops that sell to businesses as well as people.
 * @returns The starter composition
 */
function wholesaleSections(): Section[] {
  return [
    createSection('hero', '1', {
      eyebrow: 'Trade',
      heading: '[Stock us]',
      subheading: '[Who you sell to wholesale, and what you are looking for in a stockist.]',
      primaryLabel: 'Apply for an account',
      primaryHref: '/pages/contact',
      secondaryLabel: '',
      secondaryHref: '',
      layout: 'split',
      height: 'medium',
      align: 'left',
    }),
    createSection('value-props', '1', {
      style: 'cards',
      columns: 3,
      items: [
        { icon: 'IconReceipt', title: 'Minimum order', body: '[Your opening order minimum and reorder minimum.]' },
        { icon: 'IconPackages', title: 'Lead time', body: '[How long from order to dispatch.]' },
        { icon: 'IconCertificate', title: 'Terms', body: '[Payment terms you offer, and to whom.]' },
      ],
    }),
    createSection('faq', '1', {
      heading: 'How it works',
      items: [
        { question: 'How do I open an account?', answer: '[The steps, and what you need from them.]' },
        { question: 'Do you offer exclusivity?', answer: '[Your policy on territory.]' },
        { question: 'Can I see the line sheet?', answer: '[How to get it.]' },
      ],
      openFirst: true,
    }),
  ];
}

/* ------------------------------------------------------------------ *
 * Registry
 * ------------------------------------------------------------------ */

/** Every starter page, in picker order. */
export const PAGE_TEMPLATES: Record<string, PageTemplate> = {
  about: {
    id: 'about',
    title: 'About us',
    slug: 'about',
    description: 'Your story, what you stand for, and why someone should buy from you rather than anyone else.',
    icon: 'IconBuildingStore',
    group: 'essential',
    build: aboutSections,
  },
  'shipping-returns': {
    id: 'shipping-returns',
    title: 'Shipping & returns',
    slug: 'shipping-returns',
    description: 'Dispatch times, delivery costs and your returns window. Stripe asks for this URL, and shoppers look for it before they buy.',
    icon: 'IconTruckReturn',
    group: 'essential',
    build: shippingReturnsSections,
  },
  contact: {
    id: 'contact',
    title: 'Contact',
    slug: 'contact',
    description: 'How to reach you, when you reply, and the two questions you can answer before anybody writes in.',
    icon: 'IconMail',
    group: 'essential',
    build: contactSections,
  },
  faq: {
    id: 'faq',
    title: 'FAQ',
    slug: 'faq',
    description: 'A page for the questions that keep arriving, once your home page FAQ has outgrown itself.',
    icon: 'IconHelpCircle',
    group: 'growth',
    build: faqSections,
  },
  'size-guide': {
    id: 'size-guide',
    title: 'Size guide',
    slug: 'size-guide',
    description: 'Measurements, how to take them, and what to do between sizes. The cheapest way to cut returns on apparel.',
    icon: 'IconRuler2',
    group: 'growth',
    build: sizeGuideSections,
  },
  landing: {
    id: 'landing',
    title: 'Campaign landing page',
    slug: 'new-drop',
    description: 'One page for one drop, sale or collaboration — hero, the products, the argument, and a deadline.',
    icon: 'IconRocket',
    group: 'growth',
    build: landingSections,
  },
  wholesale: {
    id: 'wholesale',
    title: 'Wholesale',
    slug: 'wholesale',
    description: 'Minimums, lead times and terms for shops that want to stock you.',
    icon: 'IconBuildingWarehouse',
    group: 'growth',
    build: wholesaleSections,
  },
  blank: {
    id: 'blank',
    title: 'Untitled page',
    slug: 'new-page',
    description: 'Start from nothing and add your own sections.',
    icon: 'IconFile',
    group: 'growth',
    build: () => [],
  },
};

/** Template ids in picker order — essentials first. */
export const PAGE_TEMPLATE_IDS: readonly string[] = [
  'about',
  'shipping-returns',
  'contact',
  'faq',
  'size-guide',
  'landing',
  'wholesale',
  'blank',
];

/**
 * The templates as an array, in picker order.
 *
 * `build` is deliberately **not** included: this list is serialised into the
 * admin API response, and a function does not survive `JSON.stringify` — it
 * would silently vanish from the payload and leave the picker rendering
 * templates it could not instantiate.
 */
export const PAGE_TEMPLATE_LIST: Omit<PageTemplate, 'build'>[] = PAGE_TEMPLATE_IDS.map((id) => {
  const { id: templateId, title, slug, description, icon, group } = PAGE_TEMPLATES[id];
  return { id: templateId, title, slug, description, icon, group };
});

/**
 * Build a template's starter composition.
 *
 * Each call runs `build()` afresh, so two pages created from one template never
 * share a settings object — the same deep-copy guarantee `presetSections` gives
 * for home pages, achieved by construction rather than by cloning.
 *
 * @param id - Template id
 * @returns A fresh section list, or an empty page for an unknown id
 */
export function pageTemplateSections(id: string | undefined): Section[] {
  if (!id) return [];
  const template = Object.prototype.hasOwnProperty.call(PAGE_TEMPLATES, id)
    ? PAGE_TEMPLATES[id]
    : undefined;
  return template ? template.build() : [];
}

/**
 * Look up a template by id.
 * @param id - Candidate template id
 * @returns The template, or undefined when the id is unknown
 */
export function getPageTemplate(id: string | undefined): PageTemplate | undefined {
  if (!id) return undefined;
  return Object.prototype.hasOwnProperty.call(PAGE_TEMPLATES, id) ? PAGE_TEMPLATES[id] : undefined;
}
