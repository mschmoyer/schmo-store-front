import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Eyebrow } from '@/components/ui';
import { SiteHeader } from '@/components/marketing/chrome/SiteHeader';
import { SiteFooter } from '@/components/marketing/chrome/SiteFooter';
import { HowItWorksSteps } from '@/components/marketing/home/HowItWorksSteps';
import { SyncSection } from '@/components/marketing/home/SyncSection';
import { AlreadyHaveIt } from '@/components/marketing/home/AlreadyHaveIt';
import { FaqSection } from '@/components/marketing/home/FaqSection';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { Reveal } from '@/components/marketing/parts/Reveal';
import { ROUTES } from '@/components/marketing/data/routes';
import { faqStructuredData } from '@/components/seo/LandingPageMeta';
import { generateLandingPageMeta } from '@/components/seo/LandingPageMeta';
import styles from './page.module.css';

export const metadata: Metadata = generateLandingPageMeta({
  title: 'How It Works — Live Store in Under 20 Minutes | RebelShops',
  description:
    'Paste your ShipStation API key, let your catalog sync, style it and publish. '
    + 'Honest time estimates for each step.',
  canonicalUrl: 'https://rebelshops.com/how-it-works',
});

/**
 * `/how-it-works` — copy deck §3.3 opened out into a page, followed by the
 * sync explanation the setup section's "How the sync works" CTA points at, and
 * the FAQ.
 *
 * @returns The how-it-works page.
 */
export default function HowItWorksPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />

      <SiteHeader />

      <main id="main">
        <section className={styles.head}>
          <div className={styles.headInner}>
            <Reveal>
              <Eyebrow rule className={styles.eyebrow}>
                How it works
              </Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className={styles.title}>
                From an API key to a live store, in one sitting.
              </h1>
            </Reveal>
            <Reveal delay={0.08}>
              <p className={styles.lede}>
                Nothing here needs code. The one genuinely technical step is generating a
                ShipStation API key, which takes about two minutes. Every estimate on this page is
                measured, not aspirational.
              </p>
            </Reveal>
            <Reveal delay={0.11}>
              <div className={styles.actions}>
                <Button as={Link} href={ROUTES.signUp} size="lg">
                  Start for $1
                </Button>
                <Button as={Link} href={ROUTES.demoStores} variant="secondary" size="lg">
                  See a live store
                </Button>
              </div>
            </Reveal>
          </div>
        </section>

        <HowItWorksSteps />
        <AlreadyHaveIt />
        <SyncSection />
        <FaqSection />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}
