import React from 'react';
import type { Prospect } from '../../../store/useAppStore';
import { Clock, ExternalLink } from 'lucide-react';

type Props = {
  prospect: Prospect;
  onClick?: () => void;
};

export const ProspectCard: React.FC<Props> = ({ prospect, onClick }) => {
  const timeSinceUpdate = (): string => {
    if (!prospect.updated_at) return 'never';
    const seconds = Math.floor((Date.now() - new Date(prospect.updated_at).getTime()) / 1000);
    if (seconds < 0) return 'just now';

    const intervals = [
      { label: 'y', seconds: 31536000 },
      { label: 'mo', seconds: 2592000 },
      { label: 'd', seconds: 86400 },
      { label: 'h', seconds: 3600 },
      { label: 'm', seconds: 60 },
      { label: 's', seconds: 1 },
    ] as const;

    for (const it of intervals) {
      const count = Math.floor(seconds / it.seconds);
      if (count >= 1) return `${count}${it.label} ago`;
    }
    return 'just now';
  };

  // Make whole card clickable, but ignore clicks originating on the <a>.
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a')) return;
    onClick?.();
  };

  const novaUrl = prospect.candidate_id 
    ? `https://nova.ayahealthcare.com/#/recruiting/candidates/${prospect.candidate_id}/new-profile/about`
    : null;

  // Stop events in the capture phase so dnd-kit and the card don’t intercept.
  const stopCapture = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const preventNativeDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      onClick={handleCardClick}
      className="bg-white p-3 rounded-lg border border-gray-200/80 shadow-sm hover:shadow-md hover:border-blue-300 transition-all duration-200 cursor-pointer"
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-semibold text-sm text-gray-800 flex-1 truncate">
          {prospect.name}
        </h3>
        {novaUrl && (
          <a
            href={novaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all duration-200"
            onPointerDownCapture={stopCapture}
            onClickCapture={stopCapture}
            draggable={false}
            onDragStart={preventNativeDrag}
            title="View in Nova"
          >
            <ExternalLink size={14} />
          </a>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-1 truncate">
        {prospect.specialty || 'No Specialty'}
      </p>

      <div className="flex items-center justify-between mt-2">
        {prospect.home_state ? (
          <span className="px-2 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-full">
            {prospect.home_state}
          </span>
        ) : (
          <span />
        )}
        <span className="text-xs text-gray-400 flex items-center gap-1 ml-auto">
          <Clock size={12} />
          {timeSinceUpdate()}
        </span>
      </div>
    </div>
  );
};