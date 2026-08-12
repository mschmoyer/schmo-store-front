import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { SiteHeader } from '@/components/marketing/chrome/SiteHeader';
import { SiteFooter } from '@/components/marketing/chrome/SiteFooter';
import { HowItWorksSteps } from '@/components/marketing/home/HowItWorksSteps';
import { AlreadyHaveIt } from '@/components/marketing/home/AlreadyHaveIt';
import { FaqSection } from '@/components/marketing/home/FaqSection';
import { FinalCta } from '@/components/marketing/home/FinalCta';
import { PageHead } from '@/components/marketing/parts/PageHead';
import { ROUTES } from '@/components/marketing/data/routes';
import { faqStructuredData, generateLandingPageMeta } from '@/components/seo/LandingPageMeta';

export const metadata: Metadata = generateLandingPageMeta({
  title: 'How It Works — Live Store in Under 20 Minutes | RebelShops',
  description:
    'Paste your ShipStation API key, let your catalog sync, style it and publish. '
    + 'Honest time estimates for each step.',
  canonicalUrl: 'https://rebelshops.com/how-it-works',
});

/**
 * `/how-it-works` — copy deck §3.3 opened out into a page.
 *
 * This is the page that carries the three steps at full depth, WITH the screen
 * facsimiles. The homepage renders the same component with `showFigures={false}`
 * so it gets the argument without ~900px of illustration.
 *
 * The FAQ renders here rather than on the homepage, which is also where the
 * `FAQPage` structured data is published — the schema has to sit on a page that
 * actually shows the answers.
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
        <PageHead
          eyebrow="How it works"
          title="Three steps. One sitting."
          lede="Times below are real, measured on a catalog of a few hundred SKUs. A very large catalog takes longer to sync — you don’t have to sit and watch it."
        >
          <Button as={Link} href={ROUTES.signUp} size="lg">
            Start for $1
          </Button>
          <Button as={Link} href={ROUTES.demoStores} variant="secondary" size="lg">
            See a live store
          </Button>
        </PageHead>

        <HowItWorksSteps hideIntro hideCta />
        <AlreadyHaveIt />
        <FaqSection />
        <FinalCta />
      </main>

      <SiteFooter />
    </>
  );
}
