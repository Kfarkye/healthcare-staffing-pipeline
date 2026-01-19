// ============================================================================
// Design System - LoadingSpinner Component (Atom)
// Consistent loading states across the application
// ============================================================================

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