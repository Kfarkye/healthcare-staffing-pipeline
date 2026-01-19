# Design System Documentation

A comprehensive, production-ready design system built with React, TypeScript, and Tailwind CSS, following atomic design principles and inspired by Apple, Stripe, and Vercel.

## 📁 File Structure

```
src/design-system/
├── tokens/              # Design tokens (colors, spacing, typography)
│   ├── colors.ts
│   ├── spacing.ts
│   ├── typography.ts
│   ├── shadows.ts
│   ├── animations.ts
│   └── index.ts
├── icons/               # SVG icon components
│   ├── SearchIcon.tsx
│   ├── XIcon.tsx
│   ├── ChevronRightIcon.tsx
│   ├── PlusIcon.tsx
│   ├── CheckIcon.tsx
│   └── index.ts
├── core/                # Atomic components
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── SearchInput.tsx
│   ├── Badge.tsx
│   └── index.ts
├── modules/             # Complex components
│   ├── StatCard.tsx
│   ├── PlaceholderCard.tsx
│   ├── Logo.tsx
│   ├── UserProfile.tsx
│   ├── Card.tsx
│   ├── LoadingSpinner.tsx
│   ├── Toast.tsx
│   └── index.ts
├── styles/              # Global CSS
│   ├── animations.css
│   ├── scrollbars.css
│   └── index.css
├── index.ts             # Main export
└── README.md            # This file
```

---

## 🎨 Design Tokens

### Colors

```typescript
// src/design-system/tokens/colors.ts
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
```

### Spacing

```typescript
// src/design-system/tokens/spacing.ts
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
```

### Typography

```typescript
// src/design-system/tokens/typography.ts
export const typography = {
  fontFamily: {
    sans: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(', '),
    mono: [
      '"SF Mono"',
      'Monaco',
      '"Cascadia Code"',
      '"Roboto Mono"',
      'Consolas',
      '"Courier New"',
      'monospace',
    ].join(', '),
  },
  
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
    '5xl': '48px',
    '6xl': '60px',
  },
  
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  
  lineHeight: {
    none: '1',
    tight: '1.25',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.625',
    loose: '2',
  },
  
  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0em',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// Semantic typography mappings
export const textStyles = {
  // Display text
  display: {
    large: {
      fontSize: typography.fontSize['5xl'],
      fontWeight: typography.fontWeight.bold,
      lineHeight: typography.lineHeight.tight,
      letterSpacing: typography.letterSpacing.tight,
    },
    medium: {
      fontSize: typography.fontSize['4xl'],
      fontWeight: typography.fontWeight.bold,
      lineHeight: typography.lineHeight.tight,
    },
    small: {
      fontSize: typography.fontSize['3xl'],
      fontWeight: typography.fontWeight.bold,
      lineHeight: typography.lineHeight.tight,
    },
  },
  
  // Headings
  heading: {
    h1: {
      fontSize: typography.fontSize['2xl'],
      fontWeight: typography.fontWeight.bold,
      lineHeight: typography.lineHeight.tight,
    },
    h2: {
      fontSize: typography.fontSize.xl,
      fontWeight: typography.fontWeight.semibold,
      lineHeight: typography.lineHeight.tight,
    },
    h3: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.semibold,
      lineHeight: typography.lineHeight.snug,
    },
    h4: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.semibold,
      lineHeight: typography.lineHeight.snug,
    },
  },
  
  // Body text
  body: {
    large: {
      fontSize: typography.fontSize.lg,
      fontWeight: typography.fontWeight.normal,
      lineHeight: typography.lineHeight.relaxed,
    },
    medium: {
      fontSize: typography.fontSize.base,
      fontWeight: typography.fontWeight.normal,
      lineHeight: typography.lineHeight.normal,
    },
    small: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.normal,
      lineHeight: typography.lineHeight.normal,
    },
  },
  
  // Labels and captions
  label: {
    large: {
      fontSize: typography.fontSize.sm,
      fontWeight: typography.fontWeight.medium,
      lineHeight: typography.lineHeight.normal,
    },
    medium: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.medium,
      lineHeight: typography.lineHeight.normal,
      letterSpacing: typography.letterSpacing.wide,
    },
    small: {
      fontSize: typography.fontSize.xs,
      fontWeight: typography.fontWeight.normal,
      lineHeight: typography.lineHeight.normal,
    },
  },
} as const;
```

