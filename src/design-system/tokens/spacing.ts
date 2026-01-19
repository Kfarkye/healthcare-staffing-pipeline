// ============================================================================
// Design System - Spacing Tokens
// 8px base grid system for consistent spacing
// ============================================================================

export const spacing = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
  9: '36px',
  10: '40px',
  11: '44px',
  12: '48px',
  14: '56px',
  16: '64px',
  20: '80px',
  24: '96px',
  28: '112px',
  32: '128px',
  36: '144px',
  40: '160px',
  44: '176px',
  48: '192px',
  52: '208px',
  56: '224px',
  60: '240px',
  64: '256px',
  72: '288px',
  80: '320px',
  96: '384px',
} as const;

export const borderRadius = {
  none: '0px',
  sm: '2px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  full: '9999px',
} as const;

// Layout spacing presets
export const layout = {
  containerPadding: {
    mobile: spacing[4],
    tablet: spacing[6],
    desktop: spacing[8],
  },
  sectionSpacing: {
    small: spacing[8],
    medium: spacing[12],
    large: spacing[16],
  },
  componentSpacing: {
    tight: spacing[2],
    normal: spacing[4],
    loose: spacing[6],
  },
} as const;

export type SpacingToken = keyof typeof spacing;
export type BorderRadiusToken = keyof typeof borderRadius;