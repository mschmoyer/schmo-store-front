import { Metadata } from 'next';

interface LandingPageMetaProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
}

export const generateLandingPageMeta = ({
  title = "RebelCart - Take Back Your Margins | Low-Cost Ecommerce Platform",
  description = "Build your shop, power it with your favorite shipping app, and keep your profits. RebelCart: The affordable ecommerce solution that rebels against expensive software fees.",
  keywords = "low cost ecommerce, online store, shipping platform, margins, profitable ecommerce, affordable storefront, rebel cart, ship efficiently, keep profits",
  ogImage = "/landing/og-image.jpg",
  canonicalUrl = "https://rebelcart.com"
}: LandingPageMetaProps = {}): Metadata => {
  return {
    title,
    description,
    keywords,
    authors: [{ name: "RebelCart Team" }],
    creator: "RebelCart",
    publisher: "RebelCart",
    robots: "index, follow",
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "website",
      title: "RebelCart - Take Back Your Margins | Build Your Shop",
      description: "Build your shop, power it with any shipping app, and keep your profits. The low-cost ecommerce solution that rebels against expensive software.",
      url: canonicalUrl,
      siteName: "RebelCart",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: "RebelCart - Take Back Your Margins | Low-Cost Ecommerce Platform",
        },
      ],
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: "RebelCart - Take Back Your Margins",
      description: "Build your shop, power it with any shipping app, and keep your profits. Rebel against expensive software fees.",
      images: [ogImage],
      creator: "@rebelcart",
      site: "@rebelcart",
    },
    verification: {
      google: "your-google-site-verification-code",
      yandex: "your-yandex-verification-code",
      yahoo: "your-yahoo-verification-code",
    },
    other: {
      "fb:app_id": "your-facebook-app-id",
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-status-bar-style": "black-translucent",
      "theme-color": "#dc2626",
      "msapplication-TileColor": "#dc2626",
    },
  };
};

// Structured data for the landing page
export const landingPageStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://rebelcart.com/#website",
      url: "https://rebelcart.com",
      name: "RebelCart",
      description: "Low-cost ecommerce platform that helps you keep your margins and ship efficiently",
      potentialAction: [
        {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://rebelcart.com/search?q={search_term_string}"
          },
          "query-input": "required name=search_term_string"
        }
      ]
    },
    {
      "@type": "Organization",
      "@id": "https://rebelcart.com/#organization",
      name: "RebelCart",
      url: "https://rebelcart.com",
      logo: {
        "@type": "ImageObject",
        url: "https://rebelcart.com/logo.png",
        width: 512,
        height: 512
      },
      sameAs: [
        "https://twitter.com/rebelcart",
        "https://facebook.com/rebelcart",
        "https://linkedin.com/company/rebelcart"
      ]
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://rebelcart.com/#software",
      name: "RebelCart",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: "Low-cost e-commerce platform for creating profitable online stores with any shipping platform",
      url: "https://rebelcart.com",
      screenshot: "https://rebelcart.com/landing/screenshot.jpg",
      softwareVersion: "1.0",
      releaseNotes: "Initial release with multi-platform shipping integration and margin-focused features",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        description: "Free trial, then low-cost monthly plans that keep your margins high",
        availability: "https://schema.org/InStock",
        validFrom: "2024-01-01"
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.8",
        ratingCount: "150",
        bestRating: "5",
        worstRating: "1"
      },
      review: [
        {
          "@type": "Review",
          author: {
            "@type": "Person",
            name: "Sarah Johnson"
          },
          reviewRating: {
            "@type": "Rating",
            ratingValue: "5",
            bestRating: "5"
          },
          reviewBody: "RebelCart saved us thousands in software fees while giving us better control over our margins. The shipping platform flexibility is amazing!"
        }
      ]
    },
    {
      "@type": "WebPage",
      "@id": "https://rebelcart.com/#webpage",
      url: "https://rebelcart.com",
      name: "RebelCart - Take Back Your Margins | Build Your Shop",
      isPartOf: {
        "@id": "https://rebelcart.com/#website"
      },
      about: {
        "@id": "https://rebelcart.com/#organization"
      },
      description: "Build your shop, power it with your favorite shipping app, and keep your profits. Low-cost ecommerce solution that rebels against expensive software.",
      breadcrumb: {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://schmostore.com"
          }
        ]
      },
      mainEntity: {
        "@id": "https://schmostore.com/#software"
      }
    }
  ]
};

// FAQ structured data
export const faqStructuredData = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How long does it take to set up a store?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most stores are set up in under 5 minutes. Simply connect your ShipStation account, choose a theme, and customize your store settings."
      }
    },
    {
      "@type": "Question",
      name: "Do I need technical skills to use Schmo Store?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No technical skills required! Our platform is designed to be user-friendly with drag-and-drop customization and automated ShipStation integration."
      }
    },
    {
      "@type": "Question",
      name: "What payment methods are supported?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We support all major payment methods including credit cards, PayPal, Apple Pay, and Google Pay through our integrated payment processing."
      }
    },
    {
      "@type": "Question",
      name: "Is there a free trial?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! We offer a 14-day free trial with full access to all features. No credit card required to start."
      }
    }
  ]
};