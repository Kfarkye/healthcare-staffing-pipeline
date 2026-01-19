import React from 'react';
import { useDroppable } from '@dnd-kit/core';

interface StrictDroppableProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  minimal?: boolean; // Option for even more subtle feedback
}

export const StrictDroppable: React.FC<StrictDroppableProps> = ({ 
  id, 
  children, 
  className = '',
  minimal = false 
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`
        transition-all duration-300 relative
        ${className}
        ${isOver && !minimal ? 'bg-gray-50/50' : ''}
      `}
    >
      {/* Subtle border indicator for drop zone */}
      {isOver && (
        <div className="absolute inset-0 border-2 border-gray-300 border-dashed rounded-xl pointer-events-none animate-pulse" />
      )}
      
      {children}
    </div>
  );
};