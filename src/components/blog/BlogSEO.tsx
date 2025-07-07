'use client';

import Head from 'next/head';
import { BlogSEOProps } from '@/types/blog';
import { 
  generateMetaTitle, 
  generateMetaDescription, 
  extractTextFromHtml,
  getImageUrl,
  createBlogUrl
} from '@/lib/blogHelpers';

export default function BlogSEO({ post, isIndividualPost = false }: BlogSEOProps) {
  // Generate default values
  const siteName = 'Schmo Store';
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : '';
  
  const title = post.meta_title || generateMetaTitle(post.title, siteName);
  const description = post.meta_description || 
    post.excerpt || 
    generateMetaDescription(extractTextFromHtml(post.content));
  
  const imageUrl = getImageUrl(post.featured_image);
  const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${siteUrl}${imageUrl}`;
  
  const postUrl = `${siteUrl}${createBlogUrl(post.slug)}`;
  const blogUrl = `${siteUrl}/blog`;
  
  // Open Graph data
  const ogTitle = post.og_title || title;
  const ogDescription = post.og_description || description;
  const ogImage = post.og_image ? getImageUrl(post.og_image) : fullImageUrl;
  const fullOgImage = ogImage.startsWith('http') ? ogImage : `${siteUrl}${ogImage}`;
  
  // Twitter Card data
  const twitterTitle = post.twitter_title || title;
  const twitterDescription = post.twitter_description || description;
  const twitterImage = post.twitter_image ? getImageUrl(post.twitter_image) : fullImageUrl;
  const fullTwitterImage = twitterImage.startsWith('http') ? twitterImage : `${siteUrl}${twitterImage}`;
  
  // Structured data
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": title,
    "description": description,
    "image": fullImageUrl,
    "url": postUrl,
    "datePublished": post.published_at || post.created_at,
    "dateModified": post.updated_at,
    "author": {
      "@type": "Organization",
      "name": siteName
    },
    "publisher": {
      "@type": "Organization",
      "name": siteName,
      "logo": {
        "@type": "ImageObject",
        "url": `${siteUrl}/logo.svg`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": postUrl
    }
  };

  // Blog listing structured data
  const blogStructuredData = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": `${siteName} Blog`,
    "description": `Stay updated with the latest from ${siteName}`,
    "url": blogUrl,
    "publisher": {
      "@type": "Organization",
      "name": siteName,
      "logo": {
        "@type": "ImageObject",
        "url": `${siteUrl}/logo.svg`
      }
    }
  };

  return (
    <Head>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={post.tags?.join(', ')} />
      <link rel="canonical" href={isIndividualPost ? postUrl : blogUrl} />

      {/* Open Graph Tags */}
      <meta property="og:type" content={isIndividualPost ? "article" : "website"} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:title" content={ogTitle} />
      <meta property="og:description" content={ogDescription} />
      <meta property="og:image" content={fullOgImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={isIndividualPost ? postUrl : blogUrl} />
      <meta property="og:locale" content="en_US" />

      {/* Article-specific Open Graph tags */}
      {isIndividualPost && (
        <>
          <meta property="article:published_time" content={post.published_at || post.created_at} />
          <meta property="article:modified_time" content={post.updated_at} />
          <meta property="article:author" content={siteName} />
          <meta property="article:section" content={post.categories?.[0] || 'Blog'} />
          {post.tags?.map((tag, index) => (
            <meta key={index} property="article:tag" content={tag} />
          ))}
        </>
      )}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@schmostore" />
      <meta name="twitter:creator" content="@schmostore" />
      <meta name="twitter:title" content={twitterTitle} />
      <meta name="twitter:description" content={twitterDescription} />
      <meta name="twitter:image" content={fullTwitterImage} />
      <meta name="twitter:image:alt" content={`Featured image for ${post.title}`} />

      {/* Additional Meta Tags */}
      <meta name="robots" content="index, follow" />
      <meta name="googlebot" content="index, follow" />
      <meta name="author" content={siteName} />
      <meta name="publisher" content={siteName} />
      <meta name="format-detection" content="telephone=no" />
      
      {/* Theme Color */}
      <meta name="theme-color" content="#10b981" />
      <meta name="msapplication-navbutton-color" content="#10b981" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

      {/* Preconnect for performance */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

      {/* JSON-LD Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(isIndividualPost ? structuredData : blogStructuredData)
        }}
      />

      {/* Breadcrumb Structured Data for individual posts */}
      {isIndividualPost && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "position": 1,
                  "name": "Home",
                  "item": siteUrl
                },
                {
                  "@type": "ListItem",
                  "position": 2,
                  "name": "Blog",
                  "item": blogUrl
                },
                ...(post.categories && post.categories.length > 0 ? [{
                  "@type": "ListItem",
                  "position": 3,
                  "name": post.categories[0],
                  "item": `${blogUrl}?category=${post.categories[0]}`
                }] : []),
                {
                  "@type": "ListItem",
                  "position": post.categories && post.categories.length > 0 ? 4 : 3,
                  "name": post.title,
                  "item": postUrl
                }
              ]
            })
          }}
        />
      )}

      {/* FAQ Schema for longer posts */}
      {isIndividualPost && post.reading_time && post.reading_time > 5 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "FAQPage",
              "mainEntity": {
                "@type": "Question",
                "name": `What is ${post.title} about?`,
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": description
                }
              }
            })
          }}
        />
      )}

      {/* Reading time meta tag */}
      {post.reading_time && (
        <meta name="reading-time" content={`${post.reading_time} minutes`} />
      )}

      {/* View count meta tag */}
      {post.view_count && post.view_count > 0 && (
        <meta name="view-count" content={post.view_count.toString()} />
      )}

      {/* Last modified meta tag */}
      <meta name="last-modified" content={post.updated_at} />

      {/* Content language */}
      <meta httpEquiv="content-language" content="en-US" />

      {/* RSS Feed */}
      <link 
        rel="alternate" 
        type="application/rss+xml" 
        title={`${siteName} Blog RSS Feed`} 
        href={`${siteUrl}/blog/rss.xml`} 
      />

      {/* Sitemap */}
      <link rel="sitemap" type="application/xml" href={`${siteUrl}/sitemap.xml`} />
    </Head>
  );
}