'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';

interface ConfettiEffectProps {
  active?: boolean;
  duration?: number;
  particleCount?: number;
  spread?: number;
  origin?: { x: number; y: number };
  colors?: string[];
  shapes?: ('square' | 'circle')[];
  gravity?: number;
  drift?: number;
  ticks?: number;
  startVelocity?: number;
  scalar?: number;
  zIndex?: number;
}

export default function ConfettiEffect({
  active = false,
  duration = 3000,
  particleCount = 100,
  spread = 60,
  origin = { x: 0.5, y: 0.6 },
  colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
  shapes = ['square', 'circle'],
  gravity = 1,
  drift = 0,
  ticks = 300,
  startVelocity = 45,
  scalar = 1,
  zIndex = 100,
}: ConfettiEffectProps) {
  const [isActive, setIsActive] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (active && !isActive) {
      setIsActive(true);
      fireConfetti();
    }
  }, [active, isActive, fireConfetti]);

  useEffect(() => {
    return () => {
      const timeout = timeoutRef.current;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, []);

  const fireConfetti = useCallback(() => {
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: Math.floor(particleCount / 10),
        startVelocity,
        spread,
        origin,
        colors,
        shapes,
        gravity,
        drift,
        ticks,
        scalar,
        zIndex,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      } else {
        setIsActive(false);
      }
    };

    frame();
  }, [duration, particleCount, startVelocity, spread, origin, colors, shapes, gravity, drift, ticks, scalar, zIndex]);

  return null; // This component doesn't render anything visible
}

// Predefined confetti effects
export function CelebrationConfetti({ active }: { active: boolean }) {
  return (
    <ConfettiEffect
      active={active}
      duration={3000}
      particleCount={150}
      spread={70}
      origin={{ x: 0.5, y: 0.6 }}
      colors={['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4']}
    />
  );
}

export function SuccessConfetti({ active }: { active: boolean }) {
  return (
    <ConfettiEffect
      active={active}
      duration={2000}
      particleCount={100}
      spread={50}
      origin={{ x: 0.5, y: 0.7 }}
      colors={['#00C851', '#00FF7F', '#32CD32', '#7FFF00']}
      startVelocity={35}
    />
  );
}

export function StoreCreationConfetti({ active }: { active: boolean }) {
  const [, setPhase] = useState(0);

  useEffect(() => {
    if (active) {
      // Multi-phase confetti effect
      const phases = [
        { delay: 0, origin: { x: 0.2, y: 0.6 } },
        { delay: 200, origin: { x: 0.5, y: 0.5 } },
        { delay: 400, origin: { x: 0.8, y: 0.6 } },
      ];

      phases.forEach((phaseConfig, index) => {
        setTimeout(() => {
          setPhase(index + 1);
          confetti({
            particleCount: 60,
            spread: 55,
            origin: phaseConfig.origin,
            colors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFD93D', '#6BCF7F'],
            startVelocity: 40,
            gravity: 0.8,
            ticks: 200,
            scalar: 1.2,
          });
        }, phaseConfig.delay);
      });

      // Final burst
      setTimeout(() => {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { x: 0.5, y: 0.6 },
          colors: ['#FFD700', '#FF69B4', '#00BFFF', '#32CD32', '#FF4500'],
          startVelocity: 50,
          gravity: 1.2,
          ticks: 300,
          scalar: 1.5,
        });
      }, 800);
    }
  }, [active]);

  return null;
}

export function FireworksConfetti({ active }: { active: boolean }) {
  useEffect(() => {
    if (active) {
      const duration = 3000;
      const end = Date.now() + duration;

      const colors = ['#FF1744', '#00E676', '#00B0FF', '#FFD600', '#FF6D00'];

      (function frame() {
        // Launch fireworks from random positions
        const randomX = Math.random();
        const randomY = Math.random() * 0.3 + 0.4; // Between 0.4 and 0.7

        confetti({
          particleCount: 30,
          spread: 40,
          origin: { x: randomX, y: randomY },
          colors: colors,
          startVelocity: 60,
          gravity: 1.5,
          ticks: 100,
          scalar: 0.8,
        });

        if (Date.now() < end) {
          setTimeout(frame, Math.random() * 200 + 100);
        }
      })();
    }
  }, [active]);

  return null;
}

// Hook for programmatic confetti control
export function useConfetti() {
  const [isActive, setIsActive] = useState(false);

  const fire = (options?: Partial<ConfettiEffectProps>) => {
    setIsActive(true);
    
    confetti({
      particleCount: options?.particleCount || 100,
      spread: options?.spread || 60,
      origin: options?.origin || { x: 0.5, y: 0.6 },
      colors: options?.colors || ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1'],
      ...options,
    });

    setTimeout(() => setIsActive(false), options?.duration || 1000);
  };

  const celebration = () => {
    // Multi-burst celebration
    const count = 200;
    const defaults = {
      origin: { y: 0.7 },
      colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'],
    };

    function burst(particleRatio: number, opts: Record<string, unknown>) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
      });
    }

    burst(0.25, {
      spread: 26,
      startVelocity: 55,
    });

    burst(0.2, {
      spread: 60,
    });

    burst(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
    });

    burst(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2,
    });

    burst(0.1, {
      spread: 120,
      startVelocity: 45,
    });
  };

  const success = () => {
    fire({
      particleCount: 80,
      spread: 50,
      colors: ['#00C851', '#00FF7F', '#32CD32', '#7FFF00'],
      startVelocity: 35,
    });
  };

  const fireworks = () => {
    const duration = 2000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 2,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.5 },
        colors: ['#FF1744', '#00E676', '#00B0FF'],
      });
      confetti({
        particleCount: 2,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.5 },
        colors: ['#FFD600', '#FF6D00', '#E91E63'],
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    })();
  };

  return {
    isActive,
    fire,
    celebration,
    success,
    fireworks,
  };
}