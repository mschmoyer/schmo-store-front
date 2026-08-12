import type { Metadata } from 'next';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

export const metadata: Metadata = {
  title: 'Set up your store · RebelShops',
  description:
    'Create your account, connect ShipStation and publish a storefront built on the catalog you already have.',
};

/**
 * `/create-store` — the setup wizard.
 *
 * The page itself is a server component with nothing but metadata; all state
 * lives server-side in `onboarding_sessions` and is fetched by the wizard, so
 * arriving here with a session cookie resumes rather than restarts.
 *
 * @returns The onboarding wizard page
 */
export default function CreateStorePage() {
  return <OnboardingWizard />;
}
