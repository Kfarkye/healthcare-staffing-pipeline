// ============================================================================
// Design System - Search Input Component (Molecule)
// Specialized input for search functionality
// ============================================================================

import React from 'react';
import { Input } from './Input';
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