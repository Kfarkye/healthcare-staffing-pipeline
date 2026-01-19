// ============================================================================
// src/components/shared/Badges.tsx
// Reusable badge components for visual consistency
// ============================================================================

import React from 'react';

// Assuming SourceType is defined elsewhere, e.g., in your types file
export type SourceType = 'PROSPECT' | 'TRANSITIONING' | 'EXTENSION_REQUEST' | 'EXTENSION_SIGNED' | string;

const cn = (...classes: (string | boolean | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'info' | 'purple' | 'orange';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-100 text-slate-700',
  accent: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  info: 'bg-blue-50 text-blue-700',
  purple: 'bg-purple-50 text-purple-700',
  orange: 'bg-orange-50 text-orange-700',
};

/**
 * Base Badge Component
 */
export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className }) => {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
};

/**
 * Convenience badge components for common use cases
 */
export const DefaultBadge: React.FC<Omit<BadgeProps, 'variant'>> = (props) => (
  <Badge variant="default" {...props} />
);

export const AccentBadge: React.FC<Omit<BadgeProps, 'variant'>> = (props) => (
  <Badge variant="accent" {...props} />
);

export const SuccessBadge: React.FC<Omit<BadgeProps, 'variant'>> = (props) => (
  <Badge variant="success" {...props} />
);

export const WarningBadge: React.FC<Omit<BadgeProps, 'variant'>> = (props) => (
  <Badge variant="warning" {...props} />
);

export const PurpleBadge: React.FC<Omit<BadgeProps, 'variant'>> = (props) => (
  <Badge variant="purple" {...props} />
);

export const OrangeBadge: React.FC<Omit<BadgeProps, 'variant'>> = (props) => (
  <Badge variant="orange" {...props} />
);

/**
 * Source Badge - Smart badge for prospect source types
 */
interface SourceBadgeProps {
  sourceType: SourceType;
  isActiveSubmittal?: boolean;
  className?: string;
}

export const SourceBadge: React.FC<SourceBadgeProps> = ({
  sourceType,
  isActiveSubmittal,
  className,
}) => {
  let text = 'Unknown';
  let variant: BadgeVariant = 'default';

  switch (sourceType) {
    case 'PROSPECT':
      text = 'Prospect';
      variant = 'accent';
      break;
    case 'TRANSITIONING':
      text = isActiveSubmittal ? 'Active' : 'Transitioning';
      variant = isActiveSubmittal ? 'success' : 'purple';
      break;
    case 'EXTENSION_REQUEST':
      text = 'Extension';
      variant = 'warning';
      break;
    case 'EXTENSION_SIGNED':
      text = 'Active';
      variant = 'success';
      break;
    default:
      text = sourceType;
      variant = 'default';
  }

  return (
    <Badge variant={variant} className={className}>
      {text}
    </Badge>
  );
};