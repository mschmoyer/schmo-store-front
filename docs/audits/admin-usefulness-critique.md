# Admin Usefulness Critique

**Question under review, from the product owner:**

> "Have you critically analyzed all the pages on the admin site to ensure they are amazingly useful
> for a small e-commerce business to track their business storefront, shipping, and profits? Are our
> pages understandable, user-friendly, and focused on their goals, but still powerful underneath?"

**Reviewer's stance:** owner of a ~$40k/month, 200-SKU store, ships via ShipStation, one employee,
ten minutes on a Monday morning.

**Method:** every admin route visited authenticated as `demo@schmostore.com` against the seeded
Basecamp Audio store (`650e8400-e29b-41d4-a716-446655440001`), screenshots in
`.scratch/shots/`, every displayed figure re-derived against
`PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d rebelshops`. Not a visual review; the
repalette is not the subject.

---

## Verdict — **D+**

No. This is a set of CRUD screens over some tables, and several of the tables are lying. Of the five
questions a merchant actually opens an admin to answer on a Monday, **one is answerable and the
answer is wrong advice; the other four cannot be answered at all.** There is no Orders page — 27
orders worth $6,311.79 sit in this store's database and not one screen in the application will show
them to you, which means you cannot see what is unshipped, cannot look up a customer's order to
answer a support email, and cannot see the 51 tracking numbers the product already stores. Profit
appears nowhere; the one "margin" figure in the app divides by cost instead of revenue and so
reports **97.3%** where the truth is **49.3%**. The Inventory page's headline "Total value" is
inflated to **$77,755.47** against a true **$22,275.99** by a JOIN fan-out, and three other screens
give three further different answers for the same quantity ($43,958.00, $22,275.99, $0). The
Turnover report declares all twelve products dead stock with a $0 inventory value. The Dead Stock
report — the screenshot the marketing deck calls "the screenshot that makes a high-volume seller
lean in" — is commented out of the router in one line and silently bounces you back to where you
started. The Purchase Orders list never calls its own working API and shows three hardcoded fake
orders from January 2024. The Coupons page reports "No coupon codes yet" while two active coupons
are live on the storefront. And the product edit page — the single most-used screen in any store
admin — **crashes on render**, along with the coupon editor, because a theme rule sets
`minHeight` on every `Textarea`. The pieces that are good are genuinely good: Page Design is a
real, well-made section editor; the zero-result search table is exactly the insight it promises to
be; Billing is honest about its own degraded state. But a merchant cannot run a business on this,
and "track your profits" is not currently a true claim.

---

## The five Monday-morning questions

### 1. "Did I make money last week, and how much was profit rather than revenue?" — **Cannot answer. 0 of 2 parts.**

| | |
|---|---|
| Clicks to an answer | n/a — no path exists |
| Correct? | The revenue figure that *is* shown is wrong three separate ways |
| Missing | Gross profit, COGS, margin %, any week-over-week comparison |

The dashboard's top tile reads **`Total revenue $2,174.05 / 8 orders all time`**
(`.scratch/shots/01-dashboard.png`). Every part of that is misleading:

- **It excludes shipped orders.** `src/app/api/admin/dashboard/route.ts:107` filters
  `WHERE status = 'completed'`. Booked revenue excluding only cancellations is **$5,588.11**. The
  dashboard shows 39% of it.

  ```
  status     | count |   sum
  completed  |     8 | 2174.05   <- the only thing counted
  shipped    |     8 | 1467.51
  processing |     4 | 1291.64
  pending    |     1 |  654.91
  cancelled  |     6 |  723.68
  ```

  A merchant does not think an order they shipped last Tuesday is not revenue.

- **"Revenue this month $0.00 / 0 orders this month" is false.** Order `BCA-1010`, $55.75, was placed
  2026-08-02. It is `shipped`, so the same status filter erases it.

- **"All time" is not a period.** There is no last-week, no last-month, no prior-period delta
  anywhere on the dashboard. A number with no comparison cannot tell you whether the week was good.

