/**
 * AI page-composer validation tests.
 *
 * `composeSections` is the trust boundary between a language model's proposed
 * page and the storefront. A model produces exactly the shapes that are illegal
 * here — invented section types, settings not in the schema, a `javascript:`
 * image, an out-of-enum select — so these tests are specific about what it
 * turns those into: a renderable page that satisfies the section contract, plus
 * an honest list of what it changed.
 */

import { composeSections, MAX_COMPOSED_SECTIONS } from '../compose';
import { SECTION_REGISTRY } from '../sections';
import { isSectionType } from '../sections';

describe('composeSections', () => {
  it('accepts a well-formed page and reports nothing', () => {
    const { sections, problems } = composeSections([
      { type: 'hero', settings: { heading: 'Fresh bread, daily', layout: 'overlay' } },
      { type: 'featured-collection', settings: { heading: 'Today’s bakes', limit: 6 } },
    ]);
    expect(problems).toEqual([]);
    expect(sections).toHaveLength(2);
    expect(sections[0].type).toBe('hero');
    expect(sections[0].settings.heading).toBe('Fresh bread, daily');
    expect(sections[1].settings.limit).toBe(6);
  });

  it('every composed section satisfies the registry contract', () => {
    const { sections } = composeSections([
      { type: 'hero', settings: { layout: 'centered' } }, // illegal layout
      { type: 'value-props', settings: {} },
    ]);
    for (const section of sections) {
      expect(isSectionType(section.type)).toBe(true);
      // Re-coercing a composed section must be a no-op: it is already legal.
      const declared = new Set(
        SECTION_REGISTRY[section.type].settingsSchema.map((field) => field.id),
      );
      for (const key of Object.keys(section.settings)) expect(declared.has(key)).toBe(true);
    }
  });

  it('drops an unsupported section type and says so', () => {
    const { sections, problems } = composeSections([
      { type: 'parallax-video-wall', settings: {} },
      { type: 'hero', settings: {} },
    ]);
    expect(sections.map((section) => section.type)).toEqual(['hero']);
    expect(problems.some((problem) => /unsupported section type/.test(problem.message))).toBe(true);
  });

  it('resets an out-of-enum setting rather than passing it through', () => {
    const { sections, problems } = composeSections([{ type: 'hero', settings: { layout: 'centered' } }]);
    expect(sections[0].settings.layout).toBe(SECTION_REGISTRY.hero.defaultSettings.layout);
    expect(problems.length).toBeGreaterThan(0);
  });

  it('refuses a javascript: image the model tried to place', () => {
    const { sections } = composeSections([{ type: 'hero', settings: { image: 'javascript:alert(1)' } }]);
    expect(sections[0].settings.image).toBe('');
  });

  it('honours per-type instance caps', () => {
    const heroCap = SECTION_REGISTRY.hero.maxPerPage;
    const { sections, problems } = composeSections(
      Array.from({ length: heroCap + 2 }, () => ({ type: 'hero', settings: {} })),
    );
    expect(sections.filter((section) => section.type === 'hero')).toHaveLength(heroCap);
    expect(problems.some((problem) => /limit is/.test(problem.message))).toBe(true);
  });

  it('clamps a runaway page to one screen of sections', () => {
    const many = Array.from({ length: MAX_COMPOSED_SECTIONS + 8 }, (_, index) => ({
      type: index % 2 === 0 ? 'rich-text' : 'value-props',
      settings: {},
    }));
    const { sections } = composeSections(many);
    expect(sections.length).toBeLessThanOrEqual(MAX_COMPOSED_SECTIONS);
  });

  it('never hands back a blank page', () => {
    for (const input of [[], null, undefined, 'not a list', [{ type: 'nope' }]]) {
      const { sections } = composeSections(input);
      expect(sections.length).toBeGreaterThan(0);
    }
  });

  it('assigns unique ids so the customizer can key on them', () => {
    const { sections } = composeSections([
      { type: 'rich-text', settings: {} },
      { type: 'rich-text', settings: {} },
    ]);
    const ids = sections.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries an explicit disabled flag through', () => {
    const { sections } = composeSections([{ type: 'newsletter', settings: {}, enabled: false }]);
    expect(sections[0].enabled).toBe(false);
  });
});
