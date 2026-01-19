// ============================================================================
// Design System - Logo Component (Organism)
// Brand logo with consistent styling
// ============================================================================

import React from 'react';
import { shadows } from '../tokens';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Logo: React.FC<LogoProps> = ({ 
  size = 'md',
  showText = true,
  className = '',
  onClick
}) => {
  const sizes = {
    sm: { icon: 'w-7 h-7', text: 'text-base' },
    md: { icon: 'w-9 h-9', text: 'text-lg' },
    lg: { icon: 'w-12 h-12', text: 'text-xl' },
  };
  
  const sizeConfig = sizes[size];
  
  return (
    <div 
      className={`flex items-center gap-2.5 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      <div 
        className={`
          relative ${sizeConfig.icon} rounded-xl bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 
          flex items-center justify-center group transition-all duration-300 
          ${onClick ? 'hover:scale-110 active:scale-105' : ''}
        `}
        style={{ boxShadow: shadows.lg }}
      >
        {/* Shine effect */}
        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/12 via-transparent to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-90"></div>
        
        {/* Bottom highlight */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
        
        {/* Logo text */}
        <span 
          className={`
            relative text-white font-bold tracking-tight z-10 transition-all duration-300 
            ${onClick ? 'group-hover:scale-110' : ''}
            ${size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base'}
          `}
          style={{
            textShadow: `
              0 1px 2px rgba(0, 0, 0, 0.35),
              0 2px 4px rgba(0, 0, 0, 0.25),
              0 0 10px rgba(255, 255, 255, 0.15)
            `
          }}
        >
          P
        </span>
      </div>
      
      {showText && (
        <span className={`${sizeConfig.text} font-semibold text-gray-900 tracking-tight`}>
          Pipeline
        </span>
      )}
    </div>
  );
};