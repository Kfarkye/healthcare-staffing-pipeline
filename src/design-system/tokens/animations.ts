// ============================================================================
// Design System - Animation Tokens
// Smooth, purposeful animations with consistent timing
// ============================================================================

export const animations = {
  // Timing functions
  easing: {
    linear: 'linear',
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
    // Apple-style easing
    spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
  
  // Duration tokens
  duration: {
    instant: '0ms',
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
    slower: '750ms',
    slowest: '1000ms',
  },
  
  // Common animation presets
  presets: {
    fadeIn: {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
    fadeInUp: {
      from: { opacity: 0, transform: 'translateY(12px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    slideInLeft: {
      from: { opacity: 0, transform: 'translateX(-8px)' },
      to: { opacity: 1, transform: 'translateX(0)' },
    },
    scaleIn: {
      from: { opacity: 0, transform: 'scale(0.95)' },
      to: { opacity: 1, transform: 'scale(1)' },
    },
    shimmer: {
      '0%': { backgroundPosition: '-1000px 0' },
      '100%': { backgroundPosition: '1000px 0' },
    },
  },
} as const;

// CSS animation classes
export const animationClasses = {
  fadeIn: 'animate-fadeIn',
  fadeInUp: 'animate-fadeInUp',
  slideInLeft: 'animate-slideInLeft',
  scaleIn: 'animate-scaleIn',
  shimmer: 'animate-shimmer',
  spin: 'animate-spin',
  pulse: 'animate-pulse',
  bounce: 'animate-bounce',
} as const;

export type AnimationToken = keyof typeof animations.presets;