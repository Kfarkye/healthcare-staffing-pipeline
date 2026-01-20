// ============================================================================
// src/components/shared/Badges.tsx
// Reusable badge components for visual consistency
// ============================================================================

import React from 'react';

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
  default: 'bg-slate-50 text-slate-500 border-slate-200/60',
  accent: 'bg-blue-50 text-blue-600 border-blue-200/50',
  success: 'bg-emerald-50 text-emerald-600 border-emerald-200/50',
  warning: 'bg-amber-50 text-amber-600 border-amber-200/50',
  info: 'bg-sky-50 text-sky-600 border-sky-200/50',
  purple: 'bg-purple-50 text-purple-600 border-purple-200/50',
  orange: 'bg-orange-50 text-orange-600 border-orange-200/50',
};

/**
 * Base Badge Component
 */
export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className }) => {
  return (
    <span
      className={cn(
        'precision-badge',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
};

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