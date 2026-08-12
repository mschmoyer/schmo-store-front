import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PLATFORM_INTRO_AMOUNT_CENTS,
  PLATFORM_INTRO_MONTHS,
  PLATFORM_LIST_AMOUNT_CENTS,
  buildIntroInvoiceSchedule,
  describeIntroOffer,
  formatCents,
} from '@/lib/billing/intro-offer';
import { PLATFORM_PLAN } from '@/lib/stripe/products';

export const metadata: Metadata = {
  title: 'Pricing — RebelShops',
  description:
    'One plan. $1 a month for your first three months, then $19.99 a month. Cancel any time.',
};

/**
 * Design tokens from `docs/design-system.md`, written with fallbacks so the page renders correctly
 * before the global token sheet lands. A design agent will restyle this route; the markup is kept
 * semantic and the copy/numbers come from the plan catalogue, not from hardcoded strings.
 */
const TOKENS = {
  paper: 'var(--paper, #FBFAF8)',
  raised: 'var(--paper-raised, #FFFFFF)',
  sunken: 'var(--paper-sunken, #F2F1ED)',
  ink900: 'var(--ink-900, #0E1014)',
  ink700: 'var(--ink-700, #22262F)',
  ink500: 'var(--ink-500, #5A626F)',
  ink200: 'var(--ink-200, #DCE0E6)',
  ember500: 'var(--ember-500, #F94E1B)',
  ember700: 'var(--ember-700, #B32D09)',
  mint500: 'var(--mint-500, #0FA871)',
  radiusLg: 'var(--radius-lg, 16px)',
  radiusSm: 'var(--radius-sm, 8px)',
  shadowSm: 'var(--shadow-sm, 0 1px 2px rgba(16,18,22,.06), 0 2px 6px rgba(16,18,22,.05))',
  display: 'var(--font-display, inherit)',
};

/**
 * Public pricing page.
 *
 * Every number on this page is derived from the same catalogue the Stripe checkout uses, so the
 * marketing copy and the actual charge can never drift apart.
 *
 * @returns The pricing page.
 */
