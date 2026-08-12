/**
 * The date setting, and the deadline a countdown starts with.
 *
 * A countdown's "Ends at" used to be a bare text box whose help asked the
 * merchant to type `2026-12-24T23:59:00Z` by hand — and it shipped empty with
 * "hide when the timer runs out" switched on, so the section was invisible from
 * the moment it was added and nothing said why.
 */

import * as React from 'react';
import { render, screen } from '@testing-library/react';

import { SECTION_REGISTRY, createSection } from '@/lib/storefront-theme';

import { DateControl, isoToLocalInput, localInputToIso } from '../controls/DateControl';
import { controlFor } from '../controls/registry';
import { COUNTDOWN_DEFAULT_DAYS, seedDynamicDefaults } from '../state/reducer';

const endsAtField = SECTION_REGISTRY.countdown.settingsSchema.find(
  (field) => field.id === 'endsAt',
)!;

describe('the control chosen for a date setting', () => {
  it('is a date picker, not a text box', () => {
    expect(controlFor(endsAtField, '')).toBe(DateControl);
  });

  it('leaves every other text field alone', () => {
    const heading = SECTION_REGISTRY.countdown.settingsSchema.find(
      (field) => field.id === 'heading',
    )!;
    expect(controlFor(heading, '')).not.toBe(DateControl);
  });
});

describe('ISO ⇄ local conversion', () => {
  it('round-trips an instant', () => {
    const iso = '2026-12-24T23:59:00.000Z';
    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
  });

  it('treats an empty or unparseable value as no deadline', () => {
    expect(isoToLocalInput('')).toBe('');
    expect(isoToLocalInput('next tuesday')).toBe('');
    expect(isoToLocalInput(undefined)).toBe('');
    expect(localInputToIso('')).toBe('');
    expect(localInputToIso('nonsense')).toBe('');
  });

  it('stores UTC whatever the merchant’s clock says', () => {
    const stored = localInputToIso('2026-12-24T23:59');
    expect(stored).toMatch(/Z$/);
    expect(new Date(stored).getTime()).toBe(new Date('2026-12-24T23:59').getTime());
  });
});

describe('DateControl', () => {
  /** Render with a value and read back what the merchant is told. */
  const renderAt = (value: string) =>
    render(
      <DateControl
        field={endsAtField}
        value={value}
        onChange={() => {}}
        controlId="countdown-endsAt"
      />,
    );

  it('renders a real datetime input', () => {
    renderAt('2026-12-24T23:59:00.000Z');
    const input = document.querySelector('input[type="datetime-local"]');
    expect(input).toBeInTheDocument();
  });

  it('says plainly that an empty deadline means the section will not appear', () => {
    renderAt('');
    expect(screen.getByTestId('countdown-endsAt-resolved')).toHaveTextContent(
      /will not appear on your storefront/,
    );
  });

  it('says so when the deadline has already gone', () => {
    renderAt('2020-01-01T00:00:00.000Z');
    expect(screen.getByTestId('countdown-endsAt-resolved')).toHaveTextContent(
      /already passed/,
    );
  });

  it('echoes the stored UTC instant, so there is no timezone guesswork', () => {
    renderAt('2030-06-01T12:00:00.000Z');
    expect(screen.getByTestId('countdown-endsAt-resolved')).toHaveTextContent(
      '2030-06-01T12:00:00.000Z',
    );
  });
});

describe('a freshly added countdown', () => {
  it('gets a deadline a week out rather than an empty one', () => {
    const seeded = seedDynamicDefaults(createSection('countdown', '1'));
    const endsAt = seeded.settings.endsAt as string;

    expect(typeof endsAt).toBe('string');
    const days = (new Date(endsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(COUNTDOWN_DEFAULT_DAYS - 0.1);
    expect(days).toBeLessThan(COUNTDOWN_DEFAULT_DAYS + 0.1);
  });

  it('is therefore visible on the storefront the moment it is added', () => {
    // The renderer drops a countdown with no deadline, and again when the
    // deadline is past and `hideWhenExpired` is on — which it is by default.
    const seeded = seedDynamicDefaults(createSection('countdown', '1'));
    expect(seeded.settings.hideWhenExpired).toBe(true);
    expect(Date.parse(seeded.settings.endsAt as string)).toBeGreaterThan(Date.now());
  });

  it('never overwrites a deadline the merchant already set', () => {
    const chosen = '2031-01-01T00:00:00.000Z';
    const section = createSection('countdown', '1', { endsAt: chosen });
    expect(seedDynamicDefaults(section).settings.endsAt).toBe(chosen);
  });

  it('leaves other section types untouched', () => {
    const hero = createSection('hero', '1');
    expect(seedDynamicDefaults(hero)).toBe(hero);
  });
});
