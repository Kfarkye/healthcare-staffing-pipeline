// ============================================================================
// /src/shared/hooks/useSavedView.ts
// ============================================================================

import { useLocalStorage } from './useLocalStorage';
import type { FilterState, SortConfig } from '../types';

interface SavedView {
    filters: FilterState;
    sortConfig: SortConfig;
    viewMode?: string;
}

interface UseSavedViewReturn {
    savedView: SavedView | null;
    hasSavedView: boolean;
    saveView: (view: SavedView) => void;
    loadView: () => SavedView | null;
    clearView: () => void;
}

export function useSavedView(storageKey: string): UseSavedViewReturn {
    const [savedView, setSavedView] = useLocalStorage<SavedView | null>(
        storageKey, 
        null
    );
    
    const saveView = (view: SavedView) => {
        setSavedView(view);
    };
    
    const loadView = () => {
        return savedView;
    };
    
    const clearView = () => {
        setSavedView(null);
    };
    
    return {
        savedView,
        hasSavedView: savedView !== null,
        saveView,
        loadView,
        clearView
    };
}