export default function PricingPage(): React.ReactElement {
  const offer = describeIntroOffer();
  const schedule = buildIntroInvoiceSchedule(PLATFORM_INTRO_MONTHS + 1);

  return (
    <main style={{ background: TOKENS.paper, minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 24px 96px' }}>
        <header style={{ maxWidth: 720 }}>
          <p
            style={{
              fontSize: '0.75rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              fontWeight: 600,
              color: TOKENS.ember700,
              margin: 0,
            }}
          >
            Pricing
          </p>
          <h1
            style={{
              fontFamily: TOKENS.display,
              fontSize: 'clamp(2.75rem, 6vw, 4.5rem)',
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              color: TOKENS.ink900,
              margin: '12px 0 0',
            }}
          >
            One plan. {offer.introPrice} to start.
          </h1>
          <p
            style={{
              fontSize: '1.125rem',
              lineHeight: 1.6,
              color: TOKENS.ink500,
              margin: '20px 0 0',
            }}
          >
            Your ShipStation inventory. A storefront that sells it. {offer.headline}. No setup fee,
            no per-order fee from us, and your shopper payments land in your own Stripe account.
          </p>
        </header>

        <section
          aria-labelledby="plan-heading"
          style={{
            marginTop: 48,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 24,
            alignItems: 'start',
          }}
        >
          <article
            style={{
              background: TOKENS.raised,
              border: `1px solid ${TOKENS.ink200}`,
              borderRadius: TOKENS.radiusLg,
              boxShadow: TOKENS.shadowSm,
              padding: 32,
            }}
          >
            <h2
              id="plan-heading"
              style={{
                fontFamily: TOKENS.display,
                fontSize: '1.375rem',
                letterSpacing: '-0.015em',
                color: TOKENS.ink900,
                margin: 0,
              }}
            >
              {PLATFORM_PLAN.name}
            </h2>

            <p
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                margin: '20px 0 4px',
              }}
            >
              <span
                style={{
                  fontFamily: TOKENS.display,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 'clamp(2.25rem, 4vw, 3.25rem)',
                  lineHeight: 1.08,
                  letterSpacing: '-0.025em',
                  color: TOKENS.ink900,
                }}
              >
                {formatCents(PLATFORM_INTRO_AMOUNT_CENTS)}
              </span>
              <span style={{ color: TOKENS.ink500, fontSize: '1rem' }}>
                / month for {PLATFORM_INTRO_MONTHS} months
              </span>
            </p>

            <p style={{ color: TOKENS.ink500, fontSize: '0.9375rem', margin: '0 0 24px' }}>
              Then {formatCents(PLATFORM_LIST_AMOUNT_CENTS)} a month. Cancel any time.
            </p>

            <ul
              style={{
                listStyle: 'none',
                margin: '0 0 32px',
                padding: 0,
                display: 'grid',
                gap: 12,
              }}
            >
              {PLATFORM_PLAN.features.map((feature) => (
                <li
                  key={feature}
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'flex-start',
                    color: TOKENS.ink700,
                    fontSize: '0.9375rem',
                    lineHeight: 1.6,
                  }}
                >
                  <span aria-hidden="true" style={{ color: TOKENS.mint500, fontWeight: 700 }}>
                    &#10003;
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href="/admin/billing"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 48,
                padding: '0 24px',
                borderRadius: TOKENS.radiusSm,
                background: TOKENS.ember500,
                color: '#FFFFFF',
                fontSize: '1rem',
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: 'var(--shadow-ember, 0 2px 6px rgba(249,78,27,.24))',
              }}
            >
              Start for {offer.introPrice}
            </Link>
          </article>

          <aside
            aria-labelledby="billing-schedule-heading"
            style={{
              background: TOKENS.sunken,
              border: `1px solid ${TOKENS.ink200}`,
              borderRadius: TOKENS.radiusLg,
              padding: 32,
            }}
          >
            <h2
              id="billing-schedule-heading"
              style={{
                fontFamily: TOKENS.display,
                fontSize: '1.375rem',
                letterSpacing: '-0.015em',
                color: TOKENS.ink900,
                margin: 0,
              }}
            >
              What you actually pay
            </h2>
            <p style={{ color: TOKENS.ink500, fontSize: '0.875rem', margin: '8px 0 20px' }}>
              {offer.finePrint}
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <caption className="sr-only" style={{ position: 'absolute', left: -9999 }}>
                  Monthly billing schedule for the RebelShops plan
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      style={{
                        textAlign: 'left',
                        padding: '8px 0',
                        fontSize: '0.75rem',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: TOKENS.ink500,
                        borderBottom: `1px solid ${TOKENS.ink200}`,
                      }}
                    >
                      Month
                    </th>
                    <th
                      scope="col"
                      style={{
                        textAlign: 'right',
                        padding: '8px 0',
                        fontSize: '0.75rem',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: TOKENS.ink500,
                        borderBottom: `1px solid ${TOKENS.ink200}`,
                      }}
                    >
                      Charged
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((invoice) => (
                    <tr key={invoice.month}>
                      <th
                        scope="row"
                        style={{
                          textAlign: 'left',
                          padding: '10px 0',
                          fontWeight: 400,
                          color: TOKENS.ink700,
                          borderBottom: `1px solid ${TOKENS.ink200}`,
                        }}
                      >
                        {invoice.month === 1 ? 'Today' : `Month ${invoice.month}`}
                        {invoice.isIntro ? '' : ' onwards'}
                      </th>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '10px 0',
                          fontFamily: TOKENS.display,
                          fontWeight: 600,
                          color: TOKENS.ink900,
                          borderBottom: `1px solid ${TOKENS.ink200}`,
                        }}
                      >
                        {formatCents(invoice.amountDue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p style={{ color: TOKENS.ink500, fontSize: '0.875rem', margin: '20px 0 0' }}>
              Total for the first {PLATFORM_INTRO_MONTHS} months: <strong>{offer.introWindowTotal}</strong>.
            </p>
          </aside>
        </section>

        <section aria-labelledby="fees-heading" style={{ marginTop: 64, maxWidth: 720 }}>
          <h2
            id="fees-heading"
            style={{
              fontFamily: TOKENS.display,
              fontSize: 'clamp(1.75rem, 2.6vw, 2.25rem)',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              color: TOKENS.ink900,
              margin: 0,
            }}
          >
            What about payment fees?
          </h2>
          <p style={{ color: TOKENS.ink700, fontSize: '1rem', lineHeight: 1.6, marginTop: 16 }}>
            Shoppers pay you, not us. You connect your own Stripe account during setup, and card
            payments settle straight into it on Stripe&apos;s normal processing rates. RebelShops
            takes no cut of your orders on this plan.
          </p>
        </section>
      </div>
    </main>
  );
}
