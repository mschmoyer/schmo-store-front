/**
 * Shipped copy may not make promises on a merchant's behalf.
 *
 * `presets.ts` already established this rule for the announcement bar, and the
 * reasoning in its header is the reasoning here: *sample copy inside a section
 * is a starting point a merchant will edit; a promise is a commitment made on
 * their behalf.* The section copy had not been held to it.
 *
 * A merchant picked "Marquee" during onboarding and published. Their live shop
 * — selling Lightroom presets — then read "One mill, nine years" and, under a
 * heading of its own, "We do not run sales": a public pricing commitment they
 * had never agreed to and would break with their first Black Friday bundle.
 * Others promised same-day dispatch, 30-day returns, a two-year warranty and
 * net-30 terms. A shopper can hold a merchant to any of those.
 *
 * The rule this file enforces is deliberately narrow:
 *
 *   - **Brand voice is fine.** "The Autumn Edit", "Built to last", "Cut once,
 *     in a mill we have used for nine years" — evocative copy a merchant will
 *     obviously rewrite, that commits them to nothing enforceable.
 *   - **Commitments are not.** A delivery time, a returns window, a warranty
 *     length, a discount rate, payment terms, a free-shipping threshold, or a
 *     stated pricing policy. These must be visible bracketed prompts, so they
 *     are unmistakably unfinished both in the editor and on the rendered page.
 *
 * The trade is real and worth stating: the value-prop cards read less
 * impressively in a screenshot now. That is the correct direction. A merchant
 * editing three cards is a much better outcome than a merchant unknowingly
 * advertising a returns window they never chose.
 */

import { PAGE_TEMPLATE_IDS, pageTemplateSections } from '../page-templates';
import { PRESETS, PRESET_IDS, presetSections } from '../presets';
import { defaultSections } from '../sections';
import type { Section } from '../types';

/**
 * Patterns that state something a customer could hold a merchant to.
 *
 * Kept to claims with a *number or a named term* in them. A vaguer promise
 * ("fast delivery") is puffery a merchant will rewrite and nobody can enforce;
 * "30-day returns" is a term of sale.
 */
