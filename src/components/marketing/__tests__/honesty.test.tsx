import fs from 'fs';
import path from 'path';
import { HOMEPAGE_FAQ } from '../data/faq';
import { INCLUDED, NOT_INCLUDED } from '../pricing/PlanCard';
import { faqStructuredData, landingPageStructuredData } from '@/components/seo/LandingPageMeta';

/**
 * These are guard-rails, not style checks. Every assertion below corresponds to
 * a `[GATED: …]` block in docs/marketing-copy.md. If one of them fails, the
 * site is about to ship a claim the product cannot back.
 */

const MARKETING_DIR = path.join(process.cwd(), 'src/components/marketing');

/**
 * Collects every source file under the marketing tree.
 *
 * @param dir - Directory to walk.
 * @returns Absolute paths of `.ts`/`.tsx` files, excluding tests.
 */
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__tests__' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const ALL_SOURCE = sourceFiles(MARKETING_DIR)
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

/**
 * Strips JSDoc and line comments so notes-to-maintainers are not scanned, and
 * removes the copy deck's own sanctioned "No testimonials yet" eyebrow so the
 * banned-phrase sweep below does not trip on the disclaimer itself.
 */
const RENDERED_SOURCE = ALL_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/[Nn]o testimonials( yet)?/g, '');

describe('proof rules (copy deck §3.9)', () => {
  it.each([
    'testimonial',
    'trusted by',
    'join thousands',
    'aggregateRating',
    'star rating',
    'customers love',
    '5-star',
  ])('never renders the phrase %p', (phrase) => {
    expect(RENDERED_SOURCE.toLowerCase()).not.toContain(phrase.toLowerCase());
  });

  it('publishes no aggregateRating or review schema', () => {
    const json = JSON.stringify(landingPageStructuredData);
    expect(json).not.toContain('aggregateRating');
    expect(json).not.toContain('"review"');
  });
});

describe('feature gates', () => {
  it('does not claim orders appear in the ShipStation order queue (§3.5)', () => {
    expect(RENDERED_SOURCE.toLowerCase()).not.toContain('order queue');
    expect(RENDERED_SOURCE.toLowerCase()).not.toContain('bidirectional');
  });

  it('does not claim drag-and-drop or a live preview customizer (§3.3, §3.4)', () => {
    expect(RENDERED_SOURCE.toLowerCase()).not.toContain('drag and drop');
    expect(RENDERED_SOURCE.toLowerCase()).not.toContain('drag-and-drop');
    expect(RENDERED_SOURCE.toLowerCase()).not.toContain('live preview');
  });

  it('does not claim credentials are encrypted at rest (§3.13 Q4)', () => {
    expect(RENDERED_SOURCE.toLowerCase()).not.toContain('encrypted at rest');
  });

  it('omits the Stripe payments plan line until a payment completes (§3.7)', () => {
    expect(INCLUDED.some((item) => item.toLowerCase().includes('stripe payments'))).toBe(false);
  });

  it('keeps every "not included" line, including the custom-domain one (§3.10)', () => {
    expect(NOT_INCLUDED).toHaveLength(5);
    expect(NOT_INCLUDED.some((item) => item.lead.includes('custom domain'))).toBe(true);
  });

  it('publishes no Offer schema while billing does not exist (§6)', () => {
    expect(JSON.stringify(landingPageStructuredData)).not.toContain('"Offer"');
  });
});

describe('FAQ (copy deck §3.13)', () => {
  it('omits the API-key security question entirely', () => {
    expect(HOMEPAGE_FAQ.some((item) => item.question.toLowerCase().includes('api key safe'))).toBe(
      false
    );
  });

  it('does not promise an orders/customers export', () => {
    const shutdown = HOMEPAGE_FAQ.find((item) => item.question.includes('shut down'));
    expect(shutdown).toBeDefined();
    expect(shutdown?.answer).not.toContain('export your orders');
  });

  it('does not promise a public build log', () => {
    const built = HOMEPAGE_FAQ.find((item) => item.question.includes("what's marketing"));
    expect(built).toBeDefined();
    expect(built?.answer).not.toContain('public list');
  });

  it('still says custom domains are not built', () => {
    const domain = HOMEPAGE_FAQ.find((item) => item.question.includes('own domain'));
    expect(domain?.answer).toContain('Not yet');
  });

  it('feeds structured data only from questions the page renders', () => {
    expect(faqStructuredData.mainEntity).toHaveLength(HOMEPAGE_FAQ.length);
    faqStructuredData.mainEntity.forEach((entry, index) => {
      expect(entry.name).toBe(HOMEPAGE_FAQ[index].question);
      expect(entry.acceptedAnswer.text).toBe(HOMEPAGE_FAQ[index].answer);
    });
  });
});

describe('voice rules (copy deck §7)', () => {
  it('uses no exclamation marks in any copy string', () => {
    const copy = [
      ...HOMEPAGE_FAQ.flatMap((item) => [item.question, item.answer]),
      ...INCLUDED,
      ...NOT_INCLUDED.flatMap((item) => [item.lead, item.body]),
    ];
    for (const line of copy) {
      expect(line).not.toContain('!');
    }
  });

  it('never uses the banned button labels', () => {
    for (const banned of ['Learn more', 'Click here', 'Sign Up Free', 'Get Started Now']) {
      expect(RENDERED_SOURCE).not.toContain(banned);
    }
  });

  it('spells the product name correctly everywhere', () => {
    for (const wrong of ['RebelCart', 'Rebel Shops', 'Schmo Store', 'RebelShop ']) {
      expect(RENDERED_SOURCE).not.toContain(wrong);
    }
  });
});
