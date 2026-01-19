import React from 'react';

export default function LoadingFallback(): JSX.Element {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center animate-fadeIn">
        <div className="relative w-12 h-12 mx-auto mb-4">
          <div className="absolute inset-0 border-4 border-slate-200 rounded-full" />
          <div
            className="absolute inset-0 border-4 border-slate-900 rounded-full border-t-transparent animate-spin"
            style={{ animationDuration: '0.8s' }}
          />
        </div>
        <p className="text-sm font-medium text-slate-600">
          Loading dashboard...
        </p>
      </div>
    </div>
  );
}