- **No profit anywhere.** See [The profit gap](#the-profit-gap). The true answer, which the database
  can already produce, is gross profit **$2,385.99** all-time at **44.5%**, and **$441.23** at
  **48.1%** for the last 30 days.

### 2. "What do I need to reorder right now?" — **Answerable in 1 click. The advice is wrong.**

| | |
|---|---|
| Clicks | 1 (Inventory) — this is the app's best moment |
| Correct? | No. Recommends $925.60 of a product that has never sold |
| Missing | Real time-windowed velocity; a reorder quantity that reflects demand |

`Inventory` puts **Smart Reorder Recommendations** above the fold with priority badges, days-until-
stockout and a one-click "create PO" affordance (`.scratch/shots/04-inventory.png`). The *shape*
of this is right and it is the strongest idea in the product. The contents are not trustworthy:

- **Reorder quantity is a hardcoded floor of 20.**
  `src/app/api/admin/purchase-orders/recommendations/route.ts:194` —
  `const reorderQuantity = Math.max(forecast90Days, 20);`
  Every one of the three recommendations is for exactly 20 units. Arclight LED Desk Lamp has
  **never sold a single unit** (no `order_items` row exists for it), so `forecast90Days` is 0 and
  the app confidently advises buying **20 units at $46.28 = $925.60**, badged `high` priority,
  `medium` confidence. That is the opposite of the correct action, which is to mark it down.

- **Sales velocity has no time dimension at all.** Every window keys off `oi.created_at`
  (`recommendations/route.ts:103-110`), but `order_items.created_at` defaults to
  `CURRENT_TIMESTAMP` — the seed insert time. All 119 rows carry `2026-08-12 14:37:11`, while their
  parent orders span 2026-05-15 to 2026-08-12 (114 of 119 rows disagree with their order's date).
  Result: 7-day, 30-day and 90-day sales are **the same number** for every SKU.

  ```
  product_sku  | all_time | 7d | 30d | 90d | true_7d | true_30d
  BCA-DSK-1009 |        7 |  7 |   7 |   7 |       0 |        1
  BCA-WBL-1012 |        4 |  4 |   4 |   4 |       0 |        2
  ```

  The marketing deck's headline inventory claim — "tracks sales velocity across 7, 14, 30, 60, 90,
  180 and 365 days, forecasts demand" (§3.6) — is seven identical numbers.

- **The velocity line contradicts itself on screen.** Pulse Smartwatch reads
  `0.1/day, 4/week`. 0.1/day is 0.7/week. `dailyVelocity` divides 30-day sales by 30
  (line 176); `weeklyVelocity` uses raw 7-day sales (line 177). Two different windows presented
  side by side as if comparable, off by 6x.

- **Suppliers are assigned by `Math.random()`** (line 244, comment: "random for now").

- **"increasing sales trend"** fires on Pulse Smartwatch because `salesLast30Days > avgMonthlySales *
  1.2` — comparing two aggregates over the same broken window.

### 3. "What is stuck?" — **Cannot answer.**

| | |
|---|---|
| Clicks | n/a — no orders screen exists |
| Correct? | The one number that hints at it is mislabeled |
| Missing | Everything: an orders list, unshipped filter, sync status, tracking |

**Five orders totalling $1,946.55 have been sitting unshipped for 61 to 73 days:**

```
order_number |   status   | total  | created_at | age_days | tracking
BCA-1014     | processing | 155.01 | 2026-05-31 |       73 |
BCA-1011     | processing | 106.09 | 2026-06-04 |       69 |
BCA-1004     | processing | 515.27 | 2026-06-07 |       66 |
BCA-1001     | pending    | 654.91 | 2026-06-10 |       63 |
BCA-1020     | processing | 515.27 | 2026-06-12 |       61 |
```

This is a five-alarm fire for a real merchant and the admin never mentions it. The digit `5` does
appear once, on the Inventory page: a tile reading **`Pending orders / 5 / Awaiting delivery`**. It
is the same 5 — `src/app/api/admin/inventory/route.ts:252-256` counts customer orders in
`pending`/`processing` — but it is labeled as *inbound stock awaiting delivery*, sits in a row of
inventory tiles, and is not clickable. The code comment above it reads `// Get pending purchase
orders count (mock for now)`. A merchant reading that tile concludes five restocks are on their way,
not that five customers have been waiting two months.

There is also no way to see the other half of "stuck": nothing shows whether ShipStation stock
disagrees with local stock. The `inventory` table exists precisely to hold ShipStation's numbers and
the inventory query already `LEFT JOIN`s it (`route.ts:88-92`), but no column in the grid shows
the ShipStation figure beside the local one, so a divergence is invisible.

### 4. "What is dead weight — capital sitting 90+ days?" — **Cannot answer. The report is disabled.**

| | |
|---|---|
| Clicks | 3 (Inventory → Reports → Generate Report) → lands back on Inventory |
| Correct? | n/a |
| Missing | The report itself, which is built and one comment away from working |

`src/app/admin/inventory/reports/[reportType]/page.tsx:7,17` —

```
// import DeadStockAnalysisReport from '@/components/admin/reports/DeadStockAnalysisReport';
  // 'dead-stock': DeadStockAnalysisReport,
```

The component exists (`src/components/admin/reports/DeadStockAnalysisReport.tsx`, 175+ lines). The
API exists and returns `200` with a well-formed payload including `carrying_cost`,
`liquidation_value` and `potential_recovery_value`. The title string is still in `reportTitles`. But
the route map entry is commented out, so `/admin/inventory/reports/dead-stock` hits the
`if (!ReportComponent) router.push('/admin/inventory')` fallback and **silently returns you to the
page you came from with no error message** (`.scratch/shots/06-dead.png` is indistinguishable from
the Inventory page). The Reports tab's "Generate Report" button for Dead Stock Analysis, and the one
for Supplier Performance, are both dead ends of exactly this kind
(`src/app/admin/inventory/page.tsx:879,887`).

This is the marketing deck's hero feature. §3.6: *"Three reports come standard: inventory valuation,
turnover, and dead stock — with days since last sale, carrying cost and a suggested markdown."*
§3.6 visual direction: *"a crop of the dead-stock report… This is the screenshot that makes a
high-volume seller lean in."* It is disabled in one line.

Even re-enabled it would report nothing useful: the query measures age from `p.created_at` — when
the *product row* was created — not from last sale
(`src/app/api/admin/inventory/reports/dead-stock/route.ts:120-146`, `-- Use creation date as
fallback`). Every product was seeded today, so `days_in_stock` is 0 and the `>= 90` filter returns
an empty set forever.

### 5. "Is my storefront converting?" — **Cannot answer.**

| | |
|---|---|
| Clicks | 1 to Analytics, which contains no orders and no revenue |
| Correct? | Two headline metrics are hardcoded literals |
| Missing | Conversion rate, revenue per visitor, cart abandonment |

Analytics has four tabs and none of them contain a single order or dollar
(`.scratch/shots/02-analytics.png`, `20-analytics-Trends.png`, `22-search-analytics.png`). The
answer — 5 non-cancelled orders from 54 unique visitors in 30 days, ~9% — is computable from data
already in the database and is displayed nowhere.

To be fair to the team: §3.8 of the marketing copy deliberately scopes analytics to "visitors, page
views and per-page traffic, plus every search query." This is a product gap, not a broken promise.
The broken promises are on the same page:

- **`Bounce Rate 32.1%` is a literal.** `src/app/api/admin/analytics/trends/route.ts:159` —
  `const bounceRate = 32.1;`
- **`Avg Session Duration 4m 32s` is a literal.** Line 156 —
  `const avgSessionDuration = 272; // 4 minutes 32 seconds`

  Neither has a data source. `page_analytics` has 0 rows and `visitors` has no page-view or
  duration column. Every store will see 32.1% and 4m 32s forever.

- **The same page contradicts itself four times.** The "AI Business Insights" narrative
  (`executive-summary/route.ts`, which does its own crude estimate at line 220:
  `avgPagesPerSession <= 1.5 ? 70 : …`) says *"bounce rate is 70.0%"* and *"average session
  duration of 2 minutes 0 seconds"* and *"54 unique visitors"*. The tiles 200px below say
  **32.1%**, **4m 32s** and **37 unique users**. One is flagged `needs improvement`, the other
  `Lower is better`.

- **`Business Score 51.39/100`** is an unexplained composite quoted to two decimals, with no
  statement of what it measures or what would move it.

- **"Visitor traffic decreased by 12.9%, requiring immediate attention."** That is seven people.
  Crying alarm over noise on a 54-visitor store teaches the merchant to ignore the alert box.

---

## Numbers that are wrong or misleading

Ranked by how much money a merchant could lose acting on them.

### 1. Inventory "Total value" is inflated 249% by a JOIN fan-out

`src/app/api/admin/inventory/route.ts:232-244` aggregates over
`products p LEFT JOIN inventory_logs il ON p.id = il.product_id`. Each product is counted once per
log row, so every aggregate in the tile row is multiplied.

| Tile | Displayed | Truth | Error |
|---|---|---|---|
| Total products | **45** | 12 | +275% |
| Total value (at unit cost) | **$77,755.47** | $22,275.99 | +249% |
| Low stock | **4** | 2 | 2x |
| Out of stock | **4** | 1 | 4x |

Reproduced exactly by running the shipped query against the shipped data. The grid immediately
below the tiles lists 12 products and one out-of-stock item, so the page visibly contradicts itself.
This is the number a merchant uses for insurance, for a loan application, and to decide whether they
can afford to buy more stock.

### 2. Four screens give four different inventory values

| Screen | Figure | Verdict |
|---|---|---|
| `/admin/inventory` tile | $77,755.47 "At unit cost" | Wrong (fan-out) |
| `/admin/inventory/reports/valuation` | $22,275.99 "Total cost value" | **Correct** |
| `/admin/products` tile | $43,958.00 "At list price" | **Correct**, honestly labeled |
| `/admin/inventory/reports/turnover` | $0 "Inventory value" | Wrong |

Two are right and two are wrong, and nothing on any screen tells the merchant which.

### 3. Turnover report declares the entire catalog dead

`.scratch/shots/07b-turnover-15s.png`: all 12 products at `0.00x` turnover, `∞` days to sell,
`0` sales qty, every one badged **Dead Stock**; summary tiles read `DEAD STOCK 12` and
`INVENTORY VALUE $0`. For a store holding $22,275.99 of stock that sold $5,358.00 in 90 days.

The cause is in the shipped SQL, `src/app/api/admin/inventory/reports/turnover/route.ts:94-98`:

```sql
0 as total_sales_quantity, -- No order data available
0 as total_sales_revenue,  -- No order data available
NULL as last_sale_date,    -- No order data available
0 as turnover_ratio,       -- No sales data to calculate
999999 as days_to_sell     -- No sales data available
```

Order data is available; there are 119 `order_items` rows. This is a placeholder shipped as one of
the three reports the marketing deck says "come standard." It also takes ~10s to render, during
which the page shows only `Loading turnover data…`.

### 4. "Margin" is markup — 97.3% displayed against 49.3% true

`src/app/api/admin/inventory/reports/valuation/route.ts:240` divides the spread by **cost**, not by
retail:

```
(total_retail_value − total_cost_value) / total_cost_value * 100
```

| | |
|---|---|
| Displayed `AVG MARGIN` | **97.3%** |
| True gross margin `(retail − cost) / retail` | **49.3%** |

Per-row margins of `108%`, `117%` and `110%` appear in the same table. A margin above 100% is
arithmetically impossible and is the tell. A merchant reading "97.3% margin" believes they keep 97
cents on the dollar; they keep 49. Pricing decisions made on that number lose money.

The same tile row shows `POTENTIAL PROFIT $21,682.01`, which is unrealized spread on unsold stock —
not profit, not realizable, and presented in the same visual register as money you have.

### 5. Dashboard "Top products" counts cancelled orders as sales

`src/app/api/admin/dashboard/route.ts:77-78` puts the status test in the `ON` clause of a `LEFT
JOIN`, so it filters nothing:

```sql
LEFT JOIN order_items oi ON p.id = oi.product_id
LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'completed'
...
COALESCE(SUM(oi.quantity), 0) as sales_count
```

| Product | Dashboard "SOLD" | Booked (excl. cancelled) | Truly completed |
|---|---|---|---|
| Voltpack Power Bank | **5** | 1 | 0 |
| Driftcase 1TB SSD | **5** | 2 | 0 |
| Anchor Charging Dock | **12** | 10 | 6 |
| Glide Wireless Mouse | **8** | 7 | 4 |

Meanwhile `/admin/products` counts the *same* SKUs with a real `WHERE o.status = 'completed'`
(`src/app/api/admin/products/route.ts:137`) and shows Aviator Headphones as **1 sale / $199.00**
where the dashboard shows **3**. Two screens, contradictory sales figures for the same SKU, and
both are wrong — one includes cancellations, the other discards everything shipped.

### 6. Dashboard "Site visitors — This month" is the all-time figure

The tile reads `164 / This month`. The API computes `monthly_unique_visitors` at
`dashboard/route.ts:114` and then never uses it; line 160 assigns `total_unique_visitors`.

| | |
|---|---|
| Displayed as "this month" | **164** |
| Actually this month | **22** |
| Today | 2 |

7.5x overstated, and it will drift further every month the store is open.

### 7. Coupons page hides live coupons behind a 500

`/admin/coupons` shows `Active coupons 0`, `Total redemptions 0`, and the empty state *"No coupon
codes yet."* Two active coupons are live on the storefront right now:

```
code      | type          | value | is_active | valid_until
FREESHIP  | fixed_amount  |  9.99 | t         | 2026-10-11
WELCOME10 | percentage    | 10.00 | t         | 2026-10-11
```

`GET /api/admin/coupons` returns
`{"success":false,"error":"Internal server error","message":"relation \"discounts\" does not exist"}`
— `src/app/api/admin/coupons/route.ts:70` queries a table that was never created. The UI swallows
the error into an empty state, so the merchant is told their promotions do not exist rather than
that the page is broken. They will create duplicates.

### 8. Smaller distortions

- **Dashboard "Low stock 3" vs Inventory "Low stock 4" vs truth 2.** The dashboard hardcodes
  `stock_quantity <= 5` (`dashboard/route.ts:94`) and ignores the per-product
  `low_stock_threshold` column that exists and defaults to 10 — so the tile and the merchant's own
  configured thresholds disagree by construction.
- **Stripe status is reported three ways at once.** Dashboard: `Connected`. Integrations card:
  `Active` badge with `Status: Not Configured` beneath it on the same card. Billing:
  *"Payments are not configured."*
- **Blog reports 757 total views**, seeded on `blog_posts.view_count`, against Analytics'
  54 page views in 30 days. A fourth traffic number that reconciles with nothing.
- **Valuation "TOTAL PRODUCTS 11"** (it filters `stock_quantity > 0`) against Products' 12 and
  Inventory's 45. Three product counts.
- **"Historical Value Trend"** on the valuation report is a line chart with a single data point.
- **Product-detail breadcrumb** renders a title-cased UUID: `802b7e5e Aa47 4539 8d64 Fbf81a65cd95`.

---

## The profit gap

**"Track your profits" is not true today.** `cost_price` is populated on all 36 products and
`base_price`/`unit_price` are on every line — the data is complete — but the word *profit* appears in
exactly one place in the admin, on the valuation report, where it means unrealized spread on unsold
stock and is computed with the wrong denominator. There is no COGS figure, no gross margin, no
margin column on the product list, no margin on any order (there are no orders screens at all), and
no margin on the dashboard.

Everything needed is already in the database:

```
                       | revenue | cogs    | gross profit | margin
all-time non-cancelled | 5358.00 | 2972.01 |      2385.99 |  44.5%
last 30d non-cancelled |  918.00 |  476.77 |       441.23 |  48.1%
```

Also already present and unused: `orders.discount_amount` (**$229.00** given away), `tax_amount`,
`shipping_amount` (**$35.96** collected).

### The smallest change that makes the claim true

**One SQL block and one dashboard tile row.** In `src/app/api/admin/dashboard/route.ts`, replace the
`revenueStats` query with a period-aware profit query and render four tiles instead of two:

```sql
SELECT
  SUM(oi.quantity * oi.unit_price)                        AS revenue,
  SUM(oi.quantity * p.cost_price)                         AS cogs,
  SUM(oi.quantity * (oi.unit_price - p.cost_price))       AS gross_profit,
  SUM(oi.quantity * (oi.unit_price - p.cost_price))
    / NULLIF(SUM(oi.quantity * oi.unit_price), 0) * 100   AS margin_pct
FROM order_items oi
JOIN orders   o ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.store_id = $1
  AND o.status <> 'cancelled'          -- not `= 'completed'`
  AND o.created_at >= $2               -- a real window, with a prior-period twin
```

Tiles: **Revenue**, **Gross profit**, **Margin %**, each `Last 7 days` with a `vs prior 7 days`
delta. That is the whole fix for the headline claim, and it is a few hours' work.

Three corollaries, in order of value:

1. **Fix the margin denominator** in `valuation/route.ts:240` and the three per-row `CASE`
   expressions (lines 105, 132, 187): divide by retail, not cost. Or keep both and label them
   `Markup` and `Margin` — merchants use both words and mean different things.
2. **Add a `Margin %` column to `/admin/products`.** The list already renders price and has
   `cost_price` on the row. One column turns the catalog into a pricing tool.
3. **Snapshot `unit_cost` onto `order_items` at checkout.** Today profit must join to
   `products.cost_price`, which is *current* cost — so last quarter's margin silently rewrites
   itself every time a supplier price changes. One nullable column, backfillable from
   `products.cost_price`, makes historical profit stable. Do this before the numbers matter.

Note this yields *gross* profit. True net also needs `orders.shipment_cost` (the column exists;
**0 of 74 rows are populated**) and Stripe fees. Ship gross profit labeled "gross profit" and don't
overclaim.

---

## Shipping

The product's entire pitch is ShipStation. **The shipping workflow is not visible in the admin at
all.**

What a merchant can see: a credentials form. `/admin/integrations/shipstation`
(`.scratch/shots/12-shipstation.png`) is username, password, API key, API secret, endpoint URL, an
auto-sync toggle, and setup instructions. That is the whole shipping surface.

What they cannot see, all of which the schema already supports:

| Question | Data that exists | Screen |
|---|---|---|
| What is unshipped? | 5 orders, 61-73 days old, $1,946.55 | none |
| What tracking numbers went out? | **51 of 74 orders** have `tracking_number` | none |
| Did the last sync work, and when? | `sync_logs` (0 rows), `sync_history` (5 rows), `sync_runs` (0), `integration_logs` (0) | none |
| Did anything fail? | `integration_alerts` (0 rows) | none |
| Did the customer get their shipment email? | `shipment_notifications` (0 rows), `job_queue` (0 rows) | none |
| Does ShipStation's stock match mine? | `inventory` table, already `LEFT JOIN`ed into the inventory query | not rendered |

There is a `Sync ShipStation` button on the Inventory page. It returns
`{"success":false,"error":"ShipStation integration not found or inactive"}` — an honest error, but
the button gives no advance indication that it will fail, and there is no last-sync timestamp
anywhere to tell the merchant how stale the numbers on screen are.

This aligns with, and extends, `docs/audits/shipstation-audit.md`: that audit found the pipeline
broken (P0-4: background sync dead end-to-end, `sync_logs` never written; P0-8: webhook never
registered). The present finding is the merchant-facing half of the same problem — **even when the
pipeline is fixed, there is no screen on which its output or its failures would appear.** A merchant
would discover a broken sync from an angry customer, not from RebelShops.

**Highest-value shipping work, in order:** (1) an Orders list with an *Unshipped* filter, order age,
and tracking number; (2) a last-sync timestamp and status on the Inventory page header; (3) a
ShipStation-vs-local stock column in the inventory grid.

---

## Per-page assessment

Ordered by how often a merchant would open the page in a normal week.

### `/admin` — Dashboard · **would open daily · currently near-useless**
**Job:** the ten-minute Monday answer. **Serves it?** No. Every headline number on it is wrong
(§Numbers 5, 6, and Q1). It shows total revenue with no period and no profit, a visitor count
mislabeled by 7.5x, and a top-products table that counts cancellations.
**Missing:** profit, a time window with a comparison, unshipped orders, today's sales.
**Would never look at:** "Blog posts 3 / 3 published" as one of six headline KPIs; the "Getting
started" checklist, which is onboarding furniture that should disappear once complete.

### `/admin/inventory` — **would open several times a week · best page in the app, and half-broken**
**Job:** what do I have, what do I need. **Serves it?** Partly. The Smart Reorder panel, the
forecast/reorder-point/unit-cost grid, per-item PO creation and CSV export are all real capability
and correctly placed above the fold. Then the summary tiles above them are inflated 249% and the
recommendations advise buying dead product (Q2, §Numbers 1).
**Missing:** a ShipStation-vs-local stock column; a last-sync timestamp.
**Would never look at:** the "Restocked / 0 / This month" tile.
**Structural problem:** this page has five sub-tabs — Inventory Grid, Purchase Orders, Suppliers,
Reports, Alerts — of which *Purchase Orders* duplicates a top-level nav item and *Reports* is a menu
of four buttons, two of which are dead ends.

### `/admin/products` — **would open weekly · solid**
**Job:** catalog maintenance. **Serves it?** Yes, mostly. Good filters, bulk actions, honest
`Inventory value $43,958.00 "At list price"`. Sales counts are `completed`-only and so understate.
**Missing:** a margin column. It has price and cost on the row already.

### `/admin/products/[id]` — **would open weekly · CRASHES**
Throws `Error: Using 'style.minHeight' for <TextareaAutosize/> is not supported` on render
(`.scratch/shots/17b-product-20s.png`). Root cause is not in the page: `src/lib/theme/rebel-theme.ts:381`
applies `minHeight: 88` to every `Textarea`, which `react-textarea-autosize` rejects whenever
`autosize` is set. **A merchant cannot edit a product.** This is the most-used screen in any store
admin and it is unreachable. Same crash confirmed on the coupon editor
(`.scratch/shots/18-coupon-modal.png`); by inspection it will also hit `ReceivingModal.tsx:352`
(the receive-stock flow), `ProductAdvancedSettings.tsx:694,712`, and `ai/page.tsx:527`. This looks
like fallout from the repalette. **Fix first — it is one theme line and it unblocks five flows.**

### `/admin/purchase-orders` — **would open weekly · shows fabricated data**
`src/app/admin/purchase-orders/page.tsx:63-137` never calls the API. It renders three hardcoded POs
— ABC Supply Co. / John Smith / Jan 15 2024 — behind the comment *"the database tables don't exist
yet."* They do: `purchase_orders`, `purchase_order_items`, `purchase_order_receiving`,
`purchase_order_status_history` and `suppliers` all exist, and `GET /api/admin/purchase-orders`
returns a valid paginated response. **The create and receive flows are real and correctly wired**
(`create/page.tsx:304` POSTs; `[id]/page.tsx:325` posts `action: 'receive_items'`) — so a merchant
can create a genuine PO, and it will then be invisible forever, replaced on the list by ABC Supply
Co. This is worse than a missing feature; it is a working feature with its front door bricked up.
Also violates the repo's own rule in `CLAUDE.md`: *"Avoid using mocks unless explicitly requested."*
**Missing on create:** the supplier field is free text (`Enter supplier name`), not a picker against
the `suppliers` table, so "create a purchase order against a supplier record" (§3.6) is not what the
form does.

### `/admin/inventory/reports/valuation` — **would open monthly · correct, mislabeled**
The only report that works. Cost value, category breakdown, top-10 by value, CSV export, period
comparison toggle. Fix the margin denominator and drop the single-point trend chart and this is a
genuinely good page.

### `/admin/inventory/reports/turnover` — **should be deleted or rebuilt**
A stub that reports the entire catalog as dead with $0 value (§Numbers 3). Shipping this is worse
than shipping nothing: it is confidently, specifically wrong.

### `/admin/inventory/reports/dead-stock` — **would open monthly · disabled**
Uncomment two lines to restore it, then fix the query to measure days since last sale rather than
age of the product row (Q4).

### `/admin/analytics` — **would open weekly · one good tab, three misleading ones**
The **Search Analytics** tab is the best-realized idea in the product: query, count, avg results,
plus a `Zero Result Searches` table with last-searched dates — exactly the §3.8 promise, and
directly actionable. (It even contains a real insight nobody connected: `smartwatch` shows up in
zero-results *because* Pulse Smartwatch is out of stock. Linking those two is a small, high-value
feature.) The **Trends** tab, by contrast, contradicts itself four times and reports two hardcoded
constants as measurements (Q5). **Recommendation: keep Overview + Search, delete Trends, fold
Visitor Analytics into Overview.**

### `/admin/coupons` — **would open monthly · doubly broken**
Cannot list existing coupons (API 500s on a nonexistent `discounts` table, §Numbers 7) and cannot
create new ones (the `Textarea` crash). The feature is entirely inaccessible in both directions.

### `/admin/design` — **would open at setup, rarely after · genuinely excellent**
See [What is genuinely good](#what-is-genuinely-good).

### `/admin/blog` — **would open monthly · clean and works**
Correct counts, good empty-to-full progression, sensible actions. The only quibble is that
`Total Views 757` reconciles with no other traffic number in the app.

### `/admin/integrations` — **would open at setup · adequate**
Honest about what is and isn't connected, except the Stripe card, which shows an `Active` badge and
`Status: Not Configured` simultaneously.

### `/admin/integrations/shipstation` — **would open at setup · credentials only**
Per `docs/audits/shipstation-audit.md` P0-1/P0-2/P0-3, the credentials it displays are not the ones
the server accepts, "Test Connection" never contacts ShipStation, and "Generate New Credentials"
500s. Nothing to add except that it also carries zero operational information.

### `/admin/billing` — **would open once · genuinely good**
Honest, plain-language, explains the degraded environment and what to set to fix it, without
pretending. More pages should read like this one.

### `/admin/ai` — **would open once, then never · should be collapsed**
Seven cards, **four of them "Coming Soon."** A whole top-level nav slot spent advertising unbuilt
features to a paying customer. The three that work (Store Details, Blog Post, HS Code generators)
are utilities, not a destination.

### Pages that should be **merged or deleted**

The nav is 11 items for a merchant who needs about 6.

| Action | Item | Reason |
|---|---|---|
| **ADD** | **Orders** | The largest gap in the product. See below. |
| **Delete** | `AI Assistant` (nav item) | 4/7 cards unbuilt. Move Blog Post generator into Blog, HS Code into Inventory, Store Details into Page Design — each next to the thing it acts on. |
| **Merge** | `Purchase Orders` → into Inventory | It is already a tab there. Two doors to one room. |
| **Merge** | `Coupons & Discounts` → into Products, as "Pricing & promotions" | Low frequency; conceptually part of the catalog. |
| **Delete** | Analytics → `Trends` tab | Contradicts the other tabs; two of its metrics are literals. |
| **Fold** | Analytics → `Visitor Analytics` tab | Into Overview. |

Target nav: **Dashboard · Orders · Products · Inventory · Analytics · Page Design · Blog ·
Integrations · Billing.**

### The missing page: Orders

There is no `/admin/orders` route, no `/api/admin/orders` endpoint, and no nav entry — confirmed by
exhaustive search of `src/app/admin/**` and `src/app/api/admin/**`. Meanwhile the database holds 74
orders (27 for this store, $6,311.79), 51 tracking numbers, `refunded_amount`, full shipping
addresses, and per-line `discount_amount`.

Without it a merchant cannot: see what is unshipped; look up an order to answer "where is my
package?"; issue or verify a refund; see which coupon drove which sale; or confirm that anything
reached ShipStation. **This should be built before any other item in this report except the
`Textarea` crash.**

---

## Powerful underneath?

Yes — more than the surface suggests, and most of it is unreachable. Real engineering exists here
that a merchant would never find:

| Capability | State | Discoverability |
|---|---|---|
| Purchase order create + receive-into-stock with partial receipts, status history and PDF export | **Built and wired** | Unreachable — the list page shows mocks instead |
| Dead-stock analysis with carrying cost, liquidation value, recovery value | Component + API built | Commented out of the router |
| Supplier records, performance report | Table + API + UI tab | Report route commented out; 0 rows; supplier field on PO create is free text |
| HS code generation for customs | Working, `products.hs_code*` columns populated-ready | Buried under `AI Assistant`, not on the product page where a shipping decision is made |
| Demand forecasting across 7 windows | Built | All seven windows return the same number |
| Inventory snapshots (`inventory_snapshots`) | Table exists | Nothing reads it; the valuation trend chart has one point as a result |
| Job queue with retry/backoff for shipment emails | Built | Never drained (0 rows; see shipstation-audit P1-5) |
| ShipStation stock reconciliation | Query already `LEFT JOIN`s `inventory` | Never rendered |

The pattern is consistent and worth naming: **this codebase's failures are almost never missing
capability. They are last-mile wiring** — a commented import, a mock left in a list page, a query
against a renamed table, a status filter in the wrong clause, a `LEFT JOIN` that fans out. Perhaps
80% of the value in this report is recoverable by connecting things that already exist, which is a
much better position to be in than it looks from the screens.

---

## What is genuinely good

Specifically, and with credit:

1. **Page Design (`/admin/design`) is excellent** and would be competitive against Shopify's theme
   editor. Draggable section list with per-section show/duplicate/delete, live storefront preview
   rendering real seeded products, desktop/tablet/mobile toggles with an explicit `1280px · shown
   at 57% to fit` readout, undo/redo, and a genuine `Draft` / `Not live yet` / `Publish` /
   `Discard changes` state machine. Nothing about it is faked.

2. **The zero-result search table** (`Analytics → Search Analytics`) is the sharpest merchant
   insight in the app — query, count, last searched — and it does exactly what §3.8 promises.
   Demand you have and inventory you don't, in one table, no chart wrapped around it.

3. **The Smart Reorder Recommendations panel's information design.** Priority badge, plain-language
   reason, unit count, capital required, days-until-stockout, and a one-click path to a PO, all
   above the fold. The arithmetic behind it is broken, but the *shape* is right and it is the one
   place the product behaves like an operator's tool rather than a database viewer.

4. **Billing is honest.** "This environment has no Stripe keys, so subscriptions and storefront
   checkout are switched off… Everything else in the admin keeps working in the meantime." It names
   the missing variables. It does not pretend. Every degraded state in the app should read like this
   instead of resolving to an empty state.

5. **The inventory grid itself** — SKU, category, stock, forecast, reorder-at, unit cost, total
   value, per-row actions, supplier and stock filters, CSV export. Dense in the right way. This is
   the "powerful underneath" the owner is asking about, and it is real.

6. **`/admin/products`** labels its inventory value `At list price` — the only valuation figure in
   the app that states its basis. That is the standard the other three should meet.

---

## Fix order

Ranked by merchant impact per hour of work.

| # | Fix | Effort |
|---|---|---|
| 1 | Remove `minHeight: 88` from the `Textarea` theme override (`rebel-theme.ts:381`). Unblocks product edit, coupon edit, PO receiving, AI panel, advanced settings. | XS |
| 2 | Build `/admin/orders` with an Unshipped filter, order age and tracking number. | M |
| 3 | Fix the inventory stats fan-out — aggregate `products` without the `inventory_logs` join. | XS |
| 4 | Add gross profit + margin to the dashboard with a real period and a prior-period delta; drop `status = 'completed'` in favour of `status <> 'cancelled'`. | S |
| 5 | Delete the mock array in `purchase-orders/page.tsx`; call the API that already works. | XS |
| 6 | Point the coupons query at `coupons`, not `discounts`; surface API errors instead of empty states. | XS |
| 7 | Fix the margin denominator on the valuation report; label markup as markup. | XS |
| 8 | Key sales velocity off `orders.created_at`, not `order_items.created_at`; include `shipped`. | S |
| 9 | Uncomment the dead-stock report; re-base its age on last sale, not `p.created_at`. | S |
| 10 | Fix the dashboard `LEFT JOIN … AND o.status` bug and the visitors "this month" label. | XS |
| 11 | Delete or rebuild the turnover report. | S |
| 12 | Remove the hardcoded `bounceRate = 32.1` / `avgSessionDuration = 272`; delete the Trends tab. | XS |
| 13 | Add a `Margin %` column to `/admin/products`. | XS |
| 14 | Snapshot `unit_cost` onto `order_items` at checkout. | S |
| 15 | Collapse the nav from 11 items to 9 per the merge table. | S |

Items 1, 3, 5, 6, 7, 10, 12 are all extra-small and together remove most of the confidently-wrong
numbers in the product.
