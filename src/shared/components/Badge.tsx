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
  default: 'bg-slate-100/50 text-slate-500 border-slate-200/50',
  accent: 'bg-blue-50/80 text-blue-600 border-blue-200/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)]',
  success: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)]',
  warning: 'bg-amber-50/80 text-amber-700 border-amber-200/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)]',
  info: 'bg-sky-50/80 text-sky-700 border-sky-200/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)]',
  purple: 'bg-purple-50/80 text-purple-700 border-purple-200/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)]',
  orange: 'bg-orange-50/80 text-orange-700 border-orange-200/40 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.4)]',
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