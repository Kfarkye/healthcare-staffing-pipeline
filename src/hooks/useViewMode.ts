import { useState, useCallback } from 'react';

export type ViewMode = 'grid' | 'list';

const STORAGE_KEY = 'submittals-view-mode';

export function useViewMode(defaultMode: ViewMode = 'grid') {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return defaultMode;

    const stored = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    return stored || defaultMode;
  });

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode(viewMode === 'grid' ? 'list' : 'grid');
  }, [viewMode, setViewMode]);

  return {
    viewMode,
    setViewMode,
    toggleViewMode,
    isGrid: viewMode === 'grid',
    isList: viewMode === 'list',
  };
}
