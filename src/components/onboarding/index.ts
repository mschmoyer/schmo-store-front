/**
 * Onboarding — the signup wizard that turns a ShipStation account into a
 * storefront. Step content, the state hook and the pure logic the server shares.
 */

export { default as OnboardingWizard } from './OnboardingWizard';
export { default as PasswordStrength } from './PasswordStrength';
export { default as ApiKeyInput } from './ApiKeyInput';
export { default as PresetThumbnail } from './PresetThumbnail';
export { useOnboarding, type OnboardingApi, type OnboardingApiError } from './useOnboarding';
export { useSlugAvailability, SLUG_DEBOUNCE_MS } from './useSlugAvailability';

export * from './lib/slug';
export * from './lib/password';
export * from './lib/steps';
export * from './lib/types';
