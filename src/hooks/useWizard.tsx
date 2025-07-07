'use client';

import { useState, useCallback, useContext, createContext } from 'react';
import { 
  WizardState, 
  WizardContextType, 
  WizardData, 
  WizardStep,
  WIZARD_STEPS,
  WIZARD_STEP_TITLES,
  WIZARD_STEP_DESCRIPTIONS
} from '@/types/wizard';

// Initial wizard state
const initialWizardState: WizardState = {
  currentStep: 0,
  totalSteps: 3,
  steps: [
    {
      id: 'account',
      title: WIZARD_STEP_TITLES[WIZARD_STEPS.ACCOUNT],
      description: WIZARD_STEP_DESCRIPTIONS[WIZARD_STEPS.ACCOUNT],
      isCompleted: false,
      isActive: true,
      isAccessible: true,
    },
    {
      id: 'store',
      title: WIZARD_STEP_TITLES[WIZARD_STEPS.STORE],
      description: WIZARD_STEP_DESCRIPTIONS[WIZARD_STEPS.STORE],
      isCompleted: false,
      isActive: false,
      isAccessible: false,
    },
    {
      id: 'success',
      title: WIZARD_STEP_TITLES[WIZARD_STEPS.SUCCESS],
      description: WIZARD_STEP_DESCRIPTIONS[WIZARD_STEPS.SUCCESS],
      isCompleted: false,
      isActive: false,
      isAccessible: false,
    },
  ],
  data: {
    account: {
      email: '',
      password: '',
      confirmPassword: '',
    },
    store: {
      title: '',
      description: '',
      slug: '',
      theme: 'default',
    },
  },
  errors: {},
  loading: false,
  completed: false,
};

// Wizard Context
const WizardContext = createContext<WizardContextType | undefined>(undefined);

// Wizard Provider Component
export function WizardProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>(initialWizardState);

  // Update step accessibility
  const updateStepAccessibility = useCallback((steps: WizardStep[], currentStep: number) => {
    return steps.map((step, index) => ({
      ...step,
      isActive: index === currentStep,
      isAccessible: index <= currentStep || step.isCompleted,
    }));
  }, []);

  // Navigate to next step
  const nextStep = useCallback(() => {
    setState(prev => {
      if (prev.currentStep < prev.totalSteps - 1) {
        const newCurrentStep = prev.currentStep + 1;
        const newSteps = updateStepAccessibility(prev.steps, newCurrentStep);
        
        // Mark current step as completed
        newSteps[prev.currentStep].isCompleted = true;
        
        return {
          ...prev,
          currentStep: newCurrentStep,
          steps: newSteps,
        };
      }
      return prev;
    });
  }, [updateStepAccessibility]);

  // Navigate to previous step
  const prevStep = useCallback(() => {
    setState(prev => {
      if (prev.currentStep > 0) {
        const newCurrentStep = prev.currentStep - 1;
        const newSteps = updateStepAccessibility(prev.steps, newCurrentStep);
        
        return {
          ...prev,
          currentStep: newCurrentStep,
          steps: newSteps,
        };
      }
      return prev;
    });
  }, [updateStepAccessibility]);

  // Navigate to specific step
  const goToStep = useCallback((step: number) => {
    setState(prev => {
      if (step >= 0 && step < prev.totalSteps && prev.steps[step].isAccessible) {
        const newSteps = updateStepAccessibility(prev.steps, step);
        
        return {
          ...prev,
          currentStep: step,
          steps: newSteps,
        };
      }
      return prev;
    });
  }, [updateStepAccessibility]);

  // Update wizard data
  const updateData = useCallback((
    stepName: keyof WizardData, 
    data: Partial<WizardData[keyof WizardData]>
  ) => {
    setState(prev => ({
      ...prev,
      data: {
        ...prev.data,
        [stepName]: {
          ...prev.data[stepName],
          ...data,
        },
      },
    }));
  }, []);

  // Set error
  const setError = useCallback((field: string, message: string) => {
    setState(prev => ({
      ...prev,
      errors: {
        ...prev.errors,
        [field]: message,
      },
    }));
  }, []);

  // Clear specific error
  const clearError = useCallback((field: string) => {
    setState(prev => {
      const newErrors = { ...prev.errors };
      delete newErrors[field];
      return {
        ...prev,
        errors: newErrors,
      };
    });
  }, []);

  // Clear all errors
  const clearErrors = useCallback(() => {
    setState(prev => ({
      ...prev,
      errors: {},
    }));
  }, []);

  // Set loading state
  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({
      ...prev,
      loading,
    }));
  }, []);

  // Complete wizard
  const completeWizard = useCallback((storeUrl: string, storeId: string) => {
    setState(prev => ({
      ...prev,
      completed: true,
      storeUrl,
      storeId,
      steps: prev.steps.map(step => ({
        ...step,
        isCompleted: true,
      })),
    }));
  }, []);

  // Reset wizard
  const resetWizard = useCallback(() => {
    setState(initialWizardState);
  }, []);

  const value: WizardContextType = {
    state,
    nextStep,
    prevStep,
    goToStep,
    updateData,
    setError,
    clearError,
    clearErrors,
    setLoading,
    completeWizard,
    resetWizard,
  };

  return <WizardContext.Provider value={value}>{children}</WizardContext.Provider>;
}

