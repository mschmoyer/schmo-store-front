/**
 * @jest-environment node
 *
 * The node environment is required, not incidental: importing the registry
 * pulls in the section components, one of which reaches the catalogue layer and
 * therefore `pg`, which needs `TextEncoder` from the Node globals that jsdom
 * does not provide.
 */
import { SECTION_TYPES } from '@/lib/storefront-theme';

import { SECTION_COMPONENTS } from '../index';

/**
 * The registry is the contract point between the theme engine's section list
 * (spec section 8) and this renderer. If the engine gains a section type and
 * the renderer does not, merchants can add a section that silently renders
 * nothing — so this asserts the two stay in step.
 */
describe('section registry', () => {
  it('implements every section type the engine declares', () => {
    const implemented = Object.keys(SECTION_COMPONENTS).sort();
    expect(implemented).toEqual([...SECTION_TYPES].sort());
  });

  it('maps every type to a component', () => {
    for (const type of SECTION_TYPES) {
      expect(typeof SECTION_COMPONENTS[type]).toBe('function');
    }
  });

  it('exposes no types the engine does not know about', () => {
    for (const key of Object.keys(SECTION_COMPONENTS)) {
      expect(SECTION_TYPES).toContain(key);
    }
  });
});
