// ============================================================================
// Design System - StatCard Component (Organism)
// Displays key metrics with optional trends and interactions
// ============================================================================

import React from 'react';
import { shadows } from '../tokens';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
  delay?: number;
  className?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  description?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ 
  label, 
  value, 
  trend, 
  delay = 0,
  className = '',
  onClick,
  icon,
  description
}) => {
  const isClickable = !!onClick;
  
  return (
    <div 
      className={`
        group relative bg-white rounded-2xl border border-slate-200/80 p-6
        transition-all duration-500 animate-fadeInUp
        ${isClickable ? 'hover:border-slate-300/80 cursor-pointer hover:shadow-lg' : ''}
        ${className}
      `}
      style={{ 
        animationDelay: `${delay}ms`, 
        opacity: 0,
        boxShadow: shadows.sm
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = shadows.lg;
        }
      }}
      onMouseLeave={(e) => {
        if (isClickable) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = shadows.sm;
        }
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {icon && (
            <div className="mb-3 text-slate-600">
              {icon}
            </div>
          )}
          <p className="text-[13px] font-medium text-slate-500 mb-2 transition-colors duration-300 group-hover:text-slate-600">
            {label}
          </p>
          <p className="text-3xl font-semibold text-slate-900 tracking-tight transition-all duration-300 group-hover:scale-105 origin-left">
            {value}
          </p>
          {description && (
            <p className="text-xs text-slate-400 mt-1">
              {description}
            </p>
          )}
        </div>
        {trend && (
          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg transition-all duration-300 group-hover:bg-emerald-100">
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};