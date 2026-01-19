// ============================================================================
// Design System - UserProfile Component (Organism)
// User avatar and information display
// ============================================================================

import React from 'react';
import { shadows } from '../tokens';

interface User {
  name: string;
  email: string;
  initials: string;
  avatar?: string;
}

interface UserProfileProps {
  user: User;
  size?: 'sm' | 'md' | 'lg';
  showEmail?: boolean;
  className?: string;
  onClick?: () => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ 
  user, 
  size = 'md',
  showEmail = true,
  className = '',
  onClick
}) => {
  const sizes = {
    sm: { avatar: 'w-7 h-7', text: 'text-sm', email: 'text-xs' },
    md: { avatar: 'w-9 h-9', text: 'text-sm', email: 'text-xs' },
    lg: { avatar: 'w-12 h-12', text: 'text-base', email: 'text-sm' },
  };
  
  const sizeConfig = sizes[size];
  
  return (
    <div 
      className={`
        animate-fadeInUp ${className}
        ${onClick ? 'cursor-pointer' : ''}
      `} 
      style={{ animationDelay: '200ms', opacity: 0 }}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-all duration-300 group active:scale-[0.98]">
        {/* Avatar */}
        <div 
          className={`
            relative ${sizeConfig.avatar} rounded-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 
            flex items-center justify-center text-white font-bold shrink-0 transition-all duration-300 
            ${onClick ? 'group-hover:scale-110' : ''}
          `}
          style={{ boxShadow: shadows.md }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/12 via-transparent to-transparent opacity-70 transition-opacity duration-300 group-hover:opacity-90"></div>
          
          {user.avatar ? (
            <img 
              src={user.avatar} 
              alt={user.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            <span 
              className={`
                relative z-10 transition-all duration-300 
                ${onClick ? 'group-hover:scale-110' : ''}
                ${size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'}
              `}
              style={{
                textShadow: `
                  0 1px 2px rgba(0, 0, 0, 0.35),
                  0 2px 4px rgba(0, 0, 0, 0.25)
                `
              }}
            >
              {user.initials}
            </span>
          )}
        </div>
        
        {/* User Info */}
        <div className="flex-1 min-w-0">
          <p className={`${sizeConfig.text} font-semibold text-gray-900 truncate transition-colors duration-300 group-hover:text-gray-950`}>
            {user.name}
          </p>
          {showEmail && (
            <p className={`${sizeConfig.email} text-gray-500 truncate transition-colors duration-300 group-hover:text-gray-600`}>
              {user.email}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};