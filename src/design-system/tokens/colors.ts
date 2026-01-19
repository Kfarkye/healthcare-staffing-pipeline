// ============================================================================
// Design System - Color Tokens
// Apple-inspired color palette with semantic naming
// ============================================================================

export const colors = {
  // Base colors
  white: '#FFFFFF',
  black: '#000000',
  
  // Gray scale - Primary neutral palette
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
  
  // Primary brand color
  blue: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    200: '#BFDBFE',
    300: '#93C5FD',
    400: '#60A5FA',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    800: '#1E40AF',
    900: '#1E3A8A',
  },
  
  // Success states
  emerald: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#10B981',
    600: '#059669',
    700: '#047857',
    800: '#065F46',
    900: '#064E3B',
  },
  
  // Warning states
  amber: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  
  // Error states
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
  },
  
  // Accent colors
  purple: {
    50: '#FAF5FF',
    100: '#F3E8FF',
    200: '#E9D5FF',
    300: '#D8B4FE',
    400: '#C084FC',
    500: '#A855F7',
    600: '#9333EA',
    700: '#7C3AED',
    800: '#6B21A8',
    900: '#581C87',
  },
  
  indigo: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    200: '#C7D2FE',
    300: '#A5B4FC',
    400: '#818CF8',
    500: '#6366F1',
    600: '#4F46E5',
    700: '#4338CA',
    800: '#3730A3',
    900: '#312E81',
  },
} as const;

// Semantic color mappings
export const semanticColors = {
  // Text colors
  text: {
    primary: colors.gray[900],
    secondary: colors.gray[600],
    tertiary: colors.gray[500],
    inverse: colors.white,
    disabled: colors.gray[400],
  },
  
  // Background colors
  background: {
    primary: colors.white,
    secondary: colors.gray[50],
    tertiary: colors.gray[100],
    overlay: 'rgba(0, 0, 0, 0.5)',
  },
  
  // Border colors
  border: {
    default: colors.gray[200],
    hover: colors.gray[300],
    focus: colors.blue[500],
    error: colors.red[300],
  },
  
  // Interactive states
  interactive: {
    primary: colors.gray[900],
    primaryHover: colors.gray[800],
    secondary: colors.gray[100],
    secondaryHover: colors.gray[200],
  },
  
  // Status colors
  status: {
    success: colors.emerald[500],
    warning: colors.amber[500],
    error: colors.red[500],
    info: colors.blue[500],
  },
} as const;

export type ColorToken = keyof typeof colors;
export type SemanticColorToken = keyof typeof semanticColors;