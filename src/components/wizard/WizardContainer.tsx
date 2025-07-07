'use client';

import { Container, Paper, Box, Title, Text } from '@mantine/core';
import { useWizard, WizardProvider } from '@/hooks/useWizard';
import { WIZARD_STEPS } from '@/types/wizard';
import StepIndicator from './StepIndicator';
import StepNavigation from './StepNavigation';
// TODO: Import step components when they are created
// import AccountStep from './steps/AccountStep';
// import StoreConfigStep from './steps/StoreConfigStep';
// import SuccessStep from './steps/SuccessStep';

// Placeholder step components
const PlaceholderStep = () => <div>Step placeholder - component not implemented yet</div>;

// Step Components Map
const stepComponents = {
  [WIZARD_STEPS.ACCOUNT]: PlaceholderStep,
  [WIZARD_STEPS.STORE]: PlaceholderStep,
  [WIZARD_STEPS.SUCCESS]: PlaceholderStep,
};

function WizardContent() {
  const { state } = useWizard();
  // TODO: Uncomment when step components are implemented
  // const { nextStep, prevStep } = useWizard();
  const CurrentStepComponent = stepComponents[state.currentStep as keyof typeof stepComponents];

  if (!CurrentStepComponent) {
    return <Text color="red">Unknown step</Text>;
  }

  // TODO: Uncomment when step components are implemented
  // const canProceed = !state.loading && Object.keys(state.errors).length === 0;

  return (
    <Container size="md" py="xl">
      <Box
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          background: 'var(--theme-background)',
        }}
      >
        <Paper
          shadow="xl"
          radius="lg"
          p="xl"
          style={{
            background: 'var(--theme-card)',
            border: '1px solid var(--theme-border)',
            maxWidth: '800px',
            width: '100%',
            margin: '0 auto',
          }}
        >
          {/* Header */}
          <Box mb="xl" style={{ textAlign: 'center' }}>
            <Title
              order={1}
              size="h2"
              mb="sm"
              style={{
                color: 'var(--theme-text)',
                fontWeight: 700,
                background: 'var(--theme-primary-gradient)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Create Your Store
            </Title>
            <Text
              size="lg"
              c="dimmed"
              style={{
                color: 'var(--theme-text-secondary)',
                maxWidth: '500px',
                margin: '0 auto',
              }}
            >
              Set up your online store in just a few simple steps
            </Text>
          </Box>

          {/* Step Indicator */}
          <Box mb="xl">
            <StepIndicator />
          </Box>

          {/* Current Step Content */}
          <Box mb="xl">
            <CurrentStepComponent />
          </Box>

          {/* Navigation */}
          {state.currentStep !== WIZARD_STEPS.SUCCESS && (
            <StepNavigation />
          )}
        </Paper>
      </Box>
    </Container>
  );
}

interface WizardContainerProps {
  children?: React.ReactNode;
}

export default function WizardContainer({ children }: WizardContainerProps) {
  return (
    <WizardProvider>
      {children || <WizardContent />}
    </WizardProvider>
  );
}