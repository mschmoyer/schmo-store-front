#!/usr/bin/env node
/**
 * RebelShops demo data seeder.
 *
 * Wipes and reloads the three demo stores (Basecamp Audio / demo-electronics,
 * Fernwood Goods / artisan-craft, Ironline Fitness / fitness-pro) with a full,
 * believable catalog: categories, products with real merchandising copy,
 * per-warehouse inventory, coupons, blog posts, 90 days of orders + line
 * items, and 90 days of visitor/search traffic so the admin dashboard and
 * analytics screens have something real to chart.
 *
 * Safety: every DELETE is scoped to these three stores' UUIDs (and their
 * three owner users). It never touches rows belonging to any other store, so
 * it is safe to run against a database other agents are also writing to.
 *
 * Usage:
 *   node scripts/seed-demo.js            # seed (or re-seed) the demo data
 *   node scripts/seed-demo.js --no-dump  # skip regenerating development.sql
 *
 * Requires DATABASE_URL (falls back to reading .env.local if unset).
 *
 * After a successful run this script also regenerates
 * database/seeds/development.sql as a plain-SQL snapshot of exactly what it
 * just wrote — see docs/demo-data.md for why that file is generated rather
 * than hand-maintained.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
if (!process.env.DATABASE_URL) {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const { Pool } = require('pg');

// Any host that is not loopback gets TLS, matching database/migrate.js and
// src/lib/database/connection.ts. Keying this off NODE_ENV instead — as this
// script used to — made it impossible to seed a hosted database from a
// developer machine: `ssl: false` overrides the `sslmode=require` already in
// the connection string, so Neon closed the connection before the first query.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const seedHost = (() => {
  try {
    return new URL(process.env.DATABASE_URL || '').hostname;
  } catch {
    return '';
  }
})();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: seedHost && !LOCAL_HOSTS.has(seedHost) ? { rejectUnauthorized: false } : false,
});

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) -- same seed, same demo data, every run.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260812);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const pickWeighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
  return pairs[pairs.length - 1][0];
};
const randInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
const daysAgo = (n, hourJitter = true) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  if (hourJitter) d.setHours(randInt(6, 22), randInt(0, 59), randInt(0, 59), 0);
  return d;
};

/**
 * Pull a timestamp back behind `now` if the hour jitter pushed it into the future.
 *
 * `daysAgo(0)` picks an hour between 06:00 and 22:00 *today*, which is in the future whenever the
 * seed is run in the morning. A demo database full of orders placed later today is not merely odd:
 * anything comparing "received today" with "shipped today", or filtering to a window that ends
 * now, silently disagrees with itself.
 *
 * @param {Date} date - A candidate timestamp
 * @returns {Date} The same timestamp, or a recent one if it was in the future
 */
const clampToPast = (date) => {
  const now = new Date();
  if (date <= now) return date;
  return new Date(now.getTime() - randInt(30, 300) * 60000);
};

/**
 * The platform's take rate in the demo data, in basis points (2%).
 *
 * `STRIPE_APPLICATION_FEE_BPS` defaults to 0, so a demo seeded from the live default would report
 * a platform that earns nothing on every order it processes -- structurally zero revenue in every
 * screen that charts it. Two percent is a plausible marketplace take and is labelled here as the
 * demo's assumption, not as a product decision.
 */
const DEMO_APPLICATION_FEE_BPS = 200;

// ---------------------------------------------------------------------------
// Fixed identities (do not change -- other parts of the app key off these)
// ---------------------------------------------------------------------------
const USERS = [
  { id: '550e8400-e29b-41d4-a716-446655440001', email: 'demo@schmostore.com', first_name: 'Demo', last_name: 'User' },
  { id: '550e8400-e29b-41d4-a716-446655440002', email: 'store.owner@example.com', first_name: 'Store', last_name: 'Owner' },
  { id: '550e8400-e29b-41d4-a716-446655440003', email: 'another.user@example.com', first_name: 'Another', last_name: 'User' },
];
// How long each demo store has existed, in days, indexed by position in STORES.
//
// Three separate values, and all of them older than the 90 days of order history, because both
// facts are load-bearing for the platform console:
//
//   * A store created *after* its own orders makes "days to first order" negative, which is what
//     the previous seed produced for 72 of its 74 orders. Every store here predates its oldest
//     order by at least a week.
//   * Three stores sharing one creation timestamp makes the signups time series a single spike and
//     zero everywhere else, so nothing that charts merchant growth can be seen working. Staggering
//     them gives that chart three real points, and gives the flagship store a longer history than
//     the newcomer, which is also why its traffic is heavier.
const STORE_AGE_DAYS = [240, 165, 96];

/** Owners sign up shortly before they create their store, never after it. */
const OWNER_SIGNUP_LEAD_DAYS = [6, 3, 9];

// Every seeded demo user shares this password. The plaintext is 'rebeldev',
// documented in README.md and docs/demo-data.md.
//
// The previous value was a bcrypt hash carried over from the original seed
// file whose plaintext nobody knew, so a fresh `npm run db:seed-demo`
// produced demo accounts that could not be logged into at all — local setup
// looked complete and then dead-ended at the sign-in screen.
//
// Dev fixture only. Never used outside seeded demo data.
const PASSWORD_HASH = '$2b$10$.K2LwaD0LLZ4WS9CKxsCXek4Nqu9fr.q4PPCGF3FW9bRMNqBmFt06';

