/**
 * Page template tests.
 *
 * These exist because of a real defect caught during development: two templates
 * shipped settings that looked plausible and were not in the registry —
 * `hero.layout: 'centered'` (the real options are split / overlay / text-only)
 * and `rich-text.width: 'default'` (narrow / full). Both typecheck cleanly,
 * because section settings are `Record<string, unknown>` by design, and both
 * would have rendered a section silently falling back to a default the merchant
 * did not choose.
 *
 * So the load-bearing test here is the one that validates every setting in
 * every template against the section registry's own settings schema. It is the
 * only thing standing between a typo and a wrong-looking page.
 */

import {
  PAGE_TEMPLATES,
  PAGE_TEMPLATE_IDS,
  PAGE_TEMPLATE_LIST,
  getPageTemplate,
  pageTemplateSections,
} from '../page-templates';
import { isUsablePageSlug } from '../pages';
import { SECTION_REGISTRY, normalizeSections } from '../sections';
import { sectionsSchema, type SectionType } from '../types';

describe('page template registry', () => {
  it('lists every template exactly once, in picker order', () => {
    expect(new Set(PAGE_TEMPLATE_IDS).size).toBe(PAGE_TEMPLATE_IDS.length);
    expect(PAGE_TEMPLATE_IDS.slice().sort()).toEqual(Object.keys(PAGE_TEMPLATES).sort());
    expect(PAGE_TEMPLATE_LIST.map((template) => template.id)).toEqual([...PAGE_TEMPLATE_IDS]);
  });

  it('leads with the pages a shop cannot trade without', () => {
    // Essentials first is not cosmetic: the picker is ordered, and a merchant
    // who stops reading after three rows must have seen About, Shipping &
    // returns and Contact.
    const groups = PAGE_TEMPLATE_LIST.map((template) => template.group);
    const lastEssential = groups.lastIndexOf('essential');
    const firstGrowth = groups.indexOf('growth');
    expect(lastEssential).toBeLessThan(firstGrowth);
    expect(PAGE_TEMPLATE_LIST.filter((t) => t.group === 'essential').map((t) => t.id)).toEqual([
      'about',
      'shipping-returns',
      'contact',
    ]);
  });

  it('gives every template a title, a description, an icon and a usable slug', () => {
    for (const template of PAGE_TEMPLATE_LIST) {
      expect(template.title.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(20);
      expect(template.icon).toMatch(/^Icon[A-Z]/);
      expect(isUsablePageSlug(template.slug)).toBe(true);
    }
  });

  it('omits `build` from the serialised list', () => {
    // The list is JSON-encoded into the admin API response, and a function does
    // not survive JSON.stringify — it would vanish from the payload and leave
    // the picker offering templates it could not instantiate.
    for (const template of PAGE_TEMPLATE_LIST) {
      expect(template).not.toHaveProperty('build');
    }
    expect(JSON.parse(JSON.stringify(PAGE_TEMPLATE_LIST))).toHaveLength(PAGE_TEMPLATE_IDS.length);
  });

  it('proposes slugs that do not collide with each other', () => {
    const slugs = PAGE_TEMPLATE_LIST.map((template) => template.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe('page template compositions', () => {
  it('every setting exists in the section registry, with a valid value', () => {
    for (const id of PAGE_TEMPLATE_IDS) {
      const sections = pageTemplateSections(id);

      for (const section of sections) {
        const definition = SECTION_REGISTRY[section.type as SectionType];
        expect(definition).toBeDefined();

        for (const [key, value] of Object.entries(section.settings)) {
          const field = definition.settingsSchema.find((entry) => entry.id === key);
          // A setting the registry does not define is a typo that renders nothing.
          expect(`${id}/${section.type}: ${key}`).toBe(
            field ? `${id}/${section.type}: ${key}` : `${id}/${section.type}: <unknown setting>`,
          );
          if (!field) continue;

          // A select carrying a value outside its options silently falls back
          // to a default the merchant never chose. This is the exact defect
          // this file was written for.
          if (field.type === 'select' && field.options) {
            const allowed = field.options.map((option) => option.value);
            expect(`${id}/${section.type}/${key}=${String(value)}`).toBe(
              allowed.includes(String(value))
                ? `${id}/${section.type}/${key}=${String(value)}`
                : `${id}/${section.type}/${key}=<one of ${allowed.join('|')}>`,
            );
          }

          if (field.type === 'range' && typeof value === 'number') {
            if (field.min !== undefined) expect(value).toBeGreaterThanOrEqual(field.min);
            if (field.max !== undefined) expect(value).toBeLessThanOrEqual(field.max);
          }

          if (field.type === 'toggle') expect(typeof value).toBe('boolean');
        }
      }
    }
  });

  it('produces section lists the save API would accept', () => {
    for (const id of PAGE_TEMPLATE_IDS) {
      const sections = pageTemplateSections(id);
      const parsed = sectionsSchema.safeParse(sections);
      expect(`${id}: ${parsed.success ? 'valid' : JSON.stringify(parsed.error.issues)}`).toBe(
        `${id}: valid`,
      );

      // And survive the same normalisation the route applies, unchanged.
      const { sections: normalized, problems } = normalizeSections(sections);
      expect(problems).toEqual([]);
      expect(normalized).toHaveLength(sections.length);
    }
  });

  it('gives every template unique section ids', () => {
    for (const id of PAGE_TEMPLATE_IDS) {
      const ids = pageTemplateSections(id).map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('returns a fresh copy on every call, so two pages never share settings', () => {
    const first = pageTemplateSections('about');
    const second = pageTemplateSections('about');
    expect(first).toEqual(second);

    (first[0].settings as Record<string, unknown>).heading = 'edited';
    expect(second[0].settings.heading).not.toBe('edited');
  });

  it('builds a non-trivial page for everything except the blank template', () => {
    for (const id of PAGE_TEMPLATE_IDS) {
      const sections = pageTemplateSections(id);
      if (id === 'blank') expect(sections).toHaveLength(0);
      else expect(sections.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('states commitments as visible prompts rather than as invented policy', () => {
    // The rule from the module header: a template may not ship copy that reads
    // like a finished promise. A merchant in a hurry publishes unread, and a
    // returns window nobody agreed to is a term of sale a customer can hold
    // them to. Anything that would commit them must be a bracketed prompt.
    const commitments = /\b(\d+)[- ]day\b|\bfree (shipping|returns)\b|\bnext[- ]day\b|\bsame[- ]day\b/i;

    for (const id of PAGE_TEMPLATE_IDS) {
      for (const section of pageTemplateSections(id)) {
        const copy = JSON.stringify(section.settings);
        // Strip the bracketed prompts, which are allowed to mention anything
        // precisely because they are visibly unfinished.
        const outsidePrompts = copy.replace(/\[[^\]]*\]/g, '');
        expect(`${id}/${section.id}: ${commitments.test(outsidePrompts) ? outsidePrompts : 'no invented commitments'}`)
          .toBe(`${id}/${section.id}: no invented commitments`);
      }
    }
  });
});

describe('getPageTemplate', () => {
  it('resolves a known id and refuses an unknown one', () => {
    expect(getPageTemplate('about')?.id).toBe('about');
    expect(getPageTemplate('nope')).toBeUndefined();
    expect(getPageTemplate(undefined)).toBeUndefined();
  });

  it('does not resolve inherited Object properties', () => {
    expect(getPageTemplate('constructor')).toBeUndefined();
    expect(getPageTemplate('toString')).toBeUndefined();
    expect(pageTemplateSections('constructor')).toEqual([]);
  });
});
