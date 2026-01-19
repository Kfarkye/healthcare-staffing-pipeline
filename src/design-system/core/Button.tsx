// ============================================================================
// Design System - Button Component (Atom)
// Production-ready button with variants and states
// ============================================================================

import React from 'react';
import { colors, spacing, borderRadius, shadows, animations } from '../tokens';

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