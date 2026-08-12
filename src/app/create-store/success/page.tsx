import { redirect } from 'next/navigation';

/**
 * `/create-store/success` — retired.
 *
 * The launch screen is now the final state of the wizard itself (`launch` step),
 * rendered from durable server-side onboarding state rather than from query
 * parameters. Old links land here; send them to the wizard, which resumes to
 * the launch screen for anyone who has finished.
 *
 * @returns Never — always redirects
 */
export default function CreateStoreSuccessPage(): never {
  redirect('/create-store');
}
