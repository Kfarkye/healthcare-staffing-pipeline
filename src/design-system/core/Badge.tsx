// ============================================================================
// Design System - Badge Component (Atom)
// Small status indicators and labels
// ============================================================================

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
    default: 'bg-slate-100 text-slate-800 hover:bg-slate-200',
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