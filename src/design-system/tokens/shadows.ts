// ============================================================================
// Design System - Shadow Tokens
// Subtle, layered shadows for depth and hierarchy
// ============================================================================

export const shadows = {
  none: 'none',

  // Subtle shadows for cards and components
  xs: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  sm: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',

  // Special shadows
  inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
  focus: '0 0 0 3px rgba(59, 130, 246, 0.1)',

  // Interactive shadows
  button: {
    default: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    hover: '0 4px 8px 0 rgba(0, 0, 0, 0.12), 0 2px 4px 0 rgba(0, 0, 0, 0.08)',
    active: '0 1px 2px 0 rgba(0, 0, 0, 0.1)',
  },

  // Card shadows
  card: {
    default: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    hover: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    active: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  },

  // Modal shadows
  modal: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',

  // Dropdown shadows
  dropdown: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',

  // Precision shadows (layered for natural lift)
  precision: {
    sm: '0 0 0 1px rgba(0,0,0,0.05), 0 1px 2px 0 rgba(0,0,0,0.05)',
    md: '0 0 0 1px rgba(0,0,0,0.03), 0 4px 12px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1)',
    lg: '0 0 0 1px rgba(0,0,0,0.03), 0 12px 24px -12px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.05)',
  }
} as const;

export type ShadowToken = keyof typeof shadows;