---

## 🔧 Core Components (Atoms)

### Button

```tsx
// src/design-system/core/Button.tsx
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles = `
    inline-flex items-center justify-center font-medium rounded-lg 
    transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:cursor-not-allowed relative overflow-hidden
  `;

  const variants = {
    primary: `
      bg-gray-900 text-white border border-gray-900
      hover:bg-gray-800 hover:border-gray-800
      focus:ring-gray-900 focus:ring-opacity-50
      disabled:bg-gray-300 disabled:border-gray-300 disabled:text-gray-500
    `,
    secondary: `
      bg-white text-gray-900 border border-gray-200
      hover:bg-gray-50 hover:border-gray-300
      focus:ring-gray-500 focus:ring-opacity-50
      disabled:bg-gray-100 disabled:border-gray-200 disabled:text-gray-400
    `,
    ghost: `
      bg-transparent text-gray-600 border border-transparent
      hover:bg-gray-100 hover:text-gray-900
      focus:ring-gray-500 focus:ring-opacity-50
      disabled:text-gray-400 disabled:hover:bg-transparent
    `,
    danger: `
      bg-red-600 text-white border border-red-600
      hover:bg-red-700 hover:border-red-700
      focus:ring-red-500 focus:ring-opacity-50
      disabled:bg-red-300 disabled:border-red-300
    `,
    success: `
      bg-emerald-600 text-white border border-emerald-600
      hover:bg-emerald-700 hover:border-emerald-700
      focus:ring-emerald-500 focus:ring-opacity-50
      disabled:bg-emerald-300 disabled:border-emerald-300
    `,
  };

  const sizes = {
    xs: 'px-2.5 py-1.5 text-xs gap-1',
    sm: 'px-3 py-2 text-sm gap-1.5',
    md: 'px-4 py-2.5 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2',
    xl: 'px-8 py-4 text-lg gap-2.5',
  };

  const isDisabled = disabled || loading;

  return (
    <button
      className={`
        ${baseStyles} 
        ${variants[variant]} 
        ${sizes[size]} 
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      disabled={isDisabled}
      {...props}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      
      <div className={`flex items-center gap-2 ${loading ? 'opacity-0' : 'opacity-100'}`}>
        {icon && iconPosition === 'left' && icon}
        {children}
        {icon && iconPosition === 'right' && icon}
      </div>
    </button>
  );
};

// Usage Examples:
// <Button variant="primary" size="md">Save Changes</Button>
// <Button variant="secondary" icon={<PlusIcon />}>Add Item</Button>
// <Button variant="ghost" loading={true}>Loading...</Button>
```

### Input

```tsx
// src/design-system/core/Input.tsx
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  variant?: 'default' | 'filled' | 'minimal';
  inputSize?: 'sm' | 'md' | 'lg';
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon,
  iconPosition = 'left',
  variant = 'default',
  inputSize = 'md',
  className = '',
  ...props
}) => {
  const baseInputStyles = `
    w-full border transition-all duration-200 focus:outline-none
    disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
  `;
  
  const variants = {
    default: `
      bg-white border-gray-200 rounded-lg
      hover:border-gray-300 focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10
    `,
    filled: `
      bg-gray-50 border-gray-200 rounded-lg
      hover:bg-white hover:border-gray-300 focus:bg-white focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10
    `,
    minimal: `
      bg-transparent border-0 border-b-2 border-gray-200 rounded-none
      hover:border-gray-300 focus:border-gray-900 focus:ring-0
    `,
  };
  
  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-3 py-2.5 text-sm',
    lg: 'px-4 py-3 text-base',
  };
  
  const inputStyles = error 
    ? `${baseInputStyles} ${variants[variant]} border-red-300 focus:border-red-500 focus:ring-red-500/10`
    : `${baseInputStyles} ${variants[variant]}`;
  
  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
        </label>
      )}
      
      <div className="relative">
        {icon && iconPosition === 'left' && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
        
        <input
          className={`
            ${inputStyles} 
            ${sizes[inputSize]}
            ${icon && iconPosition === 'left' ? 'pl-10' : ''}
            ${icon && iconPosition === 'right' ? 'pr-10' : ''}
          `}
          {...props}
        />
        
        {icon && iconPosition === 'right' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
      </div>
      
      {error && (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      )}
      
      {helperText && !error && (
        <p className="mt-1.5 text-sm text-gray-500">{helperText}</p>
      )}
    </div>
  );
};

