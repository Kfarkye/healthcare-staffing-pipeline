// ============================================================================
// Design System - Input Component (Atom)
// Production-ready input with variants and states
// ============================================================================

import React from 'react';
import { colors, spacing, borderRadius } from '../tokens';

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