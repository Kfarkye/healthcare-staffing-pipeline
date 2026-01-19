// ============================================================================
// Design System - Plus Icon
// ============================================================================

import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export const PlusIcon: React.FC<IconProps> = ({ 
  size = 16, 
  className = '',
  strokeWidth = 2 
}) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth={strokeWidth}
    strokeLinecap="round" 
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12h14" />
    <path d="m12 5 0 14" />
  </svg>
);