// ---------------------------------------------------------------------------
// Store / catalog data
// ---------------------------------------------------------------------------
const STORES = [
  {
    id: '650e8400-e29b-41d4-a716-446655440001',
    ownerId: USERS[0].id,
    slug: 'demo-electronics',
    name: 'Basecamp Audio',
    tagline: 'Gear that keeps up.',
    description: 'Headphones, desk gear and small electronics built for people who use them every day, not just unbox them.',
    heroTitle: 'Sound and desk gear built for daily use',
    heroDescription: "We test every pair of headphones for 200 hours before it ships. Everything here is in stock, backed by a two-year warranty, and out the door in one business day.",
    metaTitle: 'Basecamp Audio — Headphones, Desk Gear & Everyday Electronics',
    metaDescription: 'Shop headphones, keyboards, smart speakers and desk accessories built to last. Free shipping over $75, two-year warranty on everything.',
    themeName: 'dark',
    skuPrefix: 'BCA',
    shippingFreeThreshold: 75,
    shippingFlatRate: 8.99,
    extraConfig: { warranty_years: ['2', 'number'], extended_warranty_available: ['true', 'boolean'] },
    categories: [
      { slug: 'audio', name: 'Audio', description: 'Headphones, earbuds and speakers.' },
      { slug: 'desk-workspace', name: 'Desk & Workspace', description: 'Keyboards, mice, lighting and everything else on the desk.' },
      { slug: 'power-storage', name: 'Power & Storage', description: 'Batteries, chargers and portable drives.' },
      { slug: 'wearables', name: 'Wearables', description: 'Watches and on-body tech.' },
    ],
    products: [
      { slug: 'aviator-headphones-onyx', sku: 'BCA-AUD-1001', name: 'Aviator Headphones — Onyx', category: 'audio',
        short: 'Over-ear headphones with 40 hours of playback and a travel case that actually fits in a backpack pocket.',
        long: [
          "The Aviator is tuned flat out of the box, no bass boost hiding behind an EQ preset. Memory-foam ear cushions and a stainless steel headband slider mean they stay comfortable past the three-hour mark, which is where most over-ear headphones start to hurt.",
          "Bluetooth 5.3 with multipoint pairing switches between your laptop and phone without a manual disconnect. A USB-C cable is included for wired listening once the battery finally does run out, which takes about two work weeks of daily use.",
        ],
        base: 249.00, cost: 114.54, sale: 199.00, stock: 42, low: 8, weight: 0.65, dims: [8, 7, 3.5],
        tags: ['headphones', 'audio', 'wireless'], featured: true },
      { slug: 'pulse-earbuds-case', sku: 'BCA-AUD-1002', name: 'Pulse True Wireless Earbuds', category: 'audio',
        short: 'Compact earbuds with active noise cancellation and a case that charges wirelessly.',
        long: [
          "Pulse earbuds seal well enough to cancel a plane cabin without turning up the volume to compensate. Each bud is rated IPX4, so a sweaty run or a walk in the rain won't end the relationship.",
          "The case holds four additional charges and takes a wireless charging pad if you have one. Touch controls handle play, skip and calls; there's no companion app required to make any of it work.",
        ],
        base: 179.00, cost: 85.92, sale: null, stock: 58, low: 8, weight: 0.12, dims: [2.5, 2, 1.2],
        tags: ['earbuds', 'wireless', 'audio'], featured: false },
      { slug: 'basecamp-smart-speaker', sku: 'BCA-AUD-1003', name: 'Basecamp Smart Speaker', category: 'audio',
        short: 'Room-filling sound from a speaker small enough to leave on a kitchen counter.',
        long: [
          "A 3-inch woofer and dual tweeters give the Basecamp speaker more low end than its size suggests, without the boom that makes small speakers sound cheap at higher volumes.",
          "Pair two units for stereo, or group several around the house over Wi-Fi. The fabric shell wipes clean, and the status ring dims automatically after sunset.",
        ],
        base: 129.00, cost: 64.50, sale: 99.00, stock: 27, low: 8, weight: 1.8, dims: [4, 4, 6.5],
        tags: ['speaker', 'smart-home', 'audio'], featured: true },
      { slug: 'keystroke-mechanical-keyboard', sku: 'BCA-DSK-1004', name: 'Keystroke Mechanical Keyboard', category: 'desk-workspace',
        short: 'A tenkeyless mechanical keyboard with hot-swappable switches, so you can change the feel without a soldering iron.',
        long: [
          "Keystroke ships with tactile brown switches installed, but the hot-swap sockets accept any standard 3-pin or 5-pin switch if you decide six months from now that you want something louder, or quieter.",
          "A CNC-milled aluminum top plate keeps the board from flexing under fast typing, and the detachable USB-C cable means a frayed cord is a five-dollar fix, not a new keyboard.",
        ],
        base: 159.00, cost: 85.86, sale: null, stock: 21, low: 8, weight: 2.1, dims: [14, 5, 1.3],
        tags: ['keyboard', 'mechanical', 'desk'], featured: true },
      { slug: 'glide-wireless-mouse', sku: 'BCA-DSK-1005', name: 'Glide Wireless Mouse', category: 'desk-workspace',
        short: 'An ergonomic wireless mouse with a 4,000 DPI sensor and a scroll wheel that free-spins on demand.',
        long: [
          "Glide's shape was built around a hand-tracing study, not a mood board — the thumb rest sits where thumbs actually rest. A side switch flips the scroll wheel between clicked steps and a fast free-spin for long documents.",
          "One AA battery runs it for about five months of regular use, and a low-battery LED gives a week's warning before it dies mid-scroll.",
        ],
        base: 69.00, cost: 34.50, sale: 54.00, stock: 64, low: 8, weight: 0.22, dims: [4.5, 2.6, 1.5],
        tags: ['mouse', 'desk', 'wireless'], featured: false },
      { slug: 'hubline-usb-c-hub', sku: 'BCA-DSK-1006', name: 'Hubline 7-in-1 USB-C Hub', category: 'desk-workspace',
        short: 'Seven ports, one cable — HDMI, USB-A, SD, and 100W pass-through charging from a single USB-C connection.',
        long: [
          "Hubline turns one USB-C port into a 4K/60Hz HDMI output, two USB-A 3.0 ports, an SD/microSD reader, and a 100W pass-through so your laptop still charges while everything else is plugged in.",
          "The aluminum shell doubles as a heatsink, which matters more than it sounds like it should when you're transferring a card full of RAW photos.",
        ],
        base: 59.00, cost: 34.22, sale: null, stock: 46, low: 8, weight: 0.18, dims: [4, 1.5, 0.6],
        tags: ['hub', 'usb-c', 'desk'], featured: false },
      { slug: 'arclight-desk-lamp', sku: 'BCA-DSK-1007', name: 'Arclight LED Desk Lamp', category: 'desk-workspace',
        short: 'An articulated LED lamp with adjustable color temperature and a built-in USB-C charging port.',
        long: [
          "Arclight's arm holds any angle without drifting, which sounds like a low bar until you've owned a lamp that doesn't. Five brightness levels and three color temperatures cover everything from late-night reading to on-camera lighting.",
          "A USB-C port in the base charges a phone without adding a second cable to the desk, and the touch-sensitive dimmer remembers your last setting after it's unplugged.",
        ],
        base: 89.00, cost: 46.28, sale: 74.00, stock: 3, low: 5, weight: 2.4, dims: [5, 5, 18],
        tags: ['lamp', 'desk', 'lighting'], featured: false },
      { slug: 'orbit-webcam-clip', sku: 'BCA-DSK-1008', name: 'Orbit 1080p Webcam', category: 'desk-workspace',
        short: 'A 1080p webcam with a wide-angle lens and a privacy shutter that actually stays shut.',
        long: [
          "Orbit's autofocus keeps up with normal fidgeting, and the low-light correction means you don't look like you're calling from a cave once the sun goes down.",
          "The clip mounts to almost any monitor from 5mm to 35mm thick, and the sliding privacy shutter is physical, not a software toggle you have to trust.",
        ],
        base: 79.00, cost: 43.45, sale: null, stock: 33, low: 8, weight: 0.2, dims: [2.5, 2, 2.5],
        tags: ['webcam', 'video', 'desk'], featured: false },
      { slug: 'anchor-charging-dock', sku: 'BCA-DSK-1009', name: 'Anchor 3-in-1 Charging Dock', category: 'desk-workspace',
        short: 'Charges phone, watch and earbuds at once, angled so you can still see notifications.',
        long: [
          "Anchor holds a phone at an angle that keeps Face ID and notifications visible while it charges, with a dedicated puck for a smartwatch and a slot underneath for an earbuds case.",
          "15W fast charging on the phone puck, 5W on the others — enough to charge overnight without needing three separate bricks cluttering the outlet.",
        ],
        base: 49.00, cost: 27.44, sale: 39.00, stock: 39, low: 8, weight: 0.55, dims: [3.5, 3.5, 5],
        tags: ['charging', 'dock', 'desk'], featured: false },
      { slug: 'voltpack-power-bank', sku: 'BCA-PWR-1010', name: 'Voltpack 20,000mAh Power Bank', category: 'power-storage',
        short: "Enough capacity for four full phone charges, with pass-through so it charges itself and your laptop at the same time.",
        long: [
          "Voltpack's 20,000mAh cell is enough to take a phone from empty to full about four times, or top off a laptop once with enough left over for a phone.",
          "Three LEDs show remaining charge in rough quarters instead of a vague single light, and the 65W USB-C port is fast enough to charge the pack itself in under two hours.",
        ],
        base: 55.00, cost: 31.90, sale: null, stock: 71, low: 8, weight: 0.9, dims: [5.7, 2.7, 1],
        tags: ['power-bank', 'charging', 'travel'], featured: false },
      { slug: 'driftcase-portable-ssd', sku: 'BCA-PWR-1011', name: 'Driftcase 1TB Portable SSD', category: 'power-storage',
        short: 'A 1TB solid-state drive rated to survive a 2-meter drop, with transfer speeds fast enough for 4K video editing.',
        long: [
          "Driftcase reads at up to 1,050MB/s, fast enough to edit 4K footage directly off the drive instead of copying it over first. The aluminum shell is rated for a 2-meter drop onto a hard surface.",
          "It shows up as a standard external drive on Mac, Windows, or a Steam Deck — no proprietary software, no formatting required to get started.",
        ],
        base: 119.00, cost: 61.88, sale: 99.00, stock: 4, low: 5, weight: 0.14, dims: [3, 2, 0.4],
        tags: ['ssd', 'storage', 'portable'], featured: false },
      { slug: 'pulse-smartwatch', sku: 'BCA-WBL-1012', name: 'Pulse Smartwatch', category: 'wearables',
        short: 'A smartwatch with a seven-day battery, GPS, and a screen bright enough to read in direct sun.',
        long: [
          "Pulse tracks heart rate, sleep and about thirty workout types, and holds a charge for a full week between charges — the display stays on the whole time, not just on wrist-raise.",
          "GPS is built in, so runs get tracked accurately without a phone in your pocket. It's currently our most backordered item; new stock ships from the factory every three weeks.",
        ],
        base: 229.00, cost: 107.63, sale: null, stock: 0, low: 8, weight: 0.14, dims: [1.7, 1.5, 0.5],
        tags: ['smartwatch', 'wearable', 'fitness'], featured: true },
    ],
    coupons: [
      { code: 'WELCOME10', name: 'Welcome Discount', description: '10% off your first order.', type: 'percentage', value: 10, min: 50, usageLimit: 200, perCustomer: 1 },
      { code: 'FREESHIP', name: 'Free Shipping', description: '$9.99 off — covers standard shipping.', type: 'fixed_amount', value: 9.99, min: 40, usageLimit: null, perCustomer: 2 },
    ],
    blog: [
      { slug: 'why-we-tune-aviator-flat', title: 'Why We Tune Aviator Flat, Not Bassy', category: 'Product Notes', tags: ['headphones', 'audio', 'engineering'],
        excerpt: "Most headphones in this price range boost the bass because it sells better in a five-second store demo. Here's why we didn't.",
        content: [
          "Walk into any electronics store, put on a random pair of headphones, and play something with a kick drum. The pair that sounds \"best\" in that five-second test is almost always the one with an artificially boosted low end. It sounds impressive for a demo and fatiguing for a workday.",
          "Aviator is tuned close to flat, which means vocals sit where they were mixed instead of getting buried under bass that was never supposed to be that loud. It's a less flattering demo and a better six-hour listen, which is the actual use case for a pair of headphones you're buying to wear at a desk.",
          "If you genuinely want more bass, the companion app has an EQ preset for that. We just don't think it should be the default.",
        ] },
      { slug: 'five-desk-accessories-worth-the-drawer-space', title: 'Five Desk Accessories Worth the Drawer Space', category: 'Buying Guides', tags: ['desk', 'workspace', 'guide'],
        excerpt: "Most desk gadgets end up in a drawer within a month. These five earn a permanent spot.",
        content: [
          "We sell a lot of desk accessories, and we're honest about the fact that most desk accessories are clutter with a UPC code. So this list is short on purpose — five things we'd actually replace if ours broke tomorrow.",
          "A hub that consolidates cables, a lamp with a charging port built in, and a mouse shaped for an actual hand beat almost anything with a screen or an app. The theme is: solve one annoyance completely, and disappear into the desk.",
          "The full list, with why each one earns its spot, is worth five minutes if your desk currently looks like a cable drawer exploded on it.",
        ] },
      { slug: 'how-long-should-a-power-bank-actually-last', title: 'How Long Should a Power Bank Actually Last', category: 'Product Notes', tags: ['power', 'charging', 'battery'],
        excerpt: "Battery capacity claims are inflated industry-wide. Here's how to read the number that actually matters.",
        content: [
          "A 20,000mAh power bank does not give a 3,000mAh phone battery 6.6 full charges. Voltage conversion losses mean the real number is closer to four, and every manufacturer knows this and prints the bigger number anyway.",
          "What actually matters is charge-cycle count and pass-through behavior — whether the bank can charge your laptop and itself at the same time without shutting off. We test both before anything ships, and we publish the real numbers, not the theoretical ones.",
        ] },
    ],
  },
  {
    id: '650e8400-e29b-41d4-a716-446655440002',
    ownerId: USERS[1].id,
    slug: 'artisan-craft',
    name: 'Fernwood Goods',
    tagline: 'Handmade in small batches.',
    description: 'Ceramics, candles and textiles thrown, poured and stitched by two hands, not a factory line.',
    heroTitle: 'Thrown, poured and stitched by hand',
    heroDescription: "Every mug comes off a single potter's wheel in our Asheville studio. Small-batch runs mean when something sells out, it's actually gone until the next kiln load.",
    metaTitle: 'Fernwood Goods — Handmade Ceramics, Candles & Textiles',
    metaDescription: 'Small-batch ceramics, soy candles and woven textiles, handmade in our Asheville studio. Gift-ready packaging on request.',
    themeName: 'amber',
    skuPrefix: 'FWG',
    shippingFreeThreshold: 50,
    shippingFlatRate: 6.99,
    extraConfig: { artisan_spotlight: ['true', 'boolean'], custom_packaging: ['true', 'boolean'] },
    categories: [
      { slug: 'pottery-ceramics', name: 'Pottery & Ceramics', description: 'Mugs, vases and bowls thrown by hand.' },
      { slug: 'candles-fragrance', name: 'Candles & Home Fragrance', description: 'Soy candles poured in small batches.' },
      { slug: 'textiles-bags', name: 'Textiles & Bags', description: 'Woven, knotted and stitched goods.' },
      { slug: 'wood-leather', name: 'Wood & Leather Goods', description: 'Carved, tanned and bound by hand.' },
    ],
    products: [
      { slug: 'hearth-ceramic-mug', sku: 'FWG-POT-2001', name: 'Hearth Ceramic Mug', category: 'pottery-ceramics',
        short: 'A 12oz stoneware mug, thrown and glazed by hand — no two exactly alike.',
        long: [
          "Each Hearth mug starts as a lump of stoneware clay on Priya's wheel and comes off it twenty minutes later shaped, though not yet fired. The reactive glaze runs differently every time it hits the kiln, so the mug you get is the only one exactly like it.",
          "It holds 12oz, survives the microwave and the top rack of a dishwasher, and the handle is pulled by hand to fit three fingers comfortably, not molded to a generic curve.",
        ],
        base: 28.00, cost: 11.76, sale: null, stock: 34, low: 6, weight: 0.9, dims: [4, 3.2, 4],
        tags: ['mug', 'ceramic', 'handmade'], featured: true },
      { slug: 'bud-ceramic-vase', sku: 'FWG-POT-2002', name: 'Bud Ceramic Vase', category: 'pottery-ceramics',
        short: 'A single-stem bud vase in a hand-mixed matte glaze, tall enough for a branch, small enough for a windowsill.',
        long: [
          "Bud vases are thrown one at a time on a slow wheel, which is why we can only make about fifteen a week. The narrow neck holds a single stem upright without the vase tipping, which is harder to get right than it sounds.",
          "The matte glaze is mixed in-house in small batches, so the exact shade drifts slightly from one kiln run to the next — buy two if you want a matched pair from the same batch.",
        ],
        base: 64.00, cost: 25.60, sale: 52.00, stock: 3, low: 5, weight: 1.4, dims: [4, 4, 9],
        tags: ['vase', 'ceramic', 'handmade'], featured: false },
      { slug: 'nested-ceramic-bowls', sku: 'FWG-POT-2003', name: 'Nested Ceramic Bowl Set (3)', category: 'pottery-ceramics',
        short: 'Three stoneware bowls in graduated sizes that nest for storage and stack for the shelf.',
        long: [
          "This set covers cereal, soup and serving in one glaze run, so the three bowls actually match instead of being assembled from different batches after the fact.",
          "Each bowl is finished with a wax-resist rim, so the unglazed edge sits flush on the table and won't scratch a wood surface the way a fully glazed foot ring can.",
        ],
        base: 78.00, cost: 33.54, sale: null, stock: 19, low: 6, weight: 3.2, dims: [9, 9, 5],
        tags: ['bowls', 'ceramic', 'set'], featured: false },
      { slug: 'amber-fields-candle', sku: 'FWG-CND-2004', name: 'Amber Fields Soy Candle', category: 'candles-fragrance',
        short: 'A single-wick soy candle in amber, cedar and a little black pepper. Burns about 45 hours.',
        long: [
          "Amber Fields is our best-selling scent for a reason — warm without being sweet, and it doesn't turn cloying halfway through the jar the way a lot of amber candles do.",
          "100% soy wax, cotton wick, poured into a reusable glass jar with the label printed in-house. Trim the wick to a quarter inch before each burn and you'll get the full 45 hours out of it.",
        ],
        base: 32.00, cost: 12.80, sale: 26.00, stock: 47, low: 8, weight: 0.85, dims: [3.2, 3.2, 3.6],
        tags: ['candle', 'soy', 'home-fragrance'], featured: true },
      { slug: 'orchard-candle-trio', sku: 'FWG-CND-2005', name: 'Orchard Candle Trio', category: 'candles-fragrance',
        short: 'Three 4oz candles — apple, fig and spiced pear — sized for testing scents before committing to a full jar.',
        long: [
          "The Orchard trio is how most people find their favorite Fernwood scent. Each jar is a quarter of our standard size, enough for about 15 hours of burn time, which is plenty to decide whether fig belongs on your shelf permanently.",
          "All three are soy wax with cotton wicks, and the tin they ship in doubles as a small catch-all once the candles are gone.",
        ],
        base: 54.00, cost: 21.60, sale: null, stock: 22, low: 6, weight: 1.3, dims: [7, 3, 3.2],
        tags: ['candle', 'gift-set', 'soy'], featured: false },
      { slug: 'harvest-woven-tote', sku: 'FWG-TEX-2006', name: 'Harvest Woven Tote', category: 'textiles-bags',
        short: 'A market tote hand-loomed from cotton and jute, sturdy enough for actual groceries.',
        long: [
          "This isn't a decorative tote — the jute base and cotton weave are rated to carry real weight, and we've tested it with two full grocery bags' worth without the seams complaining.",
          "The handles are long enough to go over a shoulder, and the open weave means it folds flat for storage instead of taking up a drawer.",
        ],
        base: 46.00, cost: 21.16, sale: null, stock: 0, low: 6, weight: 0.7, dims: [15, 14, 4],
        tags: ['tote', 'bag', 'woven'], featured: true },
      { slug: 'cabin-wool-throw', sku: 'FWG-TEX-2007', name: 'Cabin Wool Throw', category: 'textiles-bags',
        short: 'A 50x60 lambswool throw, woven on a floor loom in a three-color stripe pattern.',
        long: [
          "Cabin is woven from lambswool on a floor loom, in three colorways that rotate with the seasons. It's substantial — closer to a blanket than a scarf-weight throw — and holds up to years of actual couch use.",
          "Hand wash cold or dry clean; lambswool is more forgiving than merino but still isn't a machine-wash-and-forget fabric.",
        ],
        base: 98.00, cost: 47.04, sale: 82.00, stock: 16, low: 6, weight: 2.6, dims: [20, 14, 4],
        tags: ['throw', 'wool', 'textile'], featured: true },
      { slug: 'market-linen-apron', sku: 'FWG-TEX-2008', name: 'Market Linen Apron', category: 'textiles-bags',
        short: 'A cross-back linen apron with one deep pocket, cut generously enough to actually protect your clothes.',
        long: [
          "The cross-back straps mean this apron stays put without a neck loop cutting into you after an hour of standing at the counter. Heavyweight linen softens with every wash instead of wearing thin.",
          "One deep front pocket holds a phone and a pair of kitchen shears at the same time, which we only realized was a selling point after enough customers told us so.",
        ],
        base: 42.00, cost: 18.48, sale: null, stock: 29, low: 6, weight: 0.6, dims: [12, 16, 1],
        tags: ['apron', 'linen', 'kitchen'], featured: false },
      { slug: 'driftwood-macrame-hanging', sku: 'FWG-TEX-2009', name: 'Driftwood Macrame Hanging', category: 'textiles-bags',
        short: 'A knotted cotton-cord wall hanging on a foraged driftwood dowel, about 22 inches long.',
        long: [
          "Each dowel is foraged, not milled, so the wood grain and curve are different on every piece — you're choosing a specific dowel, not a style number.",
          "The cord is 100% cotton, knotted in a diamond lattice pattern that holds its shape without a spray-on stiffener. Comes with a hanging loop already attached.",
        ],
        base: 58.00, cost: 23.78, sale: 46.00, stock: 4, low: 5, weight: 1.1, dims: [14, 2, 22],
        tags: ['macrame', 'wall-decor', 'handmade'], featured: false },
      { slug: 'maple-cutting-board', sku: 'FWG-WD-2010', name: 'Maple End-Grain Cutting Board', category: 'wood-leather',
        short: "An end-grain maple board that's easier on knife edges than a face-grain board twice its price.",
        long: [
          "End-grain construction means the wood fibers face up, so a knife edge slides between them instead of across them — it's genuinely easier on your knives, not just a marketing distinction.",
          "Finished with food-safe mineral oil and beeswax. Hand wash and re-oil monthly and it'll outlast the knives you're using on it.",
        ],
        base: 54.00, cost: 24.30, sale: null, stock: 12, low: 6, weight: 2.8, dims: [16, 8, 1],
        tags: ['cutting-board', 'maple', 'kitchen'], featured: false },
      { slug: 'fieldnote-leather-journal', sku: 'FWG-WD-2011', name: 'Fieldnote Leather Journal', category: 'wood-leather',
        short: 'A refillable leather journal with 160 pages of Italian paper and a brass closure.',
        long: [
          "The vegetable-tanned cover develops a patina with handling — the one on the shelf sample looks nothing like the one that shipped a year ago, and that's the point.",
          "Pages are removable and replaceable, so the journal itself lasts well past any single 160-page notebook. The paper takes fountain pen ink without much bleed-through.",
        ],
        base: 36.00, cost: 15.48, sale: 29.00, stock: 26, low: 6, weight: 0.7, dims: [8.5, 6, 1],
        tags: ['journal', 'leather', 'stationery'], featured: false },
      { slug: 'birchwood-spoon-set', sku: 'FWG-WD-2012', name: 'Birchwood Spoon Set (3)', category: 'wood-leather',
        short: 'Three hand-carved birchwood cooking spoons in different profiles — stirring, serving, and a slotted spoon.',
        long: [
          "Each spoon is carved from a single piece of birch, no glued laminations to eventually split. The slotted spoon's holes are burned through, not drilled, which leaves a smoother edge against a pan.",
          "Birch is dense enough to resist warping near heat but still light in the hand. Wipe clean and oil occasionally; don't run these through the dishwasher.",
        ],
        base: 34.00, cost: 13.94, sale: null, stock: 31, low: 6, weight: 0.5, dims: [12, 4, 1],
        tags: ['spoons', 'wood', 'kitchen'], featured: false },
    ],
    coupons: [
      { code: 'HANDMADE15', name: 'Artisan Special', description: '15% off all handmade items.', type: 'percentage', value: 15, min: null, usageLimit: null, perCustomer: 2 },
      { code: 'POTTERY10', name: 'Pottery Sale', description: '10% off pottery and ceramics.', type: 'percentage', value: 10, min: null, usageLimit: 100, perCustomer: 1, categorySlug: 'pottery-ceramics' },
    ],
    blog: [
      { slug: 'a-day-in-the-studio-hearth-mug', title: 'A Day in the Studio: How a Hearth Mug Gets Made', category: 'Behind the Work', tags: ['pottery', 'process', 'studio'],
        excerpt: "From a lump of stoneware to a glazed mug is about a two-week process, most of it waiting on a kiln.",
        content: [
          "Priya throws mugs on Tuesdays and Thursdays, twenty to twenty-five a session, each one shaped by hand on the wheel in about four minutes once the clay is centered. What looks fast is actually the easy part.",
          "The greenware dries for a week before a first bisque fire, gets glazed by hand — dipped, not sprayed — and goes back in for a second firing at cone 6. That's roughly two weeks from wet clay to a mug that can go in a dishwasher.",
          "We could speed this up with slip casting and a mold. We haven't, because a mold mug and a thrown mug don't feel the same in your hand, and that difference is the entire point of buying from a studio instead of a catalog.",
        ] },
      { slug: 'caring-for-handmade-ceramics', title: 'Caring for Handmade Ceramics (So They Actually Last)', category: 'Care Guides', tags: ['ceramics', 'care'],
        excerpt: "Stoneware is tougher than it looks, but a few habits will double the life of anything glazed by hand.",
        content: [
          "Everything we sell is fired to cone 6, which means it's fully vitrified and safe for a dishwasher and microwave. That said, hand washing extends the life of a hand-painted glaze, especially anything with metallic or crackle finishes.",
          "Avoid extreme temperature swings — don't pour boiling water into a mug straight from the fridge. Stoneware can handle heat, but thermal shock is still thermal shock.",
          "If a glaze ever develops a hairline crack, it's almost always cosmetic (a 'crazing' pattern in the glaze layer, not the clay body underneath) and doesn't affect food safety. If you're ever unsure, email us a photo.",
        ] },
      { slug: 'why-we-only-use-soy-wax', title: 'Why We Only Use Soy Wax', category: 'Behind the Work', tags: ['candles', 'materials'],
        excerpt: "Paraffin burns hotter and throws scent faster. We use soy anyway, for reasons that show up months later, not on day one.",
        content: [
          "Soy wax burns at a lower, more even temperature than paraffin, which means a longer burn time from the same size jar and a cleaner burn with less soot buildup on the glass.",
          "It's also a renewable, biodegradable crop-based wax rather than a petroleum byproduct, which matters to us even though it doesn't show up anywhere on the label. The jars are reusable once the wax is gone — we've had customers turn them into pen cups for years.",
        ] },
    ],
  },
  {
    id: '650e8400-e29b-41d4-a716-446655440003',
    ownerId: USERS[2].id,
    slug: 'fitness-pro',
    name: 'Ironline Fitness',
    tagline: 'Train hard, ship fast.',
    description: 'Commercial-grade strength and recovery equipment, sized and priced for a home gym.',
    heroTitle: 'Equipment that earns its floor space',
    heroDescription: 'Every bench, bar and plate here is rated for daily commercial use. Order before 2pm and it ships the same day from our Ohio warehouse.',
    metaTitle: 'Ironline Fitness — Home Gym Equipment That Ships Fast',
    metaDescription: 'Dumbbells, kettlebells, benches and recovery gear built for daily use. Same-day shipping, extended warranty on strength equipment.',
    themeName: 'teal',
    skuPrefix: 'IFT',
    shippingFreeThreshold: 100,
    shippingFlatRate: 14.99,
    extraConfig: { assembly_service: ['true', 'boolean'], warranty_extended: ['true', 'boolean'] },
    categories: [
      { slug: 'strength-training', name: 'Strength Training', description: 'Dumbbells, kettlebells, benches and load.' },
      { slug: 'cardio-recovery', name: 'Cardio & Recovery', description: 'Mats, ropes, rollers and bands.' },
      { slug: 'hydration-bags', name: 'Hydration & Bags', description: 'Bottles, shakers and gym bags.' },
      { slug: 'accessories', name: 'Accessories', description: 'The rest of the gym bag.' },
    ],
    products: [
      { slug: 'ironline-adjustable-dumbbell', sku: 'IFT-STR-3001', name: 'Ironline Adjustable Dumbbell (Pair)', category: 'strength-training',
        short: 'A pair of dumbbells that adjust from 10 to 50 lbs each in 5-lb increments, replacing a full rack.',
        long: [
          "Twist the dial, lift, and the plates you don't need stay in the tray — no separate weight plates to lose track of, and no rack taking up a corner of the room.",
          "The adjustment mechanism is rated for 15,000 cycles in testing, and the knurled steel handle stays put even with sweaty hands. Sold as a pair; each dumbbell adjusts independently.",
        ],
        base: 249.00, cost: 139.44, sale: 219.00, stock: 18, low: 5, weight: 52, dims: [16, 8, 8],
        tags: ['dumbbell', 'strength', 'adjustable'], featured: true },
      { slug: 'anchor-kettlebell', sku: 'IFT-STR-3002', name: 'Anchor Cast-Iron Kettlebell', category: 'strength-training',
        short: 'A single-cast kettlebell with a wide, flat base and a handle wide enough for a two-handed grip.',
        long: [
          "Cast in one piece — no seam to catch a callus on — with a powder-coat finish that holds up to being dropped on concrete, which kettlebells eventually are.",
          "The flat base means it sits upright between sets instead of rolling, and the handle is wide enough for swings, goblet squats and two-handed work without your knuckles hitting the bell.",
        ],
        base: 89.00, cost: 51.62, sale: null, stock: 22, low: 6, weight: 35, dims: [10, 8, 11],
        tags: ['kettlebell', 'strength', 'cast-iron'], featured: true },
      { slug: 'bench-press-incline-bench', sku: 'IFT-STR-3003', name: 'Ironline Adjustable Bench', category: 'strength-training',
        short: 'A flat-to-incline bench rated for 600 lbs, with seven back positions and a stable footprint.',
        long: [
          "Seven back positions go from flat to an 85-degree incline, with a pin-and-pop adjustment that doesn't loosen over months of use the way some cheaper hinge mechanisms do.",
          "The frame is rated to 600 lbs combined load, and the wider-than-usual base means it doesn't rock when you're unracking a heavy dumbbell press.",
        ],
        base: 219.00, cost: 118.26, sale: 189.00, stock: 2, low: 4, weight: 38, dims: [44, 22, 18],
        tags: ['bench', 'strength', 'home-gym'], featured: false },
      { slug: 'tempo-ankle-weights', sku: 'IFT-STR-3004', name: 'Tempo Ankle Weights (Pair)', category: 'strength-training',
        short: 'Adjustable ankle weights from 1 to 5 lbs each, for slowing down bodyweight work on purpose.',
        long: [
          "Five removable 1-lb sandbags per weight mean you can dial in exactly how much resistance to add to leg raises, donkey kicks or a slow walk, instead of committing to a fixed weight.",
          "The strap is neoprene-lined and wide enough not to dig into the ankle bone, with a hook-and-loop closure that stays put through a full set.",
        ],
        base: 39.00, cost: 19.50, sale: null, stock: 5, low: 5, weight: 5, dims: [10, 6, 3],
        tags: ['ankle-weights', 'strength', 'accessories'], featured: false },
      { slug: 'tracline-yoga-mat', sku: 'IFT-CDO-3005', name: 'Tracline Yoga Mat', category: 'cardio-recovery',
        short: 'A 5mm natural rubber mat with a textured surface that actually grips through a sweaty flow.',
        long: [
          "Most yoga mats get slippery right when you need grip most — twenty minutes into a hot flow. Tracline's natural rubber base and textured top layer are built specifically to hold traction as you sweat, not despite it.",
          "5mm thickness cushions knees on a hard floor without sacrificing balance on standing poses. Closed-cell construction means it won't absorb sweat or odor the way open-cell foam mats do over time.",
        ],
        base: 68.00, cost: 31.28, sale: 54.00, stock: 41, low: 8, weight: 2.6, dims: [24, 5, 5],
        tags: ['yoga', 'mat', 'recovery'], featured: true },
      { slug: 'speedcoil-jump-rope', sku: 'IFT-CDO-3006', name: 'Speedcoil Jump Rope', category: 'cardio-recovery',
        short: 'A ball-bearing speed rope with a steel cable core, adjustable to any height without cutting the cord.',
        long: [
          "Ball bearings in each handle let the cable spin independently of your grip, which is the difference between a rope that keeps up with double-unders and one that doesn't.",
          "The steel cable is coated in PVC to protect floors, and the length adjusts with a simple screw mechanism — no cutting and re-capping the cable to size it.",
        ],
        base: 24.00, cost: 10.08, sale: null, stock: 55, low: 8, weight: 0.4, dims: [10, 4, 2],
        tags: ['jump-rope', 'cardio', 'conditioning'], featured: false },
      { slug: 'corestrike-foam-roller', sku: 'IFT-CDO-3007', name: 'Corestrike Textured Foam Roller', category: 'cardio-recovery',
        short: 'A high-density foam roller with a textured surface that mimics a deep-tissue massage.',
        long: [
          "The textured ridges apply more targeted pressure than a smooth roller, closer to what a foam-roller skeptic expects a massage therapist's thumbs to feel like.",
          "High-density EPP foam holds its shape through daily use and won't compress into a soft, useless cylinder after a few months, which is the usual failure point for cheaper rollers.",
        ],
        base: 34.00, cost: 14.96, sale: 28.00, stock: 37, low: 8, weight: 1.3, dims: [18, 6, 6],
        tags: ['foam-roller', 'recovery', 'mobility'], featured: false },
      { slug: 'looplevel-resistance-bands', sku: 'IFT-CDO-3008', name: 'Looplevel Resistance Band Set', category: 'cardio-recovery',
        short: "Three fabric resistance loop bands — light, medium, heavy — that don't roll or snap the way rubber bands do.",
        long: [
          "Fabric bands grip the skin instead of rolling up mid-set, and they don't develop the small tears that eventually make rubber loop bands snap without warning.",
          "The three-band set covers warmups, glute activation and banded squats without needing to buy a wider range separately. A mesh bag is included for the gym bag.",
        ],
        base: 44.00, cost: 17.60, sale: null, stock: 29, low: 6, weight: 1.1, dims: [10, 8, 3],
        tags: ['resistance-bands', 'recovery', 'accessories'], featured: false },
      { slug: 'summit-water-bottle', sku: 'IFT-HYD-3009', name: 'Summit Insulated Water Bottle', category: 'hydration-bags',
        short: 'A 32oz insulated bottle that keeps water cold for 24 hours, even left in a hot car.',
        long: [
          "Double-wall vacuum insulation keeps water cold for 24 hours and hot drinks warm for 12, tested in an actual closed car in July, not just a lab spec sheet.",
          "The powder-coat finish resists the scratches and dents that a bare steel bottle picks up in a gym bag within a week, and the wide mouth fits standard ice cubes.",
        ],
        base: 32.00, cost: 15.36, sale: null, stock: 63, low: 8, weight: 0.9, dims: [4, 4, 10],
        tags: ['water-bottle', 'hydration', 'insulated'], featured: false },
      { slug: 'shakerline-protein-shaker', sku: 'IFT-HYD-3010', name: 'Shakerline Protein Shaker', category: 'hydration-bags',
        short: 'A 24oz shaker bottle with a wire whisk ball that actually breaks up protein powder clumps.',
        long: [
          "The stainless wire whisk ball does the job a lot of shaker bottles claim to do with just ridges molded into the plastic — no clumps left at the bottom after one shake.",
          "A screw-top lid with a silicone gasket means it doesn't leak in a gym bag, and the measurement markings on the side are still legible after a year of dishwasher cycles.",
        ],
        base: 18.00, cost: 7.92, sale: 14.00, stock: 74, low: 10, weight: 0.4, dims: [3.5, 3.5, 8],
        tags: ['shaker', 'hydration', 'accessories'], featured: false },
      { slug: 'trailhead-duffel-bag', sku: 'IFT-HYD-3011', name: 'Trailhead Gym Duffel', category: 'hydration-bags',
        short: "A 40L duffel with a separate vented shoe compartment, so gym clothes don't end up smelling like gym shoes.",
        long: [
          "The bottom compartment is vented and separate from the main pack, built specifically to keep sweaty shoes from turning the rest of the bag into a problem by the time you get home.",
          "1000-denier fabric shrugs off gym floors and gravel parking lots, and the strap is padded enough to carry over one shoulder for more than the walk to the car.",
        ],
        base: 74.00, cost: 34.04, sale: 62.00, stock: 24, low: 6, weight: 1.6, dims: [24, 12, 12],
        tags: ['duffel', 'bag', 'gym'], featured: true },
      { slug: 'thresh-pull-up-bar', sku: 'IFT-ACC-3012', name: 'Thresh Doorway Pull-Up Bar', category: 'accessories',
        short: 'A no-screw doorway pull-up bar rated for 300 lbs, that comes down in ten seconds when you\'re done.',
        long: [
          "Thresh wedges into a standard doorframe using leverage, not screws, so it comes down in ten seconds and doesn't leave holes in a rental apartment's trim.",
          "Rated to 300 lbs with four grip positions — wide, narrow and two neutral holds — for pull-ups, chin-ups and hanging leg raises. Currently back-ordered; the next container lands in about three weeks.",
        ],
        base: 59.00, cost: 30.68, sale: null, stock: 0, low: 5, weight: 8, dims: [38, 6, 6],
        tags: ['pull-up-bar', 'doorway', 'accessories'], featured: false },
    ],
    coupons: [
      { code: 'TRAINHARD20', name: 'Train Hard Sale', description: '20% off orders over $100, up to $60 off.', type: 'percentage', value: 20, min: 100, maxDiscount: 60, usageLimit: 150, perCustomer: 1 },
      { code: 'SHIP5', name: 'Ship It', description: '$5 off any order.', type: 'fixed_amount', value: 5, min: 25, usageLimit: null, perCustomer: 3 },
    ],
    blog: [
      { slug: 'building-a-home-gym-in-30-square-feet', title: 'Building a Home Gym in 30 Square Feet', category: 'Home Gym', tags: ['home-gym', 'setup'],
        excerpt: "You don't need a garage. You need a corner, a mat, and about $400 of equipment that actually gets used.",
        content: [
          "The equipment that gets used is the equipment you don't have to set up. An adjustable dumbbell pair and a kettlebell cover most strength work without a rack. A yoga mat and a foam roller cover the rest.",
          "Wall-mount what you can. A pull-up bar in a doorway takes zero floor space and gets used more than almost anything else we sell, mostly because it's already in the way of your daily walk to the kitchen.",
          "Total footprint for a genuinely complete setup: about 30 square feet, most of which is the bench, and the bench folds.",
        ] },
      { slug: 'kettlebell-basics-three-moves', title: 'Kettlebell Basics: Three Moves Worth Mastering', category: 'Training', tags: ['kettlebell', 'training'],
        excerpt: "The swing, the goblet squat, and the Turkish get-up cover more than most 45-minute gym routines.",
        content: [
          "The kettlebell swing trains hip hinge power better than almost anything else in a home gym, and it does it in a movement pattern that transfers directly to picking things up off the floor for the rest of your life.",
          "The goblet squat fixes more bad squat form than a mirror ever will, because holding the weight at your chest forces an upright torso automatically.",
          "The Turkish get-up is slower, more technical, and worth learning from a video with a coach's voice on it before you load real weight. Get those three right and you don't need a fourth for a long time.",
        ] },
      { slug: 'recovery-isnt-optional', title: "Recovery Isn't Optional", category: 'Recovery', tags: ['recovery', 'mobility'],
        excerpt: "The workout is the easy part to remember. Here's a ten-minute roller routine most people skip.",
        content: [
          "Foam rolling before a workout increases range of motion without the strength loss that static stretching can cause pre-lift. After a workout, it's about circulation and breaking up the stiffness that turns into next-day soreness.",
          "Ten minutes, quads to calves to upper back, done slowly — not the thirty-second scroll-through-your-phone version. It's the least exciting piece of equipment we sell and probably the one that prevents the most missed workouts.",
        ] },
    ],
  },
];

