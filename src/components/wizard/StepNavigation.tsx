'use client';

import { Button, Group, Box } from '@mantine/core';
import { IconArrowLeft, IconArrowRight, IconCheck, IconSparkles } from '@tabler/icons-react';
import { useWizard, useWizardValidation, useWizardSubmission } from '@/hooks/useWizard';
import { WIZARD_STEPS } from '@/types/wizard';

interface StepNavigationProps {
  customNextLabel?: string;
  customPrevLabel?: string;
  onCustomNext?: () => void;
  onCustomPrev?: () => void;
}

export default function StepNavigation({
  customNextLabel,
  customPrevLabel,
  onCustomNext,
  onCustomPrev,
}: StepNavigationProps) {
  const { state, nextStep, prevStep } = useWizard();
  const { validateCurrentStep } = useWizardValidation();
  const { submitWizard } = useWizardSubmission();

  const isFirstStep = state.currentStep === 0;
  const isLastStep = state.currentStep === state.totalSteps - 1;
  const isStoreStep = state.currentStep === WIZARD_STEPS.STORE;

  const handleNext = async () => {
    if (onCustomNext) {
      onCustomNext();
      return;
    }

    // Validate current step before proceeding
    const isValid = validateCurrentStep();
    
    if (!isValid) {
      return;
    }

    // If this is the store step (last step before success), submit the wizard
    if (isStoreStep) {
      const result = await submitWizard();
      if (result.success) {
        nextStep(); // Move to success step
      }
    } else {
      nextStep();
    }
  };

  const handlePrev = () => {
    if (onCustomPrev) {
      onCustomPrev();
    } else {
      prevStep();
    }
  };

  const getNextButtonLabel = () => {
    if (customNextLabel) return customNextLabel;
    if (isStoreStep) return 'Create Store';
    if (isLastStep) return 'Complete';
    return 'Next Step';
  };

  const getNextButtonIcon = () => {
    if (isStoreStep) return <IconSparkles size={16} />;
    if (isLastStep) return <IconCheck size={16} />;
    return <IconArrowRight size={16} />;
  };

  const getPrevButtonLabel = () => {
    if (customPrevLabel) return customPrevLabel;
    return 'Previous';
  };

  const canProceed = !state.loading && Object.keys(state.errors).length === 0;

  return (
    <Box
      style={{
        borderTop: '1px solid var(--theme-border)',
        paddingTop: '24px',
        marginTop: '24px',
      }}
    >
      <Group justify="space-between" align="center">
        {/* Previous Button */}
        <Button
          variant="subtle"
          leftSection={<IconArrowLeft size={16} />}
          onClick={handlePrev}
          disabled={isFirstStep || state.loading}
          size="md"
          style={{
            visibility: isFirstStep ? 'hidden' : 'visible',
            backgroundColor: 'var(--theme-background-secondary)',
            color: 'var(--theme-text-secondary)',
            border: '1px solid var(--theme-border)',
          }}
        >
          {getPrevButtonLabel()}
        </Button>

        {/* Next/Submit Button */}
        <Button
          rightSection={getNextButtonIcon()}
          onClick={handleNext}
          disabled={!canProceed}
          loading={state.loading}
          size="md"
          variant={isStoreStep ? 'gradient' : 'filled'}
          gradient={isStoreStep ? { from: 'blue', to: 'purple' } : undefined}
          style={{
            backgroundColor: isStoreStep 
              ? undefined 
              : 'var(--theme-primary)',
            color: 'white',
            fontWeight: 600,
            minWidth: '140px',
            boxShadow: isStoreStep 
              ? '0 4px 16px rgba(0, 0, 0, 0.2)' 
              : '0 2px 8px rgba(0, 0, 0, 0.1)',
            transform: isStoreStep ? 'scale(1.02)' : 'scale(1)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (isStoreStep) {
              e.currentTarget.style.transform = 'scale(1.05)';
            }
          }}
          onMouseLeave={(e) => {
            if (isStoreStep) {
              e.currentTarget.style.transform = 'scale(1.02)';
            }
          }}
        >
          {getNextButtonLabel()}
        </Button>
      </Group>

      {/* Error Display */}
      {Object.keys(state.errors).length > 0 && (
        <Box
          mt="md"
          p="sm"
          style={{
            backgroundColor: 'var(--theme-error)',
            color: 'white',
            borderRadius: '8px',
            fontSize: '14px',
            opacity: 0.9,
          }}
        >
          Please fix the errors above before continuing.
        </Box>
      )}
    </Box>
  );
}