/**
 * Turn a page a language model proposed into a legal section composition.
 *
 * The AI site builder asks a model to design a home page from a merchant's
 * prompt, and a model's output cannot be trusted to be renderable. It invents
 * section types this renderer does not have, settings that are not in the
 * schema, `hero.layout: 'centered'` for a layout that does not exist, an essay
 * where a headline goes, and — occasionally — a `javascript:` URL in an image
 * field. `Section['settings']` is `Record<string, unknown>`, so nothing in the
 * type system catches any of it.
 *
 * This module is the boundary. It maps whatever the model returned onto the
 * section registry, drops types that are not real, runs every setting through
 * {@link coerceSectionSettings}, and clamps the whole thing to one page's worth
 * of sections. What comes out is guaranteed to satisfy the same contract a
 * hand-built page does, so it can be saved as a draft and rendered without a
 * chance of a malformed value reaching the storefront.
 *
 * It is deliberately model-agnostic and side-effect-free: it takes plain data
 * and returns plain data, so it is unit-testable without a network call and is
 * the single place the "trust the model's shape" decision is made.
 */

import { coerceSectionSettings, createSection, SECTION_REGISTRY } from './sections';
import type { Section, SectionType } from './types';
import { SECTION_TYPES } from './types';

/** The most sections one composed page may carry, before per-type caps. */
export const MAX_COMPOSED_SECTIONS = 12;

/** One section as a model is asked to return it: a type and free-form settings. */
export interface ProposedSection {
  type: string;
  settings?: Record<string, unknown>;
  /** A model may propose disabling a section rather than omitting it. */
  enabled?: boolean;
}

/**
 * The section types the composer offers a model, with a one-line purpose each.
 *
 * Kept here rather than derived from the registry's own descriptions because
 * the guidance a model needs ("lead with this", "use once") is not the guidance
 * a merchant editing the section needs.
 */
export const COMPOSER_SECTION_GUIDE: Record<SectionType, string> = {
  hero: 'The opening banner. Lead with one. Headline, supporting line, a button to /products.',
  'featured-collection': 'A row of products — best sellers or a named collection.',
  'collection-grid': 'Tiles linking to categories, for "shop by type".',
  'rich-text': 'A block of prose — a story, a promise, an announcement.',
  'image-with-text': 'One image beside a paragraph. Good for "who we are".',
  'value-props': 'Three or four short icon + title + line reassurances.',
  testimonials: 'Customer quotes.',
  faq: 'Question-and-answer pairs.',
  newsletter: 'An email sign-up band.',
  'blog-posts': 'A strip of recent blog posts.',
  'logo-bar': 'A row of partner or press logos.',
  countdown: 'A timer for a sale or a launch. Use sparingly.',
};

/**
 * Whether a value names a section type this renderer supports.
 * @param value - Candidate type
 * @returns True when it is a known section type
 */
function isKnownType(value: unknown): value is SectionType {
  return typeof value === 'string' && (SECTION_TYPES as readonly string[]).includes(value);
}

/** One problem found while composing, phrased for a merchant to read. */
export interface ComposeProblem {
  message: string;
}

/**
 * Build a legal section list from a model's proposed page.
 *
 * Unknown types are dropped (a model cannot add a section this renderer cannot
 * draw), settings are coerced per {@link coerceSectionSettings}, per-type
 * instance caps from the registry are honoured, and the whole list is clamped to
 * {@link MAX_COMPOSED_SECTIONS}. When nothing survives, a single hero is
 * returned so the merchant is never handed a blank page.
 *
 * @param proposed - The sections the model returned, in order
 * @returns The validated sections and a human-readable list of what was changed
 */
export function composeSections(proposed: unknown): {
  sections: Section[];
  problems: ComposeProblem[];
} {
  const problems: ComposeProblem[] = [];
  const list = Array.isArray(proposed) ? proposed : [];
  if (!Array.isArray(proposed)) {
    problems.push({ message: 'The generated page was not a list of sections; started from a hero.' });
  }

  const counts = new Map<SectionType, number>();
  const sections: Section[] = [];

  for (const [index, raw] of list.entries()) {
    if (sections.length >= MAX_COMPOSED_SECTIONS) {
      problems.push({ message: `Kept the first ${MAX_COMPOSED_SECTIONS} sections and dropped the rest.` });
      break;
    }
    if (typeof raw !== 'object' || raw === null) {
      problems.push({ message: `Skipped section ${index + 1}: it was not an object.` });
      continue;
    }

    const candidate = raw as ProposedSection;
    if (!isKnownType(candidate.type)) {
      problems.push({
        message: `Skipped an unsupported section type "${String(candidate.type)}".`,
      });
      continue;
    }

    const definition = SECTION_REGISTRY[candidate.type];
    const used = counts.get(candidate.type) ?? 0;
    if (used >= definition.maxPerPage) {
      problems.push({
        message: `Dropped an extra "${definition.label}" — the limit is ${definition.maxPerPage} per page.`,
      });
      continue;
    }

    const { settings, problems: settingProblems } = coerceSectionSettings(
      candidate.type,
      candidate.settings,
    );
    for (const message of settingProblems) problems.push({ message });

    counts.set(candidate.type, used + 1);
    const section = createSection(candidate.type, String(index + 1), settings);
    if (candidate.enabled === false) section.enabled = false;
    sections.push(section);
  }

  if (sections.length === 0) {
    problems.push({ message: 'Nothing usable was generated; started you off with a hero.' });
    sections.push(createSection('hero', '1'));
  }

  return { sections, problems };
}
