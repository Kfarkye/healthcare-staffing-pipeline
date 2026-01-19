import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Mail, Phone, MapPin, Clock, User } from 'lucide-react';
import type { Prospect } from '../../types/database';

interface ProspectCardProps {
  prospect: Prospect;
  onClick?: () => void;
  isDraggable?: boolean;
  variant?: 'board' | 'list';
}

export const ProspectCard: React.FC<ProspectCardProps> = ({ 
  prospect, 
  onClick,
  isDraggable = false,
  variant = 'board'
}) => {
  // Drag and drop setup (only if draggable)
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: prospect.id.toString(),
    disabled: !isDraggable,
  });

  const style = isDraggable ? {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } : {};

  // Status color mapping
  const statusColors: Record<string, string> = {
    'New': 'bg-gray-100 text-gray-700',
    'Contacted': 'bg-blue-100 text-blue-700',
    'Interested': 'bg-green-100 text-green-700',
    'Submitted': 'bg-purple-100 text-purple-700',
    'Offer Extended': 'bg-orange-100 text-orange-700',
    'Hired': 'bg-emerald-100 text-emerald-700',
    'Exited': 'bg-red-100 text-red-700',
  };

  const cardContent = (
    <div
      className={`
        bg-white rounded-lg border border-gray-200 p-4 transition-all
        ${onClick ? 'hover:shadow-md cursor-pointer' : ''}
        ${variant === 'list' ? 'flex items-center gap-4' : ''}
      `}
      onClick={onClick}
    >
      {/* Avatar */}
      <div className={`${variant === 'list' ? '' : 'mb-3'}`}>
        <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
          <User size={16} className="text-gray-600" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {/* Name and Status */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {prospect.name}
            </h3>
            {prospect.specialty && (
              <p className="text-xs text-gray-500">{prospect.specialty}</p>
            )}
          </div>
          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[prospect.status] || statusColors['New']}`}>
            {prospect.status}
          </span>
        </div>

        {/* Contact Info */}
        <div className="space-y-1">
          {prospect.email && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Mail size={12} />
              <span className="truncate">{prospect.email}</span>
            </div>
          )}
          {prospect.phone && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <Phone size={12} />
              <span>{prospect.phone}</span>
            </div>
          )}
          {prospect.home_state && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <MapPin size={12} />
              <span>{prospect.home_state}</span>
            </div>
          )}
        </div>

        {/* Footer Info */}
        {prospect.updated_at && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-2">
            <Clock size={12} />
            <span>Updated {new Date(prospect.updated_at).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (isDraggable) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
      >
        {cardContent}
      </div>
    );
  }

  return cardContent;
};