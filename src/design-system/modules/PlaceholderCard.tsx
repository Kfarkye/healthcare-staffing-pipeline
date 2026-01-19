// ============================================================================
// Design System - PlaceholderCard Component (Organism)
// Coming soon cards with shimmer effects
// ============================================================================

import React from 'react';
import { shadows } from '../tokens';

interface PlaceholderCardProps {
  title: string;
  description: string;
  comingSoon?: boolean;
  className?: string;
  onClick?: () => void;
}

export const PlaceholderCard: React.FC<PlaceholderCardProps> = ({ 
  title, 
  description, 
  comingSoon = false,
  className = '',
  onClick
}) => {
  return (
    <div 
      className={`
        group bg-white rounded-2xl border border-gray-200/80 overflow-hidden 
        hover:border-gray-300/80 transition-all duration-500 
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
      style={{ boxShadow: shadows.sm }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = shadows.lg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = shadows.sm;
      }}
    >
      {/* Header */}
      <div className="p-6 border-b border-gray-100/80 bg-gradient-to-br from-white to-gray-50/30">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900 mb-1.5 transition-colors duration-300 group-hover:text-gray-950">
              {title}
            </h3>
            <p className="text-[13px] text-gray-500 leading-relaxed transition-colors duration-300 group-hover:text-gray-600">
              {description}
            </p>
          </div>
          {comingSoon && (
            <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-all duration-300 group-hover:bg-blue-100 group-hover:scale-105">
              Coming Soon
            </span>
          )}
        </div>
      </div>
      
      {/* Shimmer Content */}
      <div className="bg-gray-50/50 p-8 transition-colors duration-500 group-hover:bg-gray-100/30">
        <div className="space-y-3">
          <div className="h-2.5 bg-gray-200/80 rounded-full animate-shimmer w-3/4"></div>
          <div className="h-2.5 bg-gray-200/80 rounded-full animate-shimmer w-1/2" style={{ animationDelay: '0.3s' }}></div>
          <div className="h-2.5 bg-gray-200/80 rounded-full animate-shimmer w-5/6" style={{ animationDelay: '0.6s' }}></div>
        </div>
      </div>
    </div>
  );
};