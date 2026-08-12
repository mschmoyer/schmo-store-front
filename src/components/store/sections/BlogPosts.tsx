import Image from 'next/image';
import Link from 'next/link';

import { getBlogPosts } from '@/app/store/_lib/queries';
import { bool, num, str } from '@/app/store/_lib/settings';

import { SectionHeading, StoreBand, StoreContainer } from '../ui';
import type { SectionProps } from './types';
import styles from './Sections.module.css';

/**
 * Format a publication date deterministically.
 *
 * The locale and time zone are both pinned. An unpinned `toLocaleDateString`
 * renders in the server's zone during SSR and the visitor's in the browser,
 * which flips the date by a day for a chunk of the world and triggers a
 * hydration mismatch on the way.
 *
 * @param value - The publication timestamp
 * @returns A formatted date, or an empty string
 */
function formatDate(value: Date | null): string {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

/**
 * The most recent posts from the store's journal.
 *
 * Removes itself when the shop has not published anything, rather than showing
 * a heading above an empty row.
 *
 * @param props - {@link SectionProps}
 * @returns A band of post cards, or null
 */
export async function BlogPosts({ section, ctx }: SectionProps) {
  const { settings } = section;
  const { store } = ctx;

  const posts = await getBlogPosts(store.id, num(settings, 'limit', 3, 1, 9));
  if (posts.length === 0) return null;

  const showExcerpt = bool(settings, 'showExcerpt', true);
  const showDate = bool(settings, 'showDate', true);

  return (
    <StoreBand tone="surface">
      <StoreContainer>
        <SectionHeading heading={str(settings, 'heading', 'From the journal')} />
        <div className={styles.posts}>
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${store.storeSlug}/${post.slug}`}
              className={styles.post}
            >
              {post.featuredImageUrl ? (
                <span className={styles.postMedia}>
                  <Image
                    src={post.featuredImageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 100vw, 33vw"
                    aria-hidden="true"
                  />
                </span>
              ) : null}
              {showDate && post.publishedAt ? (
                <span className={styles.postMeta}>{formatDate(post.publishedAt)}</span>
              ) : null}
              <span className={styles.postTitle}>{post.title}</span>
              {showExcerpt && post.excerpt ? (
                <span className={styles.postExcerpt}>{post.excerpt}</span>
              ) : null}
            </Link>
          ))}
        </div>
      </StoreContainer>
    </StoreBand>
  );
}
