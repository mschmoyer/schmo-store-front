import { redirect } from 'next/navigation';

/**
 * Legacy admin sign-in, now a permanent redirect to the single sign-in page.
 *
 * There were two sign-in screens. `/login` wrote its session under one
 * localStorage key and `/admin` read another, so signing in on the marketing
 * site succeeded, landed on `/admin`, found nothing, and bounced the merchant
 * to *this* page to sign in a second time with the same credentials.
 *
 * This page was also the last piece of pre-design-system UI in the product — a
 * `linear-gradient(135deg, #667eea 0%, #764ba2 100%)` panel, which is why the
 * second sign-in appeared as an unexplained blue/purple screen in the middle
 * of a white and near-black product.
 *
 * The route is kept rather than deleted because bookmarks and old links point
 * at it.
 *
 * @returns Never; always redirects.
 */
export default function AdminLoginRedirect(): never {
  redirect('/login');
}
