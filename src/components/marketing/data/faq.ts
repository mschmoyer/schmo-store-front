/**
 * The homepage FAQ — copy deck §3.13.
 *
 * This array is the single source for both the rendered accordion and the
 * `FAQPage` structured data in `src/components/seo/LandingPageMeta.tsx`, because
 * §6 requires the schema to contain only questions and answers that appear
 * verbatim on the rendered page.
 *
 * Deliberate omissions, per the deck's own gates:
 *   - Question 4, "Is my ShipStation API key safe?" — credentials are stored
 *     base64-encoded, not encrypted. Publishing a security answer today would
 *     be a lie. The answer ships when the storage does.
 *   - The closing sentence of question 1 promised an orders/customers export.
 *     Only inventory CSV export exists, so the promise is cut.
 *   - The "public list" promise in the last answer requires a build-log page
 *     that does not exist, so that clause is cut.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

export const HOMEPAGE_FAQ: readonly FaqItem[] = [
  {
    question: 'What happens to my store if you shut down?',
    answer:
      "Your catalog isn't here — it's in ShipStation, where it already was, and we only read from it. Shutting down would cost you a storefront URL and your store's design, not your product data, inventory or fulfillment. Your Stripe account and your ShipStation account are both yours and outlive us.",
  },
  {
    question: 'Do you take a cut of my sales?',
    answer:
      'No. Not a percentage, not a per-order fee, not a "growth tier" that introduces one later. $19.99 a month is the entire amount we charge you. Stripe charges you its own published processing rate, directly — we don\'t mark it up, and we don\'t see the money.',
  },
  {
    question: 'Can I use my own domain?',
    answer:
      "Not yet. Your store runs at a rebelshops.com address today. Custom domains are the most requested thing we don't have, and if that's a dealbreaker, it should be — say so and we'll tell you when it ships.",
  },
  {
    question: "What if I don't use ShipStation?",
    answer:
      "Then RebelShops is the wrong product for you, and you should stop reading. The entire value here is that we read a catalog you've already built in ShipStation. Without that, you're doing the data entry we exist to avoid — and there are better tools for starting from scratch.",
  },
  {
    question: 'Do I have to change how I ship?',
    answer:
      "No. That's the point. Keep your carriers, your rates, your presets, your label workflow, your warehouses. Orders from your RebelShops store are handed to ShipStation for fulfillment and pick up the process you already run.",
  },
  {
    question: 'Will this oversell my inventory?',
    answer:
      "Stock levels come from ShipStation on a scheduled sync, so there's a window between a change in ShipStation and a change on your storefront. Every sync is logged with a timestamp and a record count, so you can see exactly how current your numbers are. If you're selling single-unit or one-of-a-kind items across multiple channels, run the sync tight and watch the log.",
  },
  {
    question: 'How many products can it handle?',
    answer:
      "We haven't published a limit because we haven't stress-tested one honestly, and a made-up number helps nobody. Catalogs in the hundreds of SKUs sync in minutes. If you're running tens of thousands, email us before you sign up and we'll tell you the truth about it.",
  },
  {
    question: 'Can I sell on RebelShops and Amazon and eBay at once?',
    answer:
      "Yes — that's the normal case. RebelShops is a direct channel next to your marketplaces, reading the same ShipStation stock levels they draw against. It's not a channel manager and doesn't arbitrate between them.",
  },
  {
    question: "What's actually built, and what's marketing?",
    answer:
      "Fair question to ask a new product. This FAQ names the gaps: no custom domains, no multi-currency, no POS, no app store. If you find something on this site that the product doesn't do, tell us and we'll take it down.",
  },
];
