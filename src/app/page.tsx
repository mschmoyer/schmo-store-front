'use client';

import { Header } from '@/components/landing/Header';
import { Hero } from '@/components/landing/Hero';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { DemoStores } from '@/components/landing/DemoStores';
// import { CTASection } from '@/components/landing/CTASection';
import { Footer } from '@/components/landing/Footer';
import { landingPageStructuredData, faqStructuredData } from '@/components/seo/LandingPageMeta';
import { useEffect } from 'react';
import { initializeAnalytics } from '@/lib/analytics';

export default function Home() {
  useEffect(() => {
    const cleanup = initializeAnalytics();
    return cleanup;
  }, []);
  return (
    <div className="min-h-screen">
      {/* Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(landingPageStructuredData),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqStructuredData),
        }}
      />

      {/* Header */}
      <Header />

      {/* Hero Section */}
      <Hero />

      {/* Features Section */}
      <Features />

      {/* How It Works Section */}
      <HowItWorks />

      {/* Demo Stores Section */}
      <DemoStores />

      {/* Final CTA Section */}
      {/*<CTASection />*/}

      {/* Footer */}
      <Footer />
    </div>
  );
}
