import React from 'react';

export const CardSkeleton: React.FC = () => {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded w-3/4 skeleton" />
          <div className="h-3 bg-slate-100 rounded w-1/2 skeleton" />
        </div>
        <div className="flex gap-1">
          <div className="w-8 h-8 bg-slate-100 rounded-lg skeleton" />
          <div className="w-8 h-8 bg-slate-100 rounded-lg skeleton" />
        </div>
      </div>
      <div className="h-px bg-slate-100 mb-4" />
      <div className="flex items-center justify-between">
        <div className="h-6 bg-slate-100 rounded-lg w-24 skeleton" />
        <div className="h-6 bg-slate-100 rounded-lg w-16 skeleton" />
      </div>
    </div>
  );
};

export const ListRowSkeleton: React.FC = () => {
  return (
    <div className="flex items-center gap-4 px-5 py-4 border-b border-slate-100 animate-pulse">
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-slate-200 rounded w-48 skeleton" />
        <div className="h-3 bg-slate-100 rounded w-32 skeleton" />
      </div>
      <div className="hidden md:block w-48 space-y-2">
        <div className="h-3 bg-slate-100 rounded w-full skeleton" />
        <div className="h-3 bg-slate-100 rounded w-3/4 skeleton" />
      </div>
      <div className="flex gap-2">
        <div className="h-6 w-20 bg-slate-100 rounded-lg skeleton" />
        <div className="h-6 w-12 bg-slate-100 rounded skeleton" />
      </div>
    </div>
  );
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-[1800px] mx-auto px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-6 w-48 bg-slate-200 rounded skeleton" />
              <div className="h-4 w-32 bg-slate-100 rounded skeleton" />
            </div>
            <div className="h-12 w-80 bg-slate-100 rounded-xl skeleton" />
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
};