const COMMITMENTS: { label: string; pattern: RegExp }[] = [
  { label: 'a delivery or dispatch time', pattern: /\b(same[- ]day|next[- ]day|overnight|within \d+ (hours|days)|before \d+\s*(am|pm))\b/i },
  // A duration only matters when it is attached to something a customer could
  // claim under. "Two-year warranty" is a term of sale; "a mill we have used
  // for nine years" is history, and flagging it would push merchants towards
  // bracketed placeholders where real brand copy belongs. So the duration and
  // the commitment noun have to appear together, in either order.
  {
    label: 'a returns or warranty window',
    pattern:
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[- ](day|week|month|year)s?\b[^.!?]{0,40}?\b(warrant|guarantee|return|refund|exchange|trial)/i,
  },
  {
    label: 'a returns or warranty window',
    pattern:
      /\b(warrant|guarantee|return|refund|exchange|trial)\w*\b[^.!?]{0,40}?\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[- ](day|week|month|year)s?\b/i,
  },
  { label: 'a free-shipping or free-returns offer', pattern: /\bfree (shipping|returns|delivery|samples|postage)\b/i },
  { label: 'payment terms', pattern: /\bnet[- ]?\d+\b/i },
  { label: 'a discount rate', pattern: /\b(save|off)\s*\d+\s*%|\b\d+\s*%\s*(off|discount)\b/i },
  { label: 'a stated pricing policy', pattern: /\bwe (do not|don't|never) (run sales|discount)\b/i },
  { label: 'a no-restocking-fee promise', pattern: /\bno restocking fee\b/i },
  { label: 'a price threshold', pattern: /\bfree over \$?\d+/i },
];

/**
 * Strip bracketed prompts, which are allowed to mention anything precisely
 * because they are visibly unfinished.
 *
 * @param value - Copy to examine
 * @returns The copy outside any `[...]` prompt
 */
function outsidePrompts(value: string): string {
  return value.replace(/\[[^\]]*\]/g, ' ');
}

/**
 * Every string in a section's settings, flattened.
 *
 * Settings are free-form JSON — `items` on a value-props or FAQ section is an
 * array of objects — so this walks the whole tree rather than reading known
 * keys, which would miss exactly the nested copy that carried the worst of it.
 *
 * @param value - A settings value
 * @returns Every string found
 */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

/**
 * Check one composition.
 * @param label - What is being checked, for the failure message
 * @param sections - The composition
 * @returns One human-readable finding per offending string
 */
function findings(label: string, sections: Section[]): string[] {
  const out: string[] = [];
  for (const section of sections) {
    for (const value of strings(section.settings)) {
      const copy = outsidePrompts(value);
      for (const { label: kind, pattern } of COMMITMENTS) {
        if (pattern.test(copy)) {
          out.push(`${label} → ${section.type}: states ${kind} — ${JSON.stringify(value)}`);
        }
      }
    }
  }
  return out;
}

describe('shipped copy makes no promises on a merchant behalf', () => {
  it('holds for every preset composition', () => {
    const all = PRESET_IDS.flatMap((id) => findings(`preset "${id}"`, presetSections(id)));
    expect(all).toEqual([]);
  });

  it('holds for the starter composition a store gets with no preset', () => {
    expect(findings('default sections', defaultSections())).toEqual([]);
  });

  it('holds for every page template', () => {
    const all = PAGE_TEMPLATE_IDS.flatMap((id) =>
      findings(`page template "${id}"`, pageTemplateSections(id)),
    );
    expect(all).toEqual([]);
  });

  it('still ships no preset with the announcement bar enabled or filled in', () => {
    // The original instance of this rule, from `presets.ts`. A promise in the
    // header is worse than one in a section: it is on every page, and it used
    // to be published by an onboarding step that had no preview.
    for (const id of PRESET_IDS) {
      const announcement = PRESETS[id].theme.header.announcement;
      expect(`${id}: enabled=${announcement?.enabled}`).toBe(`${id}: enabled=false`);
      expect(`${id}: text=${JSON.stringify(announcement?.text ?? '')}`).toBe(`${id}: text=""`);
    }
  });
});

describe('the rule itself', () => {
  it('catches the copy that shipped before this test existed', () => {
    // Guards against the patterns being loosened into uselessness later.
    const offenders = [
      'Everything in stock ships the same day. Free returns for 30 days.',
      '30-day returns',
      'Two-year warranty',
      'Net-30 available',
      'We do not run sales',
      'Subscribe and save 15%',
      'Free over $75',
      'No restocking fee, ever.',
      'Order before 3pm on weekdays.',
    ];
    for (const copy of offenders) {
      const hit = COMMITMENTS.some(({ pattern }) => pattern.test(outsidePrompts(copy)));
      expect(`${copy} → ${hit ? 'caught' : 'MISSED'}`).toBe(`${copy} → caught`);
    }
  });

  it('leaves brand voice alone', () => {
    // If this starts failing, the patterns have grown too greedy and are
    // pushing merchants towards bracketed placeholders where real copy belongs.
    const allowed = [
      'The Autumn Edit',
      'Built to last. Priced to move.',
      'Eighteen pieces. Cut once, in a mill we have used for nine years.',
      'What people are actually buying this month.',
      'Shop by category',
      'Questions',
      'Straight answers on stock. Rare these days.',
    ];
    for (const copy of allowed) {
      const hit = COMMITMENTS.some(({ pattern }) => pattern.test(outsidePrompts(copy)));
      expect(`${copy} → ${hit ? 'FLAGGED' : 'allowed'}`).toBe(`${copy} → allowed`);
    }
  });

  it('treats a bracketed prompt as unfinished, whatever it says', () => {
    expect(
      COMMITMENTS.some(({ pattern }) =>
        pattern.test(outsidePrompts('[How many days do customers have to return an item?]')),
      ),
    ).toBe(false);
  });
});
