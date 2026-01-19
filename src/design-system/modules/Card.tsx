// ============================================================================
// Design System - Card Component (Organism)
// Flexible container for content with consistent styling
// ============================================================================

import React from 'react';
import { shadows } from '../tokens';

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
    default: `border border-slate-200/80 ${hover ? 'hover:border-slate-300/80 hover:shadow-lg' : ''}`,
    elevated: `border border-slate-100/80 shadow-md ${hover ? 'hover:shadow-xl' : ''}`,
    outlined: `border-2 border-slate-200 ${hover ? 'hover:border-slate-300' : ''}`,
    ghost: `border-0 ${hover ? 'hover:bg-slate-50' : ''}`,
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
      style={{ boxShadow: variant === 'default' ? shadows.sm : undefined }}
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
  <div className={`pb-4 border-b border-slate-100 ${className}`}>
    {children}
  </div>
);

export const CardTitle: React.FC<{ 
  children: React.ReactNode; 
  className?: string;
}> = ({ children, className = '' }) => (
  <h3 className={`text-lg font-semibold text-slate-900 ${className}`}>
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
  <div className={`pt-4 border-t border-slate-100 ${className}`}>
    {children}
  </div>
);