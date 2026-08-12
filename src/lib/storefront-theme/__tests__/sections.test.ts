/**
 * Section registry tests.
 *
 * The registry is what lets the customizer build its editing UI generically, so
 * the schema shape matters as much as the data.
 */

import {
  SECTION_LIST,
  SECTION_REGISTRY,
  createSection,
  defaultSections,
  getSectionDefinition,
  isSectionType,
  normalizeSections,
} from '../sections';
import { SECTION_TYPES, SETTING_FIELD_TYPES, sectionsSchema } from '../types';

describe('registry completeness', () => {
  it('covers every section type in the contract', () => {
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual([...SECTION_TYPES].sort());
    expect(SECTION_LIST).toHaveLength(SECTION_TYPES.length);
  });

  it('gives every type a label, icon, description and instance cap', () => {
    for (const definition of SECTION_LIST) {
      expect(definition.label.length).toBeGreaterThan(0);
      expect(definition.icon).toMatch(/^Icon[A-Za-z0-9]+$/);
      expect(definition.description.length).toBeGreaterThan(20);
      expect(definition.maxPerPage).toBeGreaterThanOrEqual(1);
    }
  });

  it('gives every type a non-empty settings schema using known control types', () => {
    for (const definition of SECTION_LIST) {
      expect(definition.settingsSchema.length).toBeGreaterThan(0);
      for (const field of definition.settingsSchema) {
        expect(field.id).toMatch(/^[a-zA-Z][a-zA-Z0-9]*$/);
        expect(field.label.length).toBeGreaterThan(0);
        expect(SETTING_FIELD_TYPES).toContain(field.type);
        if (field.type === 'select') {
          expect(field.options?.length ?? 0).toBeGreaterThan(1);
        }
        if (field.type === 'range') {
          expect(typeof field.min).toBe('number');
          expect(typeof field.max).toBe('number');
        }
      }
    }
  });

  it('keeps defaultSettings in step with the settings schema', () => {
    for (const definition of SECTION_LIST) {
      const schemaIds = definition.settingsSchema.map((f) => f.id).sort();
      expect(Object.keys(definition.defaultSettings).sort()).toEqual(schemaIds);
      for (const field of definition.settingsSchema) {
        expect(definition.defaultSettings[field.id]).toEqual(field.default);
      }
    }
  });

  it('uses unique field ids within a section', () => {
    for (const definition of SECTION_LIST) {
      const ids = definition.settingsSchema.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe('lookup helpers', () => {
  it('finds known types and rejects unknown ones', () => {
    expect(getSectionDefinition('hero')?.type).toBe('hero');
    expect(getSectionDefinition('not-a-section')).toBeUndefined();
    expect(isSectionType('faq')).toBe(true);
    expect(isSectionType('faq2')).toBe(false);
    expect(isSectionType(42)).toBe(false);
  });

  it('does not treat inherited object properties as section types', () => {
    expect(isSectionType('toString')).toBe(false);
    expect(isSectionType('constructor')).toBe(false);
    expect(getSectionDefinition('__proto__')).toBeUndefined();
  });
});

describe('createSection', () => {
  it('applies defaults and merges overrides', () => {
    const section = createSection('hero', '1', { heading: 'Hello' });
    expect(section.id).toBe('hero-1');
    expect(section.enabled).toBe(true);
    expect(section.settings.heading).toBe('Hello');
    expect(section.settings.layout).toBe(SECTION_REGISTRY.hero.defaultSettings.layout);
  });
});

describe('defaultSections', () => {
  const sections = defaultSections();

  it('is deterministic', () => {
    expect(defaultSections()).toEqual(defaultSections());
  });

  it('validates against the wire schema', () => {
    const result = sectionsSchema.safeParse(sections);
    expect(result.success ? 'ok' : JSON.stringify(result.error.issues)).toBe('ok');
  });

  it('is a complete, good-looking home page out of the box', () => {
    const types = sections.map((s) => s.type);
    expect(types).toContain('hero');
    expect(types).toContain('featured-collection');
    expect(types).toContain('newsletter');
    expect(sections.length).toBeGreaterThanOrEqual(5);
  });

  it('ships every section enabled with real copy, not placeholders', () => {
    for (const section of sections) {
      expect(section.enabled).toBe(true);
      const heading = section.settings.heading;
      if (typeof heading === 'string' && heading.length > 0) {
        expect(heading.toLowerCase()).not.toContain('lorem');
        expect(heading).not.toMatch(/^(TODO|TBD|placeholder)/i);
      }
    }
  });

  it('respects every per-type instance cap', () => {
    const counts = new Map<string, number>();
    for (const section of sections) {
      counts.set(section.type, (counts.get(section.type) ?? 0) + 1);
    }
    for (const [type, count] of counts) {
      expect(count).toBeLessThanOrEqual(SECTION_REGISTRY[type as never].maxPerPage);
    }
  });

  it('uses unique ids', () => {
    const ids = sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('normalizeSections', () => {
  it('drops unknown types instead of throwing', () => {
    const { sections, problems } = normalizeSections([
      { id: 'a', type: 'hero', enabled: true, settings: {} },
      { id: 'b', type: 'not-a-real-section', enabled: true, settings: {} },
    ]);
    expect(sections).toHaveLength(1);
    expect(problems).toHaveLength(1);
  });

  it('backfills missing settings from the defaults', () => {
    const { sections } = normalizeSections([{ id: 'a', type: 'hero', enabled: true, settings: {} }]);
    expect(sections[0].settings.layout).toBe(SECTION_REGISTRY.hero.defaultSettings.layout);
  });

  it('enforces per-type instance caps', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`,
      type: 'countdown',
      enabled: true,
      settings: {},
    }));
    const { sections, problems } = normalizeSections(many);
    expect(sections).toHaveLength(SECTION_REGISTRY.countdown.maxPerPage);
    expect(problems.length).toBeGreaterThan(0);
  });

  it('de-duplicates ids', () => {
    const { sections } = normalizeSections([
      { id: 'same', type: 'hero', enabled: true, settings: {} },
      { id: 'same', type: 'rich-text', enabled: true, settings: {} },
    ]);
    expect(new Set(sections.map((s) => s.id)).size).toBe(2);
  });

  it('handles junk input without throwing', () => {
    expect(normalizeSections(null).sections).toEqual([]);
    expect(normalizeSections('nope').sections).toEqual([]);
    expect(normalizeSections([null, 5, 'x']).sections).toEqual([]);
  });

  it('defaults enabled to true and honours an explicit false', () => {
    const { sections } = normalizeSections([
      { id: 'a', type: 'hero', settings: {} },
      { id: 'b', type: 'faq', enabled: false, settings: {} },
    ]);
    expect(sections[0].enabled).toBe(true);
    expect(sections[1].enabled).toBe(false);
  });
});
