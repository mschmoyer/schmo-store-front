import { RegisterCredentials } from './auth';
import { StoreConfig } from './store';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  isCompleted: boolean;
  isActive: boolean;
  isAccessible: boolean;
}

export interface AccountStepData {
  email: string;
  password: string;
  confirmPassword: string;
}

export interface StoreStepData {
  title: string;
  description: string;
  slug: string;
  theme: string;
}

export interface WizardData {
  account: AccountStepData;
  store: StoreStepData;
}

export interface WizardState {
  currentStep: number;
  totalSteps: number;
  steps: WizardStep[];
  data: WizardData;
  errors: Record<string, string>;
  loading: boolean;
  completed: boolean;
  storeUrl?: string;
  storeId?: string;
}

export interface WizardContextType {
  state: WizardState;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  updateData: (stepName: keyof WizardData, data: Partial<WizardData[keyof WizardData]>) => void;
  setError: (field: string, message: string) => void;
  clearError: (field: string) => void;
  clearErrors: () => void;
  setLoading: (loading: boolean) => void;
  completeWizard: (storeUrl: string, storeId: string) => void;
  resetWizard: () => void;
}

export interface WizardStepProps {
  onNext: () => void;
  onPrev: () => void;
  isLoading: boolean;
  canProceed: boolean;
}

export interface StepValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

export interface WizardFormData {
  // Account step
  email: string;
  password: string;
  confirmPassword: string;
  
  // Store step
  storeTitle: string;
  storeDescription: string;
  storeSlug: string;
  storeTheme: string;
}

export interface WizardSubmissionData {
  account: RegisterCredentials;
  store: StoreConfig;
}

export interface WizardValidationErrors {
  account?: {
    email?: string;
    password?: string;
    confirmPassword?: string;
  };
  store?: {
    title?: string;
    description?: string;
    slug?: string;
    theme?: string;
  };
  general?: string;
}

export interface WizardApiResponse {
  success: boolean;
  data?: {
    userId: string;
    storeId: string;
    storeUrl: string;
    token: string;
  };
  message?: string;
  error?: string;
  validationErrors?: WizardValidationErrors;
}

export interface StepComponentProps {
  data: WizardData;
  updateData: (stepName: keyof WizardData, data: Partial<WizardData[keyof WizardData]>) => void;
  errors: Record<string, string>;
  setError: (field: string, message: string) => void;
  clearError: (field: string) => void;
  isLoading: boolean;
  onNext: () => void;
  onPrev: () => void;
  canProceed: boolean;
}

export interface SuccessStepProps {
  storeUrl: string;
  storeId: string;
  onComplete: () => void;
}

export interface WizardProgressProps {
  currentStep: number;
  totalSteps: number;
  steps: WizardStep[];
  onStepClick?: (step: number) => void;
}

export interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onComplete?: () => void;
  canProceed: boolean;
  isLoading: boolean;
  nextLabel?: string;
  prevLabel?: string;
  completeLabel?: string;
}

export interface WizardConfig {
  steps: {
    id: string;
    title: string;
    description?: string;
    component: React.ComponentType<StepComponentProps>;
    validation: (data: WizardData) => StepValidationResult;
  }[];
  onComplete: (data: WizardSubmissionData) => Promise<WizardApiResponse>;
  onError: (error: string) => void;
  onSuccess: (result: WizardApiResponse) => void;
}

export interface SlugGenerationState {
  isGenerating: boolean;
  generatedSlug: string;
  suggestions: string[];
  isAvailable: boolean;
  isChecking: boolean;
  error?: string;
}

export interface ThemePreview {
  name: string;
  displayName: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  preview: string; // URL to preview image
}

// Wizard step constants
export const WIZARD_STEPS = {
  ACCOUNT: 0,
  STORE: 1,
  SUCCESS: 2,
} as const;

export const WIZARD_STEP_TITLES = {
  [WIZARD_STEPS.ACCOUNT]: 'Create Account',
  [WIZARD_STEPS.STORE]: 'Configure Store',
  [WIZARD_STEPS.SUCCESS]: 'Success!',
} as const;

export const WIZARD_STEP_DESCRIPTIONS = {
  [WIZARD_STEPS.ACCOUNT]: 'Set up your merchant account with email and password',
  [WIZARD_STEPS.STORE]: 'Configure your store details and choose a theme',
  [WIZARD_STEPS.SUCCESS]: 'Your store has been created successfully!',
} as const;

export type WizardStepType = typeof WIZARD_STEPS[keyof typeof WIZARD_STEPS];