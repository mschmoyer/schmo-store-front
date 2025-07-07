'use client';

import { Box, Group, Text, Progress, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconCheck, IconUser, IconStore, IconTrophy } from '@tabler/icons-react';
import { useWizard } from '@/hooks/useWizard';
import { WIZARD_STEPS } from '@/types/wizard';

const stepIcons = {
  [WIZARD_STEPS.ACCOUNT]: IconUser,
  [WIZARD_STEPS.STORE]: IconStore,
  [WIZARD_STEPS.SUCCESS]: IconTrophy,
};

interface StepIndicatorProps {
  onStepClick?: (step: number) => void;
}

export default function StepIndicator({ onStepClick }: StepIndicatorProps) {
  const { state, goToStep } = useWizard();

  const handleStepClick = (stepIndex: number) => {
    if (state.steps[stepIndex].isAccessible && onStepClick) {
      onStepClick(stepIndex);
    } else if (state.steps[stepIndex].isAccessible) {
      goToStep(stepIndex);
    }
  };

  const progressValue = ((state.currentStep + 1) / state.totalSteps) * 100;

  return (
    <Box>
      {/* Progress Bar */}
      <Box mb="xl">
        <Progress
          value={progressValue}
          size="lg"
          radius="md"
          style={{
            backgroundColor: 'var(--theme-background-secondary)',
          }}
          styles={{
            bar: {
              background: 'var(--theme-primary-gradient)',
              transition: 'width 0.3s ease',
            },
          }}
        />
        <Text
          size="sm"
          c="dimmed"
          mt="xs"
          style={{
            textAlign: 'center',
            color: 'var(--theme-text-secondary)',
          }}
        >
          Step {state.currentStep + 1} of {state.totalSteps}
        </Text>
      </Box>

      {/* Step Indicators */}
      <Group justify="space-between" align="flex-start">
        {state.steps.map((step, index) => {
          const Icon = stepIcons[index as keyof typeof stepIcons];
          const isActive = step.isActive;
          const isCompleted = step.isCompleted;
          const isAccessible = step.isAccessible;

          return (
            <UnstyledButton
              key={step.id}
              onClick={() => handleStepClick(index)}
              disabled={!isAccessible}
              style={{
                flex: 1,
                cursor: isAccessible ? 'pointer' : 'default',
                opacity: isAccessible ? 1 : 0.6,
                transition: 'opacity 0.2s ease',
              }}
            >
              <Box
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '12px 8px',
                  borderRadius: '12px',
                  backgroundColor: isActive 
                    ? 'var(--theme-background-tertiary)' 
                    : 'transparent',
                  border: isActive 
                    ? '2px solid var(--theme-primary)' 
                    : '2px solid transparent',
                  transition: 'all 0.3s ease',
                }}
              >
                {/* Step Icon */}
                <ThemeIcon
                  size="xl"
                  radius="xl"
                  variant={isCompleted ? 'filled' : isActive ? 'light' : 'outline'}
                  color={isCompleted ? 'green' : 'blue'}
                  style={{
                    backgroundColor: isCompleted 
                      ? 'var(--theme-success)' 
                      : isActive 
                        ? 'var(--theme-primary)' 
                        : 'var(--theme-background-secondary)',
                    border: isActive && !isCompleted 
                      ? '2px solid var(--theme-primary)' 
                      : 'none',
                    color: isCompleted 
                      ? 'white' 
                      : isActive 
                        ? 'white' 
                        : 'var(--theme-text-secondary)',
                    boxShadow: isActive 
                      ? '0 4px 12px rgba(0, 0, 0, 0.15)' 
                      : 'none',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {isCompleted ? (
                    <IconCheck size={20} />
                  ) : (
                    <Icon size={20} />
                  )}
                </ThemeIcon>

                {/* Step Title */}
                <Text
                  size="sm"
                  fw={isActive ? 600 : 500}
                  mt="xs"
                  style={{
                    color: isActive 
                      ? 'var(--theme-text)' 
                      : 'var(--theme-text-secondary)',
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}
                >
                  {step.title}
                </Text>

                {/* Step Description (optional, for larger screens) */}
                {step.description && (
                  <Text
                    size="xs"
                    c="dimmed"
                    mt={4}
                    style={{
                      color: 'var(--theme-text-muted)',
                      textAlign: 'center',
                      lineHeight: 1.2,
                      maxWidth: '120px',
                      display: window.innerWidth > 768 ? 'block' : 'none',
                    }}
                  >
                    {step.description}
                  </Text>
                )}
              </Box>
            </UnstyledButton>
          );
        })}
      </Group>
    </Box>
  );
}