// Usage Examples:
// <Input label="Email" placeholder="Enter email" />
// <Input icon={<SearchIcon />} placeholder="Search..." />
// <Input variant="filled" error="This field is required" />
```

### SearchInput

```tsx
// src/design-system/core/SearchInput.tsx
import React from 'react';
import { SearchIcon, XIcon } from '../icons';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  focused?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'filled';
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = "Search...",
  focused = false,
  onFocus,
  onBlur,
  className = '',
  size = 'md',
  variant = 'filled'
}) => {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon 
        size={16} 
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors duration-300 pointer-events-none z-10" 
      />
      
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        className={`
          w-full pl-10 pr-10 py-2.5 border rounded-lg text-sm placeholder:text-gray-400 
          focus:outline-none transition-all duration-300
          ${focused 
            ? 'border-gray-900 bg-white ring-4 ring-gray-900/5' 
            : variant === 'filled'
              ? 'bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-white'
              : 'bg-white border-gray-200 hover:border-gray-300'
          }
        `}
      />
      
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-all duration-200"
        >
          <XIcon size={14} />
        </button>
      )}
    </div>
  );
};

// Usage Examples:
// <SearchInput value={search} onChange={setSearch} placeholder="Search views..." />
// <SearchInput variant="default" focused={true} />
```

### Badge

```tsx
// src/design-system/core/Badge.tsx
import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  className = ''
}) => {
  const baseStyles = 'inline-flex items-center font-medium rounded-full transition-colors';
  
  const variants = {
    default: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
    primary: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
    success: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
    warning: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    error: 'bg-red-100 text-red-800 hover:bg-red-200',
    info: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
  };
  
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-sm',
  };
  
  return (
    <span className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}>
      {children}
    </span>
  );
};

