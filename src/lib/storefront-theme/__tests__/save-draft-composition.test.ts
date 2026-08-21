// The db layer is mocked so this can assert the SQL parameters `saveDraft`
// builds, which is where the defect lived. (`jest.mock` specifiers must be
// relative; `next/jest` does not map the `@/` alias for them.)
jest.mock('../../database', () => ({
  db: { query: jest.fn(), transaction: jest.fn() },
}));

import { db } from '@/lib/database';
import { asQueryMock } from '../../billing/test-support/query-mock';
import { saveDraft } from '../db';
import { presetSections } from '../presets';

/**
 * `saveDraft` must not replace a store's home page as a side effect.
 *
 * The defect: a store that has never saved a draft renders from the legacy
 * `stores.theme_name` mapping, so it has no `storefront_themes` row. Saving
 * *navigation* on such a store created that row — and the INSERT's fallback
 * composition was `presetSections(undefined)`, the generic starter page, not
 * the store's own preset composition.
 *
 * So renaming a menu item silently replaced the shop's home page with a
 * different one. Nothing errored, nothing warned, and the merchant found out by
 * looking at their shop. Found while driving the navigation editor in a
 * browser, not by any test — hence this one.
 */

// `@types/jest` is not a dependency here, so the ambient mock types are not
// available; `asQueryMock` is the repo's existing answer to that.
const query = asQueryMock(db.query);

/** A `storefront_themes` row as the RETURNING clause produces it. */
const savedRow = {
  store_id: 'store-1',
  status: 'draft',
  theme: {},
  sections: [],
  navigation: {},
  version: 1,
  updated_at: null,
  published_at: null,
};

beforeEach(() => {
  query.mockReset();
});

/**
 * Queue the lookup that decides whether this is a store's first draft.
 * @param themeName - The store's legacy theme name, or null for no lookup hit
 */
function mockFirstSaveLookup(themeName: string | null): void {
  query.mockResolvedValueOnce({ rows: [{ theme_name: themeName }] });
}

/** Queue a lookup result meaning "this store already has a draft row". */
function mockExistingDraft(): void {
  query.mockResolvedValueOnce({ rows: [] });
}

/** Queue the INSERT's return. */
function mockInsert(): void {
  query.mockResolvedValueOnce({ rows: [savedRow] });
}

describe('saveDraft does not replace a home page as a side effect', () => {
  it('starts a first draft from the legacy preset, not the generic default', async () => {
    // `dark` maps to Voltage in LEGACY_THEME_MAP.
    mockFirstSaveLookup('dark');
    mockInsert();

    await saveDraft('store-1', undefined, undefined, {
      header: [{ label: 'Our story', href: '/pages/about' }],
    });

    const insert = query.mock.calls[1];
    const fallbackSections = JSON.parse(String(insert[1][3]));

    expect(fallbackSections).toEqual(presetSections('voltage'));
    // The bug, stated as an assertion: the generic starter page must not be
    // what a Voltage store's first draft is seeded with.
    expect(fallbackSections).not.toEqual(presetSections(undefined));
  });

  it('uses an explicit preset when the caller names one', async () => {
    mockInsert();

    await saveDraft('store-1', { preset: 'bloom' });

    // No lookup: the caller said which preset, so there is nothing to infer.
    expect(query).toHaveBeenCalledTimes(1);
    const fallbackSections = JSON.parse(String(query.mock.calls[0][1][3]));
    expect(fallbackSections).toEqual(presetSections('bloom'));
  });

  it('does not look up the legacy name when a draft already exists', async () => {
    // An existing row keeps its own sections through the statement's COALESCE,
    // so the fallback is never reached and the extra query would be waste.
    mockExistingDraft();
    mockInsert();

    await saveDraft('store-1', undefined, undefined, { header: [] });

    expect(query).toHaveBeenCalledTimes(2);
    const fallbackSections = JSON.parse(String(query.mock.calls[1][1][3]));
    // Falls back to the generic page only in the case that can never use it.
    expect(fallbackSections).toEqual(presetSections(undefined));
  });

  it('passes sections through untouched when the caller supplies them', async () => {
    mockFirstSaveLookup('dark');
    mockInsert();

    const sections = presetSections('marquee');
    await saveDraft('store-1', undefined, sections);

    const sectionsJson = String(query.mock.calls[1][1][2]);
    expect(JSON.parse(sectionsJson)).toEqual(sections);
  });

  it('leaves navigation null when the caller does not send one', async () => {
    // Null is what makes the COALESCE keep the stored menus; sending `{}`
    // would quietly wipe a merchant's nav on every unrelated theme save.
    mockFirstSaveLookup('dark');
    mockInsert();

    await saveDraft('store-1', { preset: 'depot' });

    const navigationParam = query.mock.calls[0][1][4];
    expect(navigationParam).toBeNull();
  });
});