// ---------------------------------------------------------------------------
// Shared demo data: customers, visitor traffic, search terms
// ---------------------------------------------------------------------------
const CUSTOMERS = [
  { first: 'John', last: 'Doe', email: 'john.doe@example.com', city: 'Anytown', state: 'CA', zip: '90210' },
  { first: 'Jane', last: 'Smith', email: 'jane.smith@example.com', city: 'Springfield', state: 'IL', zip: '62701' },
  { first: 'Alice', last: 'Johnson', email: 'alice.johnson@example.com', city: 'Portland', state: 'OR', zip: '97201' },
  { first: 'Marcus', last: 'Lee', email: 'marcus.lee@example.com', city: 'Austin', state: 'TX', zip: '73301' },
  { first: 'Priya', last: 'Nair', email: 'priya.nair@example.com', city: 'Seattle', state: 'WA', zip: '98101' },
  { first: 'Carlos', last: 'Reyes', email: 'carlos.reyes@example.com', city: 'Denver', state: 'CO', zip: '80202' },
  { first: 'Emma', last: 'Wilson', email: 'emma.wilson@example.com', city: 'Boston', state: 'MA', zip: '02108' },
  { first: 'Noah', last: 'Kim', email: 'noah.kim@example.com', city: 'Chicago', state: 'IL', zip: '60601' },
  { first: 'Olivia', last: 'Brown', email: 'olivia.brown@example.com', city: 'Nashville', state: 'TN', zip: '37201' },
  { first: 'Ethan', last: 'Garcia', email: 'ethan.garcia@example.com', city: 'Phoenix', state: 'AZ', zip: '85001' },
  { first: 'Sophia', last: 'Martin', email: 'sophia.martin@example.com', city: 'Raleigh', state: 'NC', zip: '27601' },
  { first: 'Liam', last: 'Chen', email: 'liam.chen@example.com', city: 'San Diego', state: 'CA', zip: '92101' },
  { first: 'Ava', last: 'Patel', email: 'ava.patel@example.com', city: 'Minneapolis', state: 'MN', zip: '55401' },
  { first: 'Mason', last: 'Clark', email: 'mason.clark@example.com', city: 'Atlanta', state: 'GA', zip: '30301' },
];