// Use Wizard Hook
export function useWizard(): WizardContextType {
  const context = useContext(WizardContext);
  if (context === undefined) {
    throw new Error('useWizard must be used within a WizardProvider');
  }
  return context;
}

// Wizard Progress Hook
export function useWizardProgress() {
  const { state } = useWizard();
  
  const progress = ((state.currentStep + 1) / state.totalSteps) * 100;
  const isFirstStep = state.currentStep === 0;
  const isLastStep = state.currentStep === state.totalSteps - 1;
  const canProceed = !state.loading && !Object.keys(state.errors).length;

  return {
    progress,
    isFirstStep,
    isLastStep,
    canProceed,
    currentStep: state.currentStep,
    totalSteps: state.totalSteps,
    currentStepData: state.steps[state.currentStep],
  };
}

// Wizard Validation Hook
export function useWizardValidation() {
  const { state, setError, clearError } = useWizard();

  const validateAccountStep = useCallback(() => {
    const { account } = state.data;
    const errors: Record<string, string> = {};

    if (!account.email) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(account.email)) {
      errors.email = 'Invalid email format';
    }

    if (!account.password) {
      errors.password = 'Password is required';
    } else if (account.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (!account.confirmPassword) {
      errors.confirmPassword = 'Password confirmation is required';
    } else if (account.password !== account.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    return errors;
  }, [state.data]);

  const validateStoreStep = useCallback(() => {
    const { store } = state.data;
    const errors: Record<string, string> = {};

    if (!store.title) {
      errors.title = 'Store title is required';
    } else if (store.title.length < 3) {
      errors.title = 'Store title must be at least 3 characters';
    }

    if (!store.description) {
      errors.description = 'Store description is required';
    } else if (store.description.length < 10) {
      errors.description = 'Store description must be at least 10 characters';
    }

    if (!store.slug) {
      errors.slug = 'Store slug is required';
    } else if (!/^[a-z0-9-]+$/.test(store.slug)) {
      errors.slug = 'Store slug can only contain lowercase letters, numbers, and hyphens';
    }

    if (!store.theme) {
      errors.theme = 'Theme selection is required';
    }

    return errors;
  }, [state.data]);

  const validateCurrentStep = useCallback(() => {
    let errors: Record<string, string> = {};

    switch (state.currentStep) {
      case WIZARD_STEPS.ACCOUNT:
        errors = validateAccountStep();
        break;
      case WIZARD_STEPS.STORE:
        errors = validateStoreStep();
        break;
      default:
        break;
    }

    // Set errors
    Object.keys(errors).forEach(field => {
      setError(field, errors[field]);
    });

    // Clear errors that are no longer present
    Object.keys(state.errors).forEach(field => {
      if (!errors[field]) {
        clearError(field);
      }
    });

    return Object.keys(errors).length === 0;
  }, [state.currentStep, state.errors, validateAccountStep, validateStoreStep, setError, clearError]);

  return {
    validateCurrentStep,
    validateAccountStep,
    validateStoreStep,
  };
}

// Wizard Submission Hook
export function useWizardSubmission() {
  const { state, setLoading, setError, completeWizard } = useWizard();

  const submitWizard = useCallback(async () => {
    setLoading(true);
    
    try {
      // Submit account and store data
      const response = await fetch('/api/stores/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          account: state.data.account,
          store: state.data.store,
        }),
      });

      const data = await response.json();

      if (data.success) {
        completeWizard(data.storeUrl, data.storeId);
        return { success: true, data };
      } else {
        setError('submission', data.error || 'Failed to create store');
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Wizard submission error:', error);
      setError('submission', 'An unexpected error occurred');
      return { success: false, error: 'An unexpected error occurred' };
    } finally {
      setLoading(false);
    }
  }, [state.data, setLoading, setError, completeWizard]);

  return { submitWizard };
}

// Wizard Data Hook
export function useWizardData() {
  const { state, updateData } = useWizard();

  const updateAccountData = useCallback((data: Partial<WizardData['account']>) => {
    updateData('account', data);
  }, [updateData]);

  const updateStoreData = useCallback((data: Partial<WizardData['store']>) => {
    updateData('store', data);
  }, [updateData]);

  return {
    data: state.data,
    updateAccountData,
    updateStoreData,
  };
}

// Wizard State Hook
export function useWizardState() {
  const { state } = useWizard();

  return {
    currentStep: state.currentStep,
    totalSteps: state.totalSteps,
    steps: state.steps,
    data: state.data,
    errors: state.errors,
    loading: state.loading,
    completed: state.completed,
    storeUrl: state.storeUrl,
    storeId: state.storeId,
    hasErrors: Object.keys(state.errors).length > 0,
    isComplete: state.completed,
  };
}

export default useWizard;