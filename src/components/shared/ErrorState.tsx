// ============================================================================
// src/components/shared/ErrorState.tsx
// Reusable Error State with Retry
// ============================================================================

import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ 
  title = 'Error loading data',
  message,
  onRetry 
}) => {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 flex items-start gap-3">
      <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-red-900 mb-0.5">{title}</p>
        <p className="text-sm text-red-700">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 text-sm font-semibold text-red-700 hover:text-red-800 transition-colors duration-200 active:scale-[0.99]"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
};