const REFERRERS = [null, null, 'https://www.google.com/search', 'https://www.instagram.com/', 'https://www.facebook.com/', 'https://www.pinterest.com/', 'https://www.tiktok.com/', 'https://www.reddit.com/'];
const IP_POOLS = ['203.0.113', '198.51.100', '192.0.2'];

const SEARCH_TERMS = {
  'demo-electronics': ['headphones', 'wireless mouse', 'usb hub', 'smart speaker', 'desk lamp', 'power bank', 'smartwatch', 'earbuds', 'mechanical keyboard', 'webcam'],
  'artisan-craft': ['ceramic mug', 'soy candle', 'wool throw', 'tote bag', 'cutting board', 'macrame', 'leather journal', 'pottery', 'candle gift set'],
  'fitness-pro': ['dumbbells', 'kettlebell', 'yoga mat', 'resistance bands', 'gym bag', 'protein shaker', 'pull up bar', 'foam roller', 'ankle weights'],
};

const PAGE_PATHS = (slug, productSlugs) => [
  '/', '/', `/store/${slug}`, `/store/${slug}#products`,
  ...productSlugs.map((p) => `/store/${slug}/product/${p}`),
  `/store/${slug}/cart`,
];

// ---------------------------------------------------------------------------
// SQL literal helpers (used both for live parameterized inserts and for the
// generated database/seeds/development.sql snapshot)
// ---------------------------------------------------------------------------
function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "'{}'";
    const isUuidArray = value.every((v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
    return `ARRAY[${value.map((v) => sqlLiteral(v)).join(', ')}]${isUuidArray ? '::uuid[]' : ''}`;
  }
  if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ---------------------------------------------------------------------------
// Storefront click history (demo data)
//
// The platform operator console at /platform charts buyer traffic out of
// `storefront_click_events` and its trigger-maintained rollup
// `storefront_click_daily`. With an empty table those screens render zeroes,
// which is honest but tells a developer nothing about whether they work, so the
// demo stores get six weeks of plausible traffic.
//
// Three rules this generator holds to:
//
//   1. **Obviously demo.** Every row carries a `demo-visitor-*` / `demo-sess-*`
//      identity and a `(demo-seed)` user agent. Nothing here should ever be
//      mistaken for a real shopper, in a database or in a dashboard.
//   2. **Idempotent.** It writes nothing conditional and cleans nothing up on
//      its own: `seed()` wipes both click tables for these three stores before
//      any of this runs, so a second run replaces rather than accumulates. The
//      counts are also deterministic, because the generator draws from its own
//      seeded PRNG rather than the shared one -- so re-running produces the same
//      numbers, not merely the same order of magnitude.
//   3. **Shaped like real traffic.** Weekends are quieter than weekdays, the
//      recent weeks are busier than the older ones, and the event mix is a
//      funnel: many views, fewer product views, fewer carts, fewer checkouts.
//      Clicks outnumber orders by roughly two orders of magnitude, which is what
//      a real storefront looks like and what makes the console's conversion
//      percentages land in a believable range.
// ---------------------------------------------------------------------------

// A separate PRNG instance, deliberately. Drawing from the shared `rng` would
// shift every subsequent draw and silently regenerate the catalogue, orders and
// blog posts of every store seeded after the first.
const clickRng = mulberry32(20260821);
const clickPick = (arr) => arr[Math.floor(clickRng() * arr.length)];
const clickInt = (min, max) => Math.floor(clickRng() * (max - min + 1)) + min;
const clickChance = (p) => clickRng() < p;

/** How many weeks of history to generate. Enough to fill a 30-day window and its comparison. */
const CLICK_DAYS = 45;

/** Referrer hosts as the events table stores them: host only, no scheme, no `www.`. */
const CLICK_REFERRERS = [
  [null, 34], ['google.com', 22], ['instagram.com', 12], ['facebook.com', 8],
  ['pinterest.com', 5], ['tiktok.com', 5], ['reddit.com', 4], ['bing.com', 3],
  ['news.ycombinator.com', 2], ['duckduckgo.com', 2],
];

/** Paid/social campaigns, attached to the referrers that plausibly carry them. */
const CLICK_CAMPAIGNS = [
  { source: 'instagram', medium: 'social', campaign: 'spring-drop' },
  { source: 'facebook', medium: 'cpc', campaign: 'retargeting-q3' },
  { source: 'google', medium: 'cpc', campaign: 'brand-search' },
  { source: 'newsletter', medium: 'email', campaign: 'weekly-digest' },
  { source: 'tiktok', medium: 'social', campaign: 'creator-collab' },
];

/** Device mix, roughly matching what a small DTC storefront sees. `bot` never appears: crawlers are dropped at the API, not stored. */
const CLICK_DEVICES = [['mobile', 52], ['desktop', 40], ['tablet', 8]];

/** Where the traffic comes from. Weighted towards the US, with enough variety to exercise a breakdown. */
const CLICK_COUNTRIES = [['US', 70], ['CA', 10], ['GB', 8], ['AU', 5], ['DE', 4], ['IE', 3]];

/**
 * Weighted pick from `[value, weight]` pairs using the click PRNG.
 *
 * @param {Array<[any, number]>} pairs - Value/weight pairs
 * @returns {any} One value
 */
function clickWeighted(pairs) {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let r = clickRng() * total;
  for (const [value, weight] of pairs) {
    if ((r -= weight) <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

/**
 * A salted SHA-256 over a documentation-range address, matching what the API writes.
 *
 * The addresses are from RFC 5737's TEST-NET blocks and belong to nobody. Hashing them anyway
 * keeps the column's shape honest: `ip_hash` is CHAR(64) and every consumer may assume it.
 *
 * @returns {string} 64 hex characters
 */
function demoIpHash() {
  const ip = `${clickPick(IP_POOLS)}.${clickInt(1, 254)}`;
  return crypto.createHash('sha256').update(`demo-seed:${ip}`).digest('hex');
}

/**
 * A timestamp inside a given day, skewed towards shopping hours.
 *
 * @param {number} daysBack - How many days before today
 * @returns {Date} A UTC timestamp within that day
 */
function clickMoment(daysBack) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  // Two humps: a lunchtime one and a larger evening one.
  const hour = clickChance(0.35) ? clickInt(10, 14) : clickInt(17, 23);
  d.setUTCHours(hour, clickInt(0, 59), clickInt(0, 59), 0);
  return d;
}

/**
 * Generate and insert six weeks of buyer click history for one demo store.
 *
 * Rows are written in batches rather than one statement per event: a storefront's traffic is
 * thousands of rows per store, and a round trip each would make `npm run db:seed-demo` noticeably
 * slower for data nobody waits on. The AFTER INSERT trigger still fires per row, so
 * `storefront_click_daily` comes out correct without this function ever touching it.
 *
 * @param {import('pg').PoolClient} client - The transaction the seed is running in
 * @param {{ id: string, slug: string, name: string }} store - The store to generate traffic for
 * @param {number} storeIndex - Position in STORES; scales one store busier than another
 * @param {Array<{ id: string, slug: string }>} products - The store's products, for product_view rows
 * @returns {Promise<number>} How many events were written
 */
async function seedStorefrontClicks(client, store, storeIndex, products) {
  const base = `/store/${store.slug}`;
  const productPaths = products.map((p) => ({ id: p.id, path: `${base}/product/${p.slug}` }));
  const browsePaths = [base, base, `${base}/products`, `${base}/products?sort=newest`];

  // Store 1 is the busy flagship, store 3 the quiet newcomer.
  const scale = [1, 0.7, 0.45][storeIndex] ?? 0.5;

  // A returning-visitor pool, sized with the store's traffic so the busiest shop also has the most
  // distinct people. Reusing ids across days is what makes "unique visitors" a smaller number than
  // "clicks", which is the whole reason the console reports both.
  const visitorPool = Array.from(
    { length: Math.round(320 * scale) },
    (unused, i) => `demo-visitor-${storeIndex + 1}-${String(i).padStart(4, '0')}`,
  );
  const rows = [];
  let sessionCounter = 0;

  for (let daysBack = CLICK_DAYS - 1; daysBack >= 0; daysBack--) {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - daysBack);
    const weekday = day.getUTCDay();
    const weekendFactor = weekday === 0 || weekday === 6 ? 0.62 : 1;
    // A gentle upward trend, so the console's "vs previous period" arrow has something to point at.
    const trendFactor = 0.7 + 0.6 * ((CLICK_DAYS - daysBack) / CLICK_DAYS);
    const sessions = Math.max(
      1,
      Math.round(clickInt(14, 26) * scale * weekendFactor * trendFactor),
    );

    for (let s = 0; s < sessions; s++) {
      const visitorId = clickPick(visitorPool);
      const sessionId = `demo-sess-${storeIndex + 1}-${String(sessionCounter++).padStart(6, '0')}`;
      const device = clickWeighted(CLICK_DEVICES);
      const country = clickWeighted(CLICK_COUNTRIES);
      const referrer = clickWeighted(CLICK_REFERRERS);
      // Campaigns arrive with a referrer, never on a direct visit.
      const campaign = referrer && clickChance(0.28) ? clickPick(CLICK_CAMPAIGNS) : null;
      const occurred = clickMoment(daysBack);

      /**
       * Queue one event for this session.
       *
       * @param {string} eventType - One of the five types the CHECK constraint allows
       * @param {string} pagePath - The path the shopper was on
       * @param {string|null} productId - The product, for product-scoped events
       * @param {number} minuteOffset - Minutes after the session started
       */
      const push = (eventType, pagePath, productId, minuteOffset) => {
        rows.push([
          store.id,
          new Date(occurred.getTime() + minuteOffset * 60000),
          eventType,
          pagePath,
          productId,
          visitorId,
          sessionId,
          referrer,
          campaign ? campaign.source : null,
          campaign ? campaign.medium : null,
          campaign ? campaign.campaign : null,
          country,
          device,
          demoIpHash(),
          `Mozilla/5.0 (demo-seed; ${device})`,
        ]);
      };

      // Every session starts with at least one storefront view.
      let minute = 0;
      const browseCount = clickWeighted([[1, 6], [2, 4], [3, 2], [4, 1]]);
      for (let b = 0; b < browseCount; b++) {
        push('storefront_view', clickPick(browsePaths), null, minute);
        minute += clickInt(1, 4);
      }

      // ... which becomes a funnel for the fraction of sessions that keep going.
      if (productPaths.length > 0 && clickChance(0.58)) {
        const viewCount = clickWeighted([[1, 6], [2, 3], [3, 1]]);
        let lastProduct = null;
        for (let v = 0; v < viewCount; v++) {
          lastProduct = clickPick(productPaths);
          push('product_view', lastProduct.path, lastProduct.id, minute);
          minute += clickInt(1, 5);
        }

        if (lastProduct && clickChance(0.22)) {
          push('add_to_cart', lastProduct.path, lastProduct.id, minute);
          minute += clickInt(1, 3);
          push('storefront_view', `${base}/cart`, null, minute);
          minute += clickInt(1, 3);

          if (clickChance(0.42)) {
            push('checkout_start', `${base}/checkout`, null, minute);
          }
        }
      }

      // A trickle of traffic sent from the platform's own marketing surfaces.
      if (clickChance(0.03)) push('outbound_click', base, null, minute + 1);
    }
  }

  // 15 columns * 400 rows = 6,000 parameters, comfortably inside Postgres's 65,535 limit.
  const CHUNK = 400;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = chunk
      .map((unusedRow, r) => `(${Array.from({ length: 15 }, (unusedCol, c) => `$${r * 15 + c + 1}`).join(',')})`)
      .join(',');
    await client.query(
      `INSERT INTO public.storefront_click_events
         (store_id, occurred_at, event_type, path, product_id, visitor_id, session_id,
          referrer_domain, utm_source, utm_medium, utm_campaign, country, device, ip_hash, user_agent)
       VALUES ${values}`,
      chunk.flat(),
    );
  }

  return rows.length;
}

// ---------------------------------------------------------------------------
// Main seed routine
// ---------------------------------------------------------------------------
async function seed() {
  const client = await pool.connect();
  const storeIds = STORES.map((s) => s.id);
  const userIds = USERS.map((u) => u.id);

  try {
    await client.query('BEGIN');

    // ---- Scoped wipe: only rows belonging to these 3 demo stores/users ----
    const scopedTables = [
      'coupon_usage', 'order_items', 'orders', 'inventory_logs', 'inventory',
      'page_analytics', 'visitors', 'search_tracking', 'blog_posts', 'coupons',
      // Both click tables are wiped here, and that is what makes the click seed
      // idempotent: storefront_click_daily is maintained by an AFTER INSERT
      // trigger, so clearing the events alone would leave the rollup holding
      // counts for rows that no longer exist, and every re-seed would add to it.
      'storefront_click_daily', 'storefront_click_events',
      'products', 'categories', 'store_config', 'store_analytics_summary',
      'store_integrations', 'sync_history',
    ];
    for (const table of scopedTables) {
      await client.query(`DELETE FROM public.${table} WHERE store_id = ANY($1::uuid[])`, [storeIds]);
    }
    await client.query('DELETE FROM public.stores WHERE id = ANY($1::uuid[])', [storeIds]);

    /*
     * Carry the platform-admin grant across the wipe.
     *
     * The demo users are deleted and recreated on every run, and `users.is_admin` defaults to
     * false -- so re-seeding silently revoked whatever `scripts/grant-admin.js` had granted, and
     * the /platform console started answering 403 to the account the README tells you to sign in
     * with. Re-granting here would be wrong (the migration is explicit that only a deliberate
     * write sets that flag); preserving what was already there is not a grant, it is the wipe
     * declining to take something with it.
     *
     * Guarded on the column existing, so the seed still runs against a database that predates
     * migration 040 instead of aborting its transaction on an unknown column.
     */
    const adminFlags = new Map();
    const hasIsAdmin = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'is_admin'`
    );
    if (hasIsAdmin.rows.length > 0) {
      const existing = await client.query(
        'SELECT id, is_admin FROM public.users WHERE id = ANY($1::uuid[])', [userIds]
      );
      for (const row of existing.rows) adminFlags.set(row.id, row.is_admin === true);
    }

    await client.query('DELETE FROM public.users WHERE id = ANY($1::uuid[])', [userIds]);

    // ---- Users ----
    // `created_at` is set explicitly rather than defaulted to now: a user row created after the
    // store it owns is impossible, and every "signups this month" or "time to first store" figure
    // computed from it comes out nonsense.
    for (const [index, u] of USERS.entries()) {
      const signedUpDaysAgo = (STORE_AGE_DAYS[index] ?? 90) + (OWNER_SIGNUP_LEAD_DAYS[index] ?? 5);
      await client.query(
        `INSERT INTO public.users (id, email, password_hash, first_name, last_name, email_verified, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, true, true, $6)`,
        [u.id, u.email, PASSWORD_HASH, u.first_name, u.last_name, daysAgo(signedUpDaysAgo, false)]
      );
      if (adminFlags.get(u.id) === true) {
        await client.query('UPDATE public.users SET is_admin = TRUE WHERE id = $1', [u.id]);
      }
    }

    for (const store of STORES) {
      // ---- Store (trigger auto-creates default store_config + "All Products" category) ----
      const storeIndex = STORES.indexOf(store);
      const storeCreatedAt = daysAgo(STORE_AGE_DAYS[storeIndex] ?? 120, false);
      await client.query(
        `INSERT INTO public.stores
           (id, owner_id, store_name, store_slug, store_description, hero_title, hero_description,
            theme_name, currency, is_active, is_public, allow_guest_checkout,
            meta_title, meta_description, logo_url, favicon_url, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'USD',true,true,true,$9,$10,$11,$11,$12)`,
        [store.id, store.ownerId, store.name, store.slug, store.description, store.heroTitle,
          store.heroDescription, store.themeName, store.metaTitle, store.metaDescription,
          `/demo/logo/${store.slug}.svg`, storeCreatedAt]
      );

      // Remove the trigger-created catch-all category -- we ship real ones.
      await client.query(`DELETE FROM public.categories WHERE store_id = $1 AND slug = 'all-products'`, [store.id]);

      // ---- store_config: hero art + tagline + shipping + brand extras ----
      const configRows = [
        ['hero_image_url', `/demo/hero/${store.slug}.svg`, 'string', 'Hero banner image', true],
        ['tagline', store.tagline, 'string', 'Short brand tagline', true],
        ['shipping_free_threshold', String(store.shippingFreeThreshold.toFixed(2)), 'number', 'Free shipping threshold', true],
        ['shipping_flat_rate', String(store.shippingFlatRate.toFixed(2)), 'number', 'Flat shipping rate under the free-shipping threshold', true],
        ['return_policy_days', '30', 'number', 'Return policy in days', true],
        ...Object.entries(store.extraConfig).map(([k, [v, t]]) => [k, v, t, null, true]),
      ];
      for (const [key, value, type, desc] of configRows) {
        await client.query(
          `INSERT INTO public.store_config (store_id, config_key, config_value, config_type, description, is_public)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (store_id, config_key) DO UPDATE SET config_value = EXCLUDED.config_value, updated_at = CURRENT_TIMESTAMP`,
          [store.id, key, value, type, desc, true]
        );
      }

      // ---- Categories ----
      const categoryIdBySlug = {};
      let sortOrder = 1;
      for (const cat of store.categories) {
        const res = await client.query(
          `INSERT INTO public.categories (store_id, name, slug, description, sort_order, is_active)
           VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
          [store.id, cat.name, cat.slug, cat.description, sortOrder++]
        );
        categoryIdBySlug[cat.slug] = res.rows[0].id;
      }

      // ---- Plan orders first (pure JS) so we know how many units of each
      //      product get "sold" -- then insert products with stock bumped
      //      up by that amount, so after order_item triggers run, the
      //      final stock_quantity lands exactly on our intended target. ----
      const soldByProduct = {};
      const orderPlan = buildOrderPlan(store, soldByProduct);

      // ---- Products (+ per-product inventory row) ----
      const productIdBySlug = {};
      for (const p of store.products) {
        const sold = soldByProduct[p.slug] || 0;
        const initialStock = p.stock + sold;
        const imagePath = `/demo/products/${p.slug}.svg`;
        const res = await client.query(
          `INSERT INTO public.products
             (store_id, sku, name, slug, short_description, long_description, base_price, sale_price, cost_price,
              track_inventory, stock_quantity, low_stock_threshold, allow_backorder,
              weight, weight_unit, length, width, height, dimension_unit,
              category_id, tags, featured_image_url, gallery_images,
              requires_shipping, is_active, is_featured, published_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11,false,
                   $12,'lb',$13,$14,$15,'in',
                   $16,$17,$18,$19,
                   true,true,$20, CURRENT_TIMESTAMP - INTERVAL '60 days')
           RETURNING id`,
          [store.id, p.sku, p.name, p.slug, p.short, p.long.join('\n\n'), p.base, p.sale, p.cost,
            initialStock, p.low, p.weight, p.dims[0], p.dims[1], p.dims[2],
            categoryIdBySlug[p.category], p.tags, imagePath, [imagePath], p.featured]
        );
        productIdBySlug[p.slug] = res.rows[0].id;
      }

      // ---- Coupons ----
      for (const c of store.coupons) {
        const categoryIds = c.categorySlug ? [categoryIdBySlug[c.categorySlug]] : null;
        await client.query(
          `INSERT INTO public.coupons
             (store_id, code, name, description, discount_type, discount_value, usage_limit,
              usage_limit_per_customer, minimum_order_amount, maximum_discount_amount,
              applicable_category_ids, applies_to, valid_from, valid_until, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, NOW() - INTERVAL '30 days', NOW() + INTERVAL '60 days', true)`,
          [store.id, c.code, c.name, c.description, c.type, c.value, c.usageLimit, c.perCustomer,
            c.min || null, c.maxDiscount || null, categoryIds, categoryIds ? 'specific_categories' : 'entire_order']
        );
      }

      // ---- Blog posts ----
      for (let i = 0; i < store.blog.length; i++) {
        const post = store.blog[i];
        const publishedAt = daysAgo(10 + i * 14, false);
        await client.query(
          `INSERT INTO public.blog_posts
             (store_id, title, slug, content, excerpt, status, published_at, tags, category, view_count, featured_image_url)
           VALUES ($1,$2,$3,$4,$5,'published',$6,$7,$8,$9,$10)`,
          [store.id, post.title, post.slug, post.content.join('\n\n'), post.excerpt, publishedAt,
            post.tags, post.category, randInt(60, 480), `/demo/hero/${store.slug}.svg`]
        );
      }

      // ---- Orders + order_items (this is what drives stock back down to
      //      the intended target via the update_inventory_on_order_item
      //      trigger) ----
      for (const order of orderPlan) {
        const orderRes = await client.query(
          `INSERT INTO public.orders
             (store_id, order_number, customer_email, customer_first_name, customer_last_name, customer_phone,
              shipping_first_name, shipping_last_name, shipping_address_line1, shipping_city, shipping_state,
              shipping_postal_code, shipping_country, subtotal, tax_amount, shipping_amount, discount_amount,
              total_amount, payment_method, payment_status, status, fulfillment_status,
              tracking_number, carrier, shipped_at, delivered_at, created_at,
              payment_provider, amount_total, currency, application_fee_amount, paid_at,
              refunded_amount, refunded_at, stripe_payment_intent_id, stripe_checkout_session_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'US',$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
                   $27,$28,'USD',$29,$30,$31,$32,$33,$34)
           RETURNING id`,
          [store.id, order.orderNumber, order.customer.email, order.customer.first, order.customer.last,
            '+1-555-' + String(randInt(1000, 9999)).padStart(4, '0'),
            order.customer.first, order.customer.last, order.addressLine1, order.customer.city,
            order.customer.state, order.customer.zip, order.subtotal, order.tax, order.shipping,
            order.discount, order.total, order.paymentMethod, order.paymentStatus, order.status,
            order.fulfillmentStatus, order.trackingNumber, order.carrier, order.shippedAt, order.deliveredAt,
            order.createdAt,
            // Paid orders carry the same payment columns real checkout writes, so platform revenue,
            // take rate and refund totals are non-zero in a demo instead of structurally absent.
            order.paidAt ? 'stripe' : null, order.amountTotal, order.applicationFee, order.paidAt,
            order.refundedAmount, order.refundedAt, order.paymentIntentId, order.checkoutSessionId]
        );
        const orderId = orderRes.rows[0].id;
        for (const item of order.items) {
          await client.query(
            `INSERT INTO public.order_items
               (store_id, order_id, product_id, product_sku, product_name, product_image_url, unit_price, quantity, total_price)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [store.id, orderId, productIdBySlug[item.slug], item.sku, item.name,
              `/demo/products/${item.slug}.svg`, item.unitPrice, item.quantity, item.unitPrice * item.quantity]
          );
        }
      }

      // ---- Inventory (warehouse mapping table) reflects the final,
      //      post-order stock_quantity for each product. ----
      const stockRes = await client.query(
        `SELECT sku, stock_quantity FROM public.products WHERE store_id = $1`, [store.id]
      );
      for (const row of stockRes.rows) {
        const qty = Number(row.stock_quantity);
        await client.query(
          `INSERT INTO public.inventory (store_id, sku, available, on_hand, allocated, warehouse_id, warehouse_name)
           VALUES ($1,$2,$3,$3,0,'main','Main Warehouse')
           ON CONFLICT (store_id, sku, warehouse_id) DO UPDATE SET available = EXCLUDED.available, on_hand = EXCLUDED.on_hand`,
          [store.id, row.sku, qty]
        );
      }

      // ---- Visitors (90 days) ----
      const usedIpDates = new Set();
      const productSlugs = store.products.map((p) => p.slug);
      const paths = PAGE_PATHS(store.slug, productSlugs);
      const visitorDays = randInt(70, 95);
      for (let d = 0; d < 90; d++) {
        const visitsToday = pickWeighted([[0, 3], [1, 5], [2, 6], [3, 4], [4, 2], [5, 1]]);
        for (let v = 0; v < visitsToday; v++) {
          const created = daysAgo(d);
          const dateKey = created.toISOString().slice(0, 10);
          let ip;
          let attempts = 0;
          do {
            const pool3 = pick(IP_POOLS);
            ip = `${pool3}.${randInt(1, 254)}`;
            attempts++;
          } while (usedIpDates.has(`${ip}|${dateKey}`) && attempts < 20);
          usedIpDates.add(`${ip}|${dateKey}`);
          await client.query(
            `INSERT INTO public.visitors (store_id, ip_address, visited_date, user_agent, page_path, referrer_url, session_id, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             ON CONFLICT (store_id, ip_address, visited_date) DO NOTHING`,
            [store.id, ip, dateKey, 'Mozilla/5.0 (demo-seed)', pick(paths), pick(REFERRERS),
              'sess_' + Math.random().toString(36).slice(2, 10), created]
          );
        }
      }

      // ---- Search tracking (90 days) ----
      const terms = SEARCH_TERMS[store.slug];
      const searchCount = randInt(60, 110);
      for (let i = 0; i < searchCount; i++) {
        const created = daysAgo(randInt(0, 89));
        const term = pick(terms);
        const results = pickWeighted([[0, 1], [1, 3], [2, 4], [3, 5], [5, 4], [8, 2]]);
        await client.query(
          `INSERT INTO public.search_tracking (store_id, search_query, results_count, created_at) VALUES ($1,$2,$3,$4)`,
          [store.id, term, results, created]
        );
      }

      // ---- store_analytics_summary (30 days, upsert over the trigger's stub row) ----
      for (let d = 0; d < 30; d++) {
        const date = daysAgo(d, false);
        const visitors = randInt(15, 60);
        const pageViews = Math.round(visitors * (1.6 + rng()));
        const orders = randInt(0, 4);
        const revenue = orders * randInt(40, 180);
        await client.query(
          `INSERT INTO public.store_analytics_summary
             (store_id, date, unique_visitors, page_views, bounce_rate, avg_session_duration,
              total_orders, total_revenue, conversion_rate, avg_order_value, products_viewed,
              products_added_to_cart, cart_abandonment_rate)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (store_id, date) DO UPDATE SET
             unique_visitors = EXCLUDED.unique_visitors, page_views = EXCLUDED.page_views,
             bounce_rate = EXCLUDED.bounce_rate, avg_session_duration = EXCLUDED.avg_session_duration,
             total_orders = EXCLUDED.total_orders, total_revenue = EXCLUDED.total_revenue,
             conversion_rate = EXCLUDED.conversion_rate, avg_order_value = EXCLUDED.avg_order_value,
             products_viewed = EXCLUDED.products_viewed, products_added_to_cart = EXCLUDED.products_added_to_cart,
             cart_abandonment_rate = EXCLUDED.cart_abandonment_rate`,
          [store.id, date.toISOString().slice(0, 10), visitors, pageViews,
            Number((30 + rng() * 30).toFixed(1)), randInt(90, 300), orders, revenue.toFixed(2),
            Number((orders / Math.max(visitors, 1) * 100).toFixed(2)), orders > 0 ? Number((revenue / orders).toFixed(2)) : 0,
            randInt(visitors, visitors * 3), randInt(0, Math.max(orders * 2, 1)), Number((40 + rng() * 30).toFixed(1))]
        );
      }

      // ---- store_integrations (Stripe connected, ShipStation not yet) ----
      await client.query(
        `INSERT INTO public.store_integrations (store_id, integration_type, auto_sync_enabled, sync_frequency, sync_status, is_active)
         VALUES ($1,'stripe',true,'daily','completed',true), ($1,'shipstation',false,'daily','pending',false)`,
        [store.id]
      );

      // ---- Storefront click history (45 days) ----
      // Real product ids, not the seed's slugs: storefront_click_events.product_id is a foreign
      // key, and a dashboard that joins it needs rows that actually join.
      const clickProducts = await client.query(
        `SELECT id, slug FROM public.products WHERE store_id = $1 ORDER BY sku`, [store.id]
      );
      const clickCount = await seedStorefrontClicks(client, store, storeIndex, clickProducts.rows);

      console.log(`Seeded ${store.name} (${store.slug}): ${store.products.length} products, ${orderPlan.length} orders, ${store.blog.length} blog posts, ${clickCount} storefront clicks.`);
    }

    await client.query('COMMIT');
    console.log('Demo data committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Order planning (pure JS, no DB) -- also records units sold per product.
// ---------------------------------------------------------------------------
function buildOrderPlan(store, soldByProduct) {
  const orders = [];
  const orderCount = randInt(20, 28);
  let counter = 1001;
  for (let i = 0; i < orderCount; i++) {
    /*
     * The status is drawn first because it decides how old the order has to be.
     *
     * An order that shipped a day after it was placed and was delivered three days after that
     * cannot have been placed this morning, and the previous version of this function placed
     * orders as recently as today and then dated their shipment into the future -- which is how a
     * dashboard ends up reporting more parcels shipped today than orders received today. Each
     * status now carries a minimum age big enough for its own timeline to fit behind `now`.
     */
    const status = pickWeighted([
      ['completed', 40], ['shipped', 16], ['processing', 14], ['pending', 15], ['cancelled', 15],
    ]);
    const minAgeDays = status === 'completed' ? 9 : status === 'shipped' ? 4 : 0;
    const daysBack = Math.max(minAgeDays, Math.floor((1 - Math.pow(rng(), 1.6)) * 90)); // skew recent
    const createdAt = clampToPast(daysAgo(daysBack));
    const customer = pick(CUSTOMERS);
    const lineCount = pickWeighted([[1, 5], [2, 4], [3, 2]]);
    const chosenProducts = [];
    for (let l = 0; l < lineCount; l++) {
      const product = pick(store.products);
      if (chosenProducts.find((p) => p.slug === product.slug)) continue;
      chosenProducts.push(product);
    }
    if (chosenProducts.length === 0) chosenProducts.push(pick(store.products));

    const items = chosenProducts.map((p) => {
      const quantity = pickWeighted([[1, 6], [2, 3], [3, 1]]);
      soldByProduct[p.slug] = (soldByProduct[p.slug] || 0) + quantity;
      const unitPrice = p.sale || p.base;
      return { slug: p.slug, sku: p.sku, name: p.name, unitPrice, quantity };
    });

    const subtotal = Number(items.reduce((s, it) => s + it.unitPrice * it.quantity, 0).toFixed(2));
    const hasDiscount = rng() < 0.25;
    const discount = hasDiscount ? Number((subtotal * pick([0.1, 0.15, 0.2])).toFixed(2)) : 0;
    const taxable = Math.max(subtotal - discount, 0);
    const tax = Number((taxable * 0.0825).toFixed(2));
    const shipping = subtotal >= store.shippingFreeThreshold ? 0 : store.shippingFlatRate;
    const total = Number((taxable + tax + shipping).toFixed(2));

    /*
     * `payment_status` here has to be the vocabulary real checkout writes, not a plausible-looking
     * synonym. `src/lib/billing/orders.ts` records a paid order as `payment_status = 'paid'`,
     * `payment_provider = 'stripe'`, `payment_method = 'card'`, and a refund as
     * `payment_status = 'refunded'` with `status = 'cancelled'`. The previous seed wrote
     * 'completed' and 'credit_card'/'paypal', so every admin filter written against the real
     * values matched nothing in the demo data and every filter written against the demo data
     * matched nothing in production -- each one looking correct to whoever wrote it.
     */
    let paymentStatus, fulfillmentStatus, shippedAt, deliveredAt, trackingNumber, carrier;
    switch (status) {
      case 'completed':
        paymentStatus = 'paid'; fulfillmentStatus = 'fulfilled';
        shippedAt = new Date(createdAt.getTime() + 86400000 * randInt(1, 2));
        deliveredAt = new Date(shippedAt.getTime() + 86400000 * randInt(2, 5));
        trackingNumber = '1Z' + randInt(100000000, 999999999);
        carrier = pick(['UPS', 'FedEx', 'USPS']);
        break;
      case 'shipped':
        paymentStatus = 'paid'; fulfillmentStatus = 'fulfilled';
        shippedAt = new Date(createdAt.getTime() + 86400000 * randInt(1, 2));
        deliveredAt = null;
        trackingNumber = '1Z' + randInt(100000000, 999999999);
        carrier = pick(['UPS', 'FedEx', 'USPS']);
        break;
      case 'processing':
        paymentStatus = 'paid'; fulfillmentStatus = 'unfulfilled';
        shippedAt = null; deliveredAt = null; trackingNumber = null; carrier = null;
        break;
      case 'pending':
        paymentStatus = 'pending'; fulfillmentStatus = 'unfulfilled';
        shippedAt = null; deliveredAt = null; trackingNumber = null; carrier = null;
        break;
      case 'cancelled':
      default:
        paymentStatus = 'refunded'; fulfillmentStatus = 'unfulfilled';
        shippedAt = null; deliveredAt = null; trackingNumber = null; carrier = null;
        break;
    }

    // Money the platform actually captured, and its cut. `paid_at` is a few minutes after the
    // order, which is what a Stripe redirect looks like; an unpaid order has none of it. The fee
    // uses the same arithmetic as `computeApplicationFeeCents` in src/lib/billing/payment-accounts.ts.
    const isPaid = paymentStatus === 'paid' || paymentStatus === 'refunded';
    const paidAt = isPaid ? new Date(createdAt.getTime() + randInt(1, 9) * 60000) : null;
    const amountTotal = isPaid ? total : null;
    const applicationFee = isPaid
      ? Number((Math.round(total * 100 * DEMO_APPLICATION_FEE_BPS / 10000) / 100).toFixed(2))
      : null;
    const refundedAmount = paymentStatus === 'refunded' ? total : 0;
    const refundedAt = paymentStatus === 'refunded'
      ? new Date(createdAt.getTime() + 86400000 * randInt(1, 5))
      : null;

    orders.push({
      orderNumber: `${store.skuPrefix}-${counter++}`,
      customer,
      addressLine1: `${randInt(100, 9999)} ${pick(['Main St', 'Oak Ave', 'Pine Rd', 'Elm St', 'Market St', 'Broadway', 'Cedar Ln'])}`,
      items, subtotal, tax, shipping, discount, total,
      paymentMethod: 'card',
      paymentStatus, status, fulfillmentStatus, trackingNumber, carrier, shippedAt, deliveredAt,
      createdAt,
      paidAt, amountTotal, applicationFee, refundedAmount, refundedAt,
      // Clearly-fake identifiers in Stripe's shape. Real ones are 24 random characters; these say
      // `demo` in the middle so nobody mistakes a seeded order for a live one in a support ticket.
      paymentIntentId: isPaid ? `pi_demo_${store.skuPrefix.toLowerCase()}_${counter - 1}` : null,
      checkoutSessionId: isPaid ? `cs_demo_${store.skuPrefix.toLowerCase()}_${counter - 1}` : null,
    });
  }
  return orders;
}

// ---------------------------------------------------------------------------
// database/seeds/development.sql generation -- a plain-SQL snapshot of what
// was just committed, produced by reading it back from the DB. See
// docs/demo-data.md for why this file is generated rather than hand-written.
// ---------------------------------------------------------------------------
async function dumpDevelopmentSql() {
  const storeIds = STORES.map((s) => s.id);
  const userIds = USERS.map((u) => u.id);
  const out = [];
  out.push('-- Development seed data for the RebelShops demo stores.');
  out.push('-- GENERATED FILE -- do not hand-edit. Run `node scripts/seed-demo.js` to regenerate.');
  out.push('-- Source of truth: scripts/seed-demo.js. See docs/demo-data.md.');
  out.push('');
  out.push('BEGIN;');
  out.push('');
  out.push('-- Scoped delete: only the three demo stores and their owners.');
  const scopedTables = [
    'coupon_usage', 'order_items', 'orders', 'inventory_logs', 'inventory',
    'page_analytics', 'visitors', 'search_tracking', 'blog_posts', 'coupons',
    'storefront_click_daily', 'storefront_click_events',
    'products', 'categories', 'store_config', 'store_analytics_summary',
    'store_integrations', 'sync_history',
  ];
  const idListSql = (ids) => `ARRAY[${ids.map((id) => `'${id}'`).join(', ')}]::uuid[]`;
  for (const table of scopedTables) {
    out.push(`DELETE FROM public.${table} WHERE store_id = ANY(${idListSql(storeIds)});`);
  }
  out.push(`DELETE FROM public.stores WHERE id = ANY(${idListSql(storeIds)});`);
  out.push(`DELETE FROM public.users WHERE id = ANY(${idListSql(userIds)});`);
  out.push('');

  async function dumpTable(label, query, params, columns, onConflict) {
    const res = await pool.query(query, params);
    if (res.rows.length === 0) return;
    out.push(`-- ${label} (${res.rows.length} rows)`);
    const cols = columns || Object.keys(res.rows[0]);
    for (const row of res.rows) {
      const values = cols.map((c) => sqlLiteral(row[c]));
      out.push(`INSERT INTO public.${label} (${cols.join(', ')}) VALUES (${values.join(', ')})${onConflict || ''};`);
    }
    out.push('');
  }

  await dumpTable('users', 'SELECT * FROM public.users WHERE id = ANY($1::uuid[]) ORDER BY id', [userIds]);
  out.push('-- Inserting a store fires trigger_initialize_store(), which seeds default');
  out.push("-- store_config rows and an 'all-products' catch-all category. The store_config");
  out.push('-- dump below upserts over those defaults; the stray category is dropped here.');
  await dumpTable('stores', 'SELECT * FROM public.stores WHERE id = ANY($1::uuid[]) ORDER BY id', [storeIds]);
  out.push(`DELETE FROM public.categories WHERE store_id = ANY(${idListSql(storeIds)}) AND slug = 'all-products';`);
  out.push('');
  await dumpTable(
    'store_config',
    'SELECT * FROM public.store_config WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, config_key',
    [storeIds], null,
    ' ON CONFLICT (store_id, config_key) DO UPDATE SET config_value = EXCLUDED.config_value'
  );
  await dumpTable('categories', 'SELECT * FROM public.categories WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, sort_order', [storeIds]);
  await dumpTable('products', 'SELECT * FROM public.products WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, sku', [storeIds]);
  await dumpTable('inventory', 'SELECT * FROM public.inventory WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, sku', [storeIds]);
  await dumpTable('coupons', 'SELECT * FROM public.coupons WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, code', [storeIds]);
  await dumpTable('blog_posts', 'SELECT * FROM public.blog_posts WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, published_at', [storeIds]);
  await dumpTable('orders', 'SELECT * FROM public.orders WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, order_number', [storeIds]);
  await dumpTable('order_items', 'SELECT * FROM public.order_items WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, order_id', [storeIds]);
  await dumpTable('store_integrations', 'SELECT * FROM public.store_integrations WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, integration_type', [storeIds]);
  await dumpTable(
    'store_analytics_summary',
    'SELECT * FROM public.store_analytics_summary WHERE store_id = ANY($1::uuid[]) ORDER BY store_id, date',
    [storeIds], null,
    ' ON CONFLICT (store_id, date) DO UPDATE SET unique_visitors = EXCLUDED.unique_visitors, page_views = EXCLUDED.page_views, total_orders = EXCLUDED.total_orders, total_revenue = EXCLUDED.total_revenue'
  );
  out.push(`-- visitors, search_tracking and storefront_click_events are omitted from this`);
  out.push(`-- snapshot (tens of thousands of low-value rows, and the click rollup is`);
  out.push(`-- rebuilt by trigger on insert anyway)`);
  out.push(`-- visitors and search_tracking are omitted from this snapshot (thousands of`);
  out.push(`-- low-value rows) -- re-run \`node scripts/seed-demo.js\` to regenerate them.`);
  out.push('');
  out.push('COMMIT;');

  const outPath = path.join(__dirname, '..', 'database', 'seeds', 'development.sql');
  fs.writeFileSync(outPath, out.join('\n') + '\n');
  console.log(`Wrote ${outPath}`);
}

// ---------------------------------------------------------------------------
async function main() {
  const skipDump = process.argv.includes('--no-dump');
  await seed();
  if (!skipDump) await dumpDevelopmentSql();
  await pool.end();
}

/**
 * Turn a connection failure into an instruction rather than a stack trace.
 *
 * The defaults differ by platform and the raw pg error says nothing about that:
 * Homebrew Postgres on macOS creates a superuser named after your OS account
 * with trust auth and usually no `postgres` role at all, while Docker and most
 * Linux packages do create `postgres`, commonly with a password. A connection
 * string copied from the wrong one of those fails with a bare 28P01.
 *
 * @param err - The error thrown while connecting or seeding.
 * @returns Guidance to print, or null when the error is not a connection problem.
 */
function connectionHelp(err) {
  const url = process.env.DATABASE_URL;
  const whoami = process.env.USER || process.env.LOGNAME || 'your-username';

  if (!url) {
    return [
      'DATABASE_URL is not set.',
      '',
      'Create .env.local in the project root:',
      `  DATABASE_URL=postgresql://${whoami}@127.0.0.1:5432/rebelshops`,
      '  JWT_SECRET=any-long-random-string-for-local-dev',
    ].join('\n');
  }

  const user = (url.match(/\/\/([^:@/]+)/) || [])[1];

  if (err && err.code === '28P01') {
    return [
      `Postgres rejected the credentials for user "${user}".`,
      '',
      process.platform === 'darwin'
        ? [
            'On macOS with Homebrew, Postgres does not usually have a "postgres"',
            'role. The superuser is named after your OS account and needs no password:',
            '',
            `  DATABASE_URL=postgresql://${whoami}@127.0.0.1:5432/rebelshops`,
          ].join('\n')
        : [
            'Check the username and password in DATABASE_URL. For a local install the',
            'superuser is often your OS account rather than "postgres":',
            '',
            `  DATABASE_URL=postgresql://${whoami}@127.0.0.1:5432/rebelshops`,
          ].join('\n'),
      '',
      'Confirm what works before editing .env.local:',
      `  psql -h 127.0.0.1 -U ${whoami} -d postgres -c "select current_user"`,
    ].join('\n');
  }

  if (err && (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND')) {
    return [
      'Could not reach Postgres.',
      '',
      process.platform === 'darwin'
        ? '  brew services start postgresql@16'
        : '  sudo service postgresql start',
    ].join('\n');
  }

  if (err && err.code === '3D000') {
    const db = (url.match(/\/([^/?]+)(\?|$)/) || [])[1] || 'rebelshops';
    return [`Database "${db}" does not exist. Create it:`, '', `  createdb ${db}`].join('\n');
  }

  return null;
}

main().catch((err) => {
  const help = connectionHelp(err);
  if (help) {
    console.error(`\nSeed failed: ${err.message}\n`);
    console.error(help);
    console.error('');
  } else {
    console.error('Seed failed:', err);
  }
  pool.end();
  process.exit(1);
});
