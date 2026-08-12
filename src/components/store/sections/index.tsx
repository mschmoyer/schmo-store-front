import { Fragment, type ReactNode } from 'react';

import type { SectionType } from '@/lib/storefront-theme';

import { BlogPosts } from './BlogPosts';
import { CollectionGrid } from './CollectionGrid';
import { Countdown } from './Countdown';
import { Faq } from './Faq';
import { FeaturedCollection } from './FeaturedCollection';
import { Hero } from './Hero';
import { ImageWithText } from './ImageWithText';
import { LogoBar } from './LogoBar';
import { Newsletter } from './Newsletter';
import { RichText } from './RichText';
import { SectionBoundary } from './SectionBoundary';
import { Testimonials } from './Testimonials';
import { ValueProps } from './ValueProps';
import type { SectionComponent, SectionContext, SectionProps } from './types';

export type { SectionContext, SectionProps } from './types';
export { NewsletterForm } from './NewsletterForm';

/**
 * The one registry that maps a section type to its component (spec section 8).
 *
 * Adding a section type means adding an entry here and a definition in the
 * engine's `sections.ts`. It must never mean touching the page, the customizer,
 * or a `switch` somewhere else — this map is the only place the association
 * lives.
 */
export const SECTION_COMPONENTS: Record<SectionType, SectionComponent> = {
  hero: Hero,
  'featured-collection': FeaturedCollection,
  'collection-grid': CollectionGrid,
  'rich-text': RichText,
  'image-with-text': ImageWithText,
  'value-props': ValueProps,
  testimonials: Testimonials,
  faq: Faq,
  newsletter: Newsletter,
  'blog-posts': BlogPosts,
  'logo-bar': LogoBar,
  countdown: Countdown,
};

/**
 * Render one section, absorbing anything it does wrong.
 *
 * There are two independent failure paths and both are covered:
 *
 *  - **Server-side** — a section that throws while querying the catalogue is
 *    caught here, logged, and replaced with nothing. Without this, one bad
 *    section id would reject the page's render and the shopper would get an
 *    error page instead of a shop.
 *  - **Client-side** — a section that throws during hydration is caught by
 *    {@link SectionBoundary}.
 *
 * Unknown types are not an error: an older renderer meeting a newer theme
 * simply skips what it does not understand.
 *
 * @param props.section - The section to render
 * @param props.ctx - Shared page context
 * @returns The rendered section, wrapped for selection in the customizer
 */
export async function RenderSection({ section, ctx }: SectionProps) {
  if (!section.enabled) return null;

  const Component = Object.prototype.hasOwnProperty.call(SECTION_COMPONENTS, section.type)
    ? SECTION_COMPONENTS[section.type]
    : undefined;

  if (!Component) {
    if (!ctx.isPreview) return null;
    return (
      <SectionBoundary sectionId={section.id} sectionType={section.type} showFailures>
        {null}
      </SectionBoundary>
    );
  }

  let content: ReactNode = null;
  try {
    content = await Component({ section, ctx });
  } catch (error) {
    console.error(
      `[storefront] section "${section.id}" (${section.type}) threw while rendering`,
      error,
    );
    if (!ctx.isPreview) return null;
    content = null;
  }

  if (content === null || content === undefined) return null;

  return (
    // `data-section-id` is what the preview bridge uses to report a click back
    // to the customizer and to reorder sections without a reload.
    <div data-section-id={section.id} data-section-type={section.type}>
      <SectionBoundary
        sectionId={section.id}
        sectionType={section.type}
        showFailures={ctx.isPreview}
      >
        {content}
      </SectionBoundary>
    </div>
  );
}

/**
 * Render an ordered section list.
 * @param props.sections - The theme's sections, in order
 * @param props.ctx - Shared page context
 * @returns The composed home page body
 */
export async function SectionList({
  sections,
  ctx,
}: {
  sections: SectionProps['section'][];
  ctx: SectionContext;
}) {
  const rendered = await Promise.all(
    sections.map((section) => RenderSection({ section, ctx })),
  );

  // A plain fragment per entry keeps each section element a direct child of the
  // sections root, which is what the preview bridge's reordering relies on.
  return (
    <div data-sections-root="">
      {rendered.map((node, index) => (
        <Fragment key={sections[index].id}>{node}</Fragment>
      ))}
    </div>
  );
}
