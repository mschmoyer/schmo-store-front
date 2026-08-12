/**
 * Server-side Stripe layer.
 *
 * Import from here rather than reaching into individual modules, so that the server-only surface
 * stays easy to audit.
 */

export {
  STRIPE_API_VERSION,
  StripeNotConfiguredError,
  getAppBaseUrl,
  getStripe,
  getWebhookSecret,
  isStripeConfigured,
  isStripePubliclyConfigured,
  resetStripeClient,
  tryGetStripe,
} from './client';

export {
  PLATFORM_INTRO_COUPON_ID,
  PLATFORM_PLAN,
  PLATFORM_PLAN_KEY,
  PLATFORM_PRICE_LOOKUP_KEY,
  ensurePlatformProduct,
} from './products';
export type { PlatformPlanDefinition } from './products';

export {
  ensureIntroCoupon,
  ensurePlatformPlan,
  ensurePlatformPrice,
  findIntroCoupon,
  findPlatformPrice,
} from './prices';
export type { PlatformPlanObjects } from './prices';

export {
  HANDLED_EVENT_TYPES,
  WebhookSignatureError,
  constructStripeEvent,
  dispatchStripeEvent,
  isHandledEventType,
  readRawBody,
} from './webhooks';
export type {
  HandledEventType,
  StripeEventHandler,
  StripeEventHandlerMap,
  WebhookDispatchOutcome,
} from './webhooks';

export {
  canAcceptCharges,
  createConnectedAccount,
  createExpressDashboardLink,
  createOnboardingLink,
  deriveOnboardingStatus,
  isLiveMode,
  refreshAccountStatus,
  summarizeAccount,
} from './connect';
export type {
  ConnectAccountStatus,
  ConnectOnboardingStatus,
  CreateConnectedAccountInput,
} from './connect';