// Usage Examples:
// <Badge variant="success">Active</Badge>
// <Badge variant="warning" size="sm">Pending</Badge>
```

---

## 🧩 Module Components (Organisms)

### StatCard

```tsx
// src/design-system/modules/StatCard.tsx
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  delay?: number;
  className?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  description?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  trend, 
  delay = 0,
  className = '',
  onClick,
  icon,
  description
}) => {
  const isClickable = !!onClick;
  
  return (
    <div 
      className={`
        group relative bg-white rounded-2xl border border-gray-200/80 p-6 
        transition-all duration-500 animate-fadeInUp
        ${isClickable ? 'hover:border-gray-300/80 cursor-pointer hover:shadow-lg' : ''}
        ${className}
      `}
      style={{ 
        animationDelay: `${delay}ms`, 
        opacity: 0,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {icon && (
            <div className="mb-3 text-gray-600">
              {icon}
            </div>
          )}
          <p className="text-[13px] font-medium text-gray-500 mb-2 transition-colors duration-300 group-hover:text-gray-600">
            {label}
          </p>
          <p className="text-3xl font-semibold text-gray-900 tracking-tight transition-all duration-300 group-hover:scale-105 origin-left">
            {value}
          </p>
          {description && (
            <p className="text-xs text-gray-400 mt-1">
              {description}
            </p>
          )}
        </div>
        {trend && (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-all duration-300 group-hover:bg-emerald-100">
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};

// Usage Examples:
// <StatCard label="Total Users" value="1,247" trend="+12%" />
// <StatCard label="Revenue" value="$45,230" onClick={handleClick} />
// <StatCard label="Active" value="89" icon={<UserIcon />} />
```

### PlaceholderCard

```tsx
// src/design-system/modules/PlaceholderCard.tsx
import React from 'react';

interface PlaceholderCardProps {
  title: string;
  description: string;
  comingSoon?: boolean;
  className?: string;
  onClick?: () => void;
}

export const PlaceholderCard: React.FC<PlaceholderCardProps> = ({ 
  title, 
  description, 
  comingSoon = false,
  className = '',
  onClick
}) => {
  return (
    <div 
      className={`
        group bg-white rounded-2xl border border-gray-200/80 overflow-hidden 
        hover:border-gray-300/80 transition-all duration-500 
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
      style={{ boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)' }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)';
      }}
    >
      {/* Header */}
      <div className="p-6 border-b border-gray-100/80 bg-gradient-to-br from-white to-gray-50/30">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900 mb-1.5 transition-colors duration-300 group-hover:text-gray-950">
              {title}
            </h3>
            <p className="text-[13px] text-gray-500 leading-relaxed transition-colors duration-300 group-hover:text-gray-600">
              {description}
            </p>
          </div>
          {comingSoon && (
            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all duration-300 group-hover:bg-blue-100 group-hover:scale-105">
              Coming Soon
            </span>
          )}
        </div>
      </div>
      
      {/* Shimmer Content */}
      <div className="bg-gray-50/50 p-8 transition-colors duration-500 group-hover:bg-gray-100/30">
        <div className="space-y-3">
          <div className="h-2.5 bg-gray-200/80 rounded-full animate-shimmer w-3/4"></div>
          <div className="h-2.5 bg-gray-200/80 rounded-full animate-shimmer w-1/2" style={{ animationDelay: '0.3s' }}></div>
          <div className="h-2.5 bg-gray-200/80 rounded-full animate-shimmer w-5/6" style={{ animationDelay: '0.6s' }}></div>
        </div>
      </div>
    </div>
  );
};

// Usage Examples:
// <PlaceholderCard title="Analytics" description="Coming soon" comingSoon />
// <PlaceholderCard title="Reports" description="Generate reports" onClick={handleClick} />
```

### Logo

```tsx
// src/design-system/modules/Logo.tsx
import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Logo: React.FC<LogoProps> = ({ 
  size = 'md',
  showText = true,
  className = '',
  onClick
}) => {
  const sizes = {
    sm: { icon: 'w-7 h-7', text: 'text-base' },
    md: { icon: 'w-9 h-9', text: 'text-lg' },
    lg: { icon: 'w-12 h-12', text: 'text-xl' },
  };
  
  const sizeConfig = sizes[size];
  
  return (
    <div 
      className={`flex items-center gap-2.5 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      <div 
        className={`
          relative ${sizeConfig.icon} rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 
          flex items-center justify-center group transition-all duration-300 
          ${onClick ? 'hover:scale-110 active:scale-105' : ''}
        `}
        style={{ boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}
      >
        {/* Shine effect */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/12 via-transparent to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-90"></div>
        
        {/* Bottom highlight */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
        
        {/* Logo text */}
        <span 
          className={`
            relative text-white font-bold tracking-tight z-10 transition-all duration-300 
            ${onClick ? 'group-hover:scale-110' : ''}
            ${size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base'}
          `}
          style={{
            textShadow: `
              0 1px 2px rgba(0, 0, 0, 0.35),
              0 2px 4px rgba(0, 0, 0, 0.25),
              0 0 10px rgba(255, 255, 255, 0.15)
            `
          }}
        >
          P
        </span>
      </div>
      
      {showText && (
        <span className={`${sizeConfig.text} font-semibold text-gray-900 tracking-tight`}>
          Pipeline
        </span>
      )}
    </div>
  );
};

// Usage Examples:
// <Logo />
// <Logo size="lg" showText={false} />
// <Logo onClick={handleLogoClick} />
```

### UserProfile

```tsx
// src/design-system/modules/UserProfile.tsx
import React from 'react';

interface User {
  name: string;
  email: string;
  initials: string;
  avatar?: string;
}

interface UserProfileProps {
  user: User;
  size?: 'sm' | 'md' | 'lg';
  showEmail?: boolean;
  className?: string;
  onClick?: () => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ 
  user, 
  size = 'md',
  showEmail = true,
  className = '',
  onClick
}) => {
  const sizes = {
    sm: { avatar: 'w-7 h-7', text: 'text-sm', email: 'text-xs' },
    md: { avatar: 'w-9 h-9', text: 'text-sm', email: 'text-xs' },
    lg: { avatar: 'w-12 h-12', text: 'text-base', email: 'text-sm' },
  };
  
  const sizeConfig = sizes[size];
  
  return (
    <div 
      className={`
        animate-fadeInUp ${className}
        ${onClick ? 'cursor-pointer' : ''}
      `} 
      style={{ animationDelay: '200ms', opacity: 0 }}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-all duration-300 group active:scale-[0.98]">
        {/* Avatar */}
        <div 
          className={`
            relative ${sizeConfig.avatar} rounded-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 
            flex items-center justify-center text-white font-bold shrink-0 transition-all duration-300 
            ${onClick ? 'group-hover:scale-110' : ''}
          `}
          style={{ boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/12 via-transparent to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-90"></div>
          
          {user.avatar ? (
            <img 
              src={user.avatar} 
              alt={user.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span 
              className={`
                relative z-10 transition-all duration-300 
                ${onClick ? 'group-hover:scale-110' : ''}
                ${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'}
              `}
              style={{
                textShadow: `
                  0 1px 2px rgba(0, 0, 0, 0.35),
                  0 2px 4px rgba(0, 0, 0, 0.25)
                `
              }}
            >
              {user.initials}
            </span>
          )}
        </div>
        
        {/* User Info */}
        <div className="flex-1 min-w-0">
          <p className={`${sizeConfig.text} font-semibold text-gray-900 truncate transition-colors duration-300 group-hover:text-gray-950`}>
            {user.name}
          </p>
          {showEmail && (
            <p className={`${sizeConfig.email} text-gray-500 truncate transition-colors duration-300 group-hover:text-gray-600`}>
              {user.email}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// Usage Examples:
// <UserProfile user={currentUser} />
// <UserProfile user={user} size="lg" showEmail={false} />
// <UserProfile user={user} onClick={handleProfileClick} />
```

### Card

```tsx
// src/design-system/modules/Card.tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'outlined' | 'ghost';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  onClick?: () => void;
  hover?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  onClick,
  hover = false
}) => {
  const baseStyles = `
    bg-white rounded-xl transition-all duration-300
    ${onClick ? 'cursor-pointer' : ''}
  `;
  
  const variants = {
    default: `border border-gray-200/80 ${hover ? 'hover:border-gray-300/80 hover:shadow-lg' : ''}`,
    elevated: `border border-gray-100/80 shadow-md ${hover ? 'hover:shadow-xl' : ''}`,
    outlined: `border-2 border-gray-200 ${hover ? 'hover:border-gray-300' : ''}`,
    ghost: `border-0 ${hover ? 'hover:bg-gray-50' : ''}`,
  };
  
  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10',
  };
  
  return (
    <div
      className={`${baseStyles} ${variants[variant]} ${paddings[padding]} ${className}`}
      onClick={onClick}
      style={{ boxShadow: variant === 'default' ? '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)' : undefined }}
    >
      {children}
    </div>
  );
};

// Card sub-components for composition
export const CardHeader: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`pb-4 border-b border-gray-100 ${className}`}>
    {children}
  </div>
);

export const CardTitle: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
}> = ({ children, className = '' }) => (
  <h3 className={`text-lg font-semibold text-gray-900 ${className}`}>
    {children}
  </h3>
);

export const CardContent: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`pt-4 ${className}`}>
    {children}
  </div>
);

export const CardFooter: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`pt-4 border-t border-gray-100 ${className}`}>
    {children}
  </div>
);

// Usage Examples:
// <Card variant="elevated" padding="lg">Content here</Card>
// <Card hover onClick={handleClick}>
//   <CardHeader><CardTitle>Title</CardTitle></CardHeader>
//   <CardContent>Content</CardContent>
// </Card>
```

### LoadingSpinner

```tsx
// src/design-system/modules/LoadingSpinner.tsx
import React from 'react';

interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: 'primary' | 'secondary' | 'white';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'primary',
  className = ''
}) => {
  const sizes = {
    xs: 'w-3 h-3 border',
    sm: 'w-4 h-4 border',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-2',
    xl: 'w-12 h-12 border-2',
  };
  
  const colors = {
    primary: 'border-gray-200 border-t-gray-900',
    secondary: 'border-gray-100 border-t-gray-600',
    white: 'border-white/30 border-t-white',
  };
  
  return (
    <div 
      className={`
        ${sizes[size]} ${colors[color]} rounded-full animate-spin ${className}
      `}
    />
  );
};

// Usage Examples:
// <LoadingSpinner />
// <LoadingSpinner size="lg" color="white" />
```

### Toast

```tsx
// src/design-system/modules/Toast.tsx
import React, { useEffect } from 'react';
import { CheckIcon, XIcon } from '../icons';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  show: boolean;
  onClose: () => void;
  duration?: number;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  show,
  onClose,
  duration = 4000,
  position = 'bottom-right'
}) => {
  useEffect(() => {
    if (show && duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration, onClose]);
  
  if (!show) return null;
  
  const positions = {
    'top-right': 'top-6 right-6',
    'top-left': 'top-6 left-6',
    'bottom-right': 'bottom-6 right-6',
    'bottom-left': 'bottom-6 left-6',
    'top-center': 'top-6 left-1/2 -translate-x-1/2',
    'bottom-center': 'bottom-6 left-1/2 -translate-x-1/2',
  };
  
  const variants = {
    success: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-900',
      icon: 'text-emerald-600',
      IconComponent: CheckIcon,
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-900',
      icon: 'text-red-600',
      IconComponent: XIcon,
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-900',
      icon: 'text-blue-600',
      IconComponent: CheckIcon,
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-900',
      icon: 'text-amber-600',
      IconComponent: XIcon,
    },
  };
  
  const variant = variants[type];
  const { IconComponent } = variant;
  
  return (
    <div className={`fixed ${positions[position]} z-50 animate-in slide-in-from-bottom-5 fade-in duration-300`}>
      <div 
        className={`
          ${variant.bg} ${variant.border} ${variant.text} 
          px-4 py-3 rounded-lg border flex items-center gap-3 max-w-md min-w-[200px]
        `}
        style={{ boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}
      >
        <div className={`${variant.icon} flex-shrink-0`}>
          <IconComponent size={18} />
        </div>
        
        <span className="text-sm font-medium flex-1">
          {message}
        </span>
        
        <button
          onClick={onClose}
          className={`${variant.icon} hover:opacity-70 transition-opacity flex-shrink-0`}
        >
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
};

// Usage Examples:
// <Toast message="Success!" type="success" show={showToast} onClose={hideToast} />
// <Toast message="Error occurred" type="error" show={showError} onClose={hideError} position="top-center" />
```

---

## 🎯 Icons

### All Available Icons

```tsx
// src/design-system/icons/index.ts
export { SearchIcon } from './SearchIcon';
export { XIcon } from './XIcon';
export { ChevronRightIcon } from './ChevronRightIcon';
export { PlusIcon } from './PlusIcon';
export { CheckIcon } from './CheckIcon';

// Individual icon components:

// SearchIcon
export const SearchIcon: React.FC<IconProps> = ({ size = 16, className = '', strokeWidth = 2 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

// XIcon
export const XIcon: React.FC<IconProps> = ({ size = 16, className = '', strokeWidth = 2 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

// ChevronRightIcon
export const ChevronRightIcon: React.FC<IconProps> = ({ size = 16, className = '', strokeWidth = 2 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

// PlusIcon
export const PlusIcon: React.FC<IconProps> = ({ size = 16, className = '', strokeWidth = 2 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M5 12h14" />
    <path d="m12 5 0 14" />
  </svg>
);

// CheckIcon
export const CheckIcon: React.FC<IconProps> = ({ size = 16, className = '', strokeWidth = 2 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
```

---

## 🚀 Usage Examples

### Import Everything

```tsx
// Import the entire design system
import { 
  // Tokens
  colors, spacing, typography, shadows,
  
  // Icons
  SearchIcon, XIcon, ChevronRightIcon, PlusIcon, CheckIcon,
  
  // Core Components
  Button, Input, SearchInput, Badge,
  
  // Modules
  StatCard, PlaceholderCard, Logo, UserProfile, Card, LoadingSpinner, Toast
} from '@/design-system';
```

### Complete Component Example

```tsx
import React, { useState } from 'react';
import { 
  Button, Input, StatCard, Toast, Card, CardHeader, CardTitle, CardContent,
  SearchIcon, PlusIcon, colors, spacing 
} from '@/design-system';

function ExamplePage() {
  const [showToast, setShowToast] = useState(false);
  const [searchValue, setSearchValue] = useState('');

  return (
    <div className="p-8 space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          label="Total Users" 
          value="1,247" 
          trend="+12%" 
          delay={0}
          onClick={() => console.log('Users clicked')}
        />
        <StatCard 
          label="Revenue" 
          value="$45,230" 
          trend="+8%" 
          delay={100}
        />
        <StatCard 
          label="Conversion" 
          value="3.2%" 
          delay={200}
        />
      </div>

      {/* Form Card */}
      <Card variant="elevated" padding="lg">
        <CardHeader>
          <CardTitle>User Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Input 
              label="Email"
              placeholder="Enter your email"
              icon={<SearchIcon />}
            />
            
            <div className="flex gap-3">
              <Button variant="primary" size="md">
                Save Changes
              </Button>
              <Button 
                variant="secondary" 
                icon={<PlusIcon />}
                onClick={() => setShowToast(true)}
              >
                Add New
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toast Notification */}
      <Toast 
        message="Successfully saved!"
        type="success"
        show={showToast}
        onClose={() => setShowToast(false)}
      />
    </div>
  );
}
```

---

## 🎨 Design Principles

### Color Usage
- **Gray Scale**: Primary neutral palette for text and backgrounds
- **Blue**: Primary brand color for CTAs and links
- **Emerald**: Success states and positive actions
- **Amber**: Warning states and caution
- **Red**: Error states and destructive actions

### Spacing System
- Based on 8px grid for consistent layouts
- Use `spacing[4]` (16px) for standard component padding
- Use `spacing[6]` (24px) for section spacing
- Use `spacing[8]` (32px) for page-level spacing

### Typography Scale
- **Display**: Large hero text and page titles
- **Heading**: Section headers and component titles
- **Body**: Regular content and descriptions
- **Label**: Form labels and metadata

### Component Composition
- **Atoms**: Basic building blocks (Button, Input)
- **Molecules**: Simple combinations (SearchInput)
- **Organisms**: Complex components (StatCard, UserProfile)

---

## 📦 Installation & Setup

1. **Copy the design system files** to your `src/design-system/` directory
2. **Import the CSS** in your main CSS file:
   ```css
   @import './design-system/styles/index.css';
   ```
3. **Use components** throughout your application:
   ```tsx
   import { Button, StatCard } from '@/design-system';
   ```

---

## 🔧 Extending the System

### Adding New Icons
1. Create new icon component in `src/design-system/icons/`
2. Follow the existing pattern with `IconProps` interface
3. Export from `src/design-system/icons/index.ts`

### Adding New Components
1. Determine atomic level (core vs modules)
2. Use existing design tokens
3. Follow TypeScript patterns
4. Add to appropriate index file

### Customizing Tokens
1. Modify token files in `src/design-system/tokens/`
2. Components automatically inherit changes
3. Maintain semantic naming conventions

This design system provides a solid foundation for building consistent, maintainable, and scalable user interfaces!