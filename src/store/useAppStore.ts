// src/store/useAppStore.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { supabase } from '../lib/supabase';
import React from 'react';

// Import Prospect from shared types - single source of truth
import type { Prospect as SharedProspect, KanbanStatus, ModalType, Toast } from '../shared/types/database';
export { KANBAN_STATUSES } from '../shared/types/database';

// Re-export shared types for consumers of this store
export type { Prospect, ModalType, Toast } from '../shared/types/database';
type Prospect = SharedProspect;

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export const VISIBLE_KANBAN_COLUMNS = [
  'New',
  'Contacted',
  'Interested',
  'Profile Updates',
  'Submittal Ready',
  'Submitted'
] as const;

export type ColumnId = typeof VISIBLE_KANBAN_COLUMNS[number];

export interface Filters {
  searchTerm: string;
  selectedProfessions: string[];
  licenseStateQuery: string;
  statusFilter?: 'all' | ColumnId | 'Offer Extended' | 'Hired' | 'Exited';
  viewMode?: 'board' | 'list';
}

export type EnhancedFilterState = Filters;

interface ProspectState {
  // State
  prospects: Prospect[];
  loading: boolean;
  error: string | null;
  filters: Filters;

  // Actions
  fetchProspects: () => Promise<void>;
  updateFilters: (patch: Partial<Filters>) => void;
  updateProspect: (id: number | string, updates: Partial<Prospect>) => Promise<void>;
  createProspect: (prospect: Omit<Prospect, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  deleteProspect: (id: number | string) => Promise<void>;
  updateProspectStatus: (id: number | string, nextStatus: ColumnId, toIndex?: number) => void;
  reorderWithinColumn: (status: ColumnId, fromIndex: number, toIndex: number) => void;
  clearError: () => void;
}

interface UIState {
  // UI State
  activeModal: ModalType;
  selectedProspect: Prospect | null;
  toast: Toast | null;

  // UI Actions
  openModal: (type: ModalType, prospect?: Prospect) => void;
  closeModal: () => void;
  showToastNotification: (message: string, type?: Toast['type'], duration?: number) => void;
  hideToast: () => void;
}

export interface AppState extends ProspectState, UIState { }

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const arrayMove = <T>(array: T[], from: number, to: number): T[] => {
  const newArray = [...array];
  const [item] = newArray.splice(from, 1);
  newArray.splice(to, 0, item);
  return newArray;
};

const normalizeProspectOrder = (prospects: Prospect[]): Prospect[] => {
  const byColumn: Record<ColumnId, Prospect[]> = {
    'New': [],
    'Contacted': [],
    'Interested': [],
    'Profile Updates': [],  // ✅ FIXED: Added Profile Updates
    'Submittal Ready': [],
    'Submitted': []
  };

  // Group by status
  prospects.forEach(p => {
    if (byColumn[p.status]) {
      byColumn[p.status].push(p);
    }
  });

  // Normalize order within each column
  VISIBLE_KANBAN_COLUMNS.forEach(column => {
    byColumn[column].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    byColumn[column].forEach((prospect, index) => {
      prospect.order = index;
    });
  });

  // Return flattened array in column order
  return VISIBLE_KANBAN_COLUMNS.flatMap(column => byColumn[column]);
};

// ============================================================================
// ZUSTAND STORE
// ============================================================================

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      // --- PROSPECT STATE ---
      prospects: [],
      loading: false,
      error: null,
      filters: {
        searchTerm: '',
        selectedProfessions: [],
        licenseStateQuery: '',
        statusFilter: 'all',
        viewMode: 'board'
      },

      // --- UI STATE ---
      activeModal: null,
      selectedProspect: null,
      toast: null,

      // Fetch all prospects
      fetchProspects: async () => {
        set({ loading: true, error: null });

        try {
          const { data, error } = await supabase
            .from('prospects')
            .select('*')
            .order('status', { ascending: true });

          if (error) throw error;

          const prospects = normalizeProspectOrder(data || []);
          set({ prospects, loading: false });

        } catch (error: any) {
          set({
            error: error?.message || 'Failed to load prospects',
            loading: false
          });
        }
      },

      // Update filters
      updateFilters: (patch) => {
        set(state => ({
          filters: { ...state.filters, ...patch }
        }));
      },

      // Update a single prospect
      updateProspect: async (id, updates) => {
        // Optimistic update
        set(state => ({
          prospects: state.prospects.map(p =>
            String(p.id) === String(id)
              ? { ...p, ...updates, updated_at: new Date().toISOString() }
              : p
          )
        }));

        try {
          const { error } = await supabase
            .from('prospects')
            .update(updates)
            .eq('id', id);

          if (error) throw error;
        } catch (error: any) {
          // Revert on error
          get().fetchProspects();
          set({ error: error?.message || 'Failed to update prospect' });
        }
      },

      // Create a new prospect
      createProspect: async (newProspect) => {
        set({ loading: true, error: null });

        try {
          const { data, error } = await supabase
            .from('prospects')
            .insert([newProspect])
            .select()
            .single();

          if (error) throw error;

          set(state => ({
            prospects: normalizeProspectOrder([...state.prospects, data]),
            loading: false
          }));

        } catch (error: any) {
          set({
            error: error?.message || 'Failed to create prospect',
            loading: false
          });
        }
      },

      // Delete a prospect
      deleteProspect: async (id) => {
        // Optimistic removal
        set(state => ({
          prospects: state.prospects.filter(p => String(p.id) !== String(id))
        }));

        try {
          const { error } = await supabase
            .from('prospects')
            .delete()
            .eq('id', id);

          if (error) throw error;
        } catch (error: any) {
          // Revert on error
          get().fetchProspects();
          set({ error: error?.message || 'Failed to delete prospect' });
        }
      },

      // Update prospect status with advanced reordering
      updateProspectStatus: (id, nextStatus, toIndex) => {
        set(state => {
          const prospects = [...state.prospects];
          const prospectIndex = prospects.findIndex(p => String(p.id) === String(id));

          if (prospectIndex === -1) return state;

          const prospect = { ...prospects[prospectIndex] };

          // Group prospects by column
          const columns: Record<ColumnId, Prospect[]> = {
            'New': [],
            'Contacted': [],
            'Interested': [],
            'Profile Updates': [],  // ✅ FIXED: Added Profile Updates
            'Submittal Ready': [],
            'Submitted': []
          };

          prospects.forEach(p => {
            if (columns[p.status]) {
              columns[p.status].push(p);
            }
          });

          // Sort each column by order
          VISIBLE_KANBAN_COLUMNS.forEach(col => {
            columns[col].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
          });

          // Remove from source column
          const sourceColumn = columns[prospect.status as ColumnId];
          const sourceIndex = sourceColumn.findIndex(p => String(p.id) === String(prospect.id));

          if (sourceIndex !== -1) {
            sourceColumn.splice(sourceIndex, 1);
          }

          // Add to destination column
          prospect.status = nextStatus;
          const destColumn = columns[nextStatus];
          const insertIndex = toIndex != null
            ? Math.max(0, Math.min(toIndex, destColumn.length))
            : destColumn.length;

          destColumn.splice(insertIndex, 0, prospect);

          // Reorder all columns
          VISIBLE_KANBAN_COLUMNS.forEach(col => {
            columns[col].forEach((p, idx) => {
              p.order = idx;
            });
          });

          // Flatten back to array
          const finalProspects = VISIBLE_KANBAN_COLUMNS.flatMap(col => columns[col]);

          return { prospects: finalProspects };
        });

        // Async backend update (fire and forget)
        supabase
          .from('prospects')
          .update({
            status: nextStatus,
            order: toIndex,
            updated_at: new Date().toISOString()
          })
          .eq('id', id)
          .then();
      },

      // Reorder within the same column
      reorderWithinColumn: (status, fromIndex, toIndex) => {
        set(state => {
          const columnProspects = state.prospects
            .filter(p => p.status === status)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

          if (fromIndex < 0 || fromIndex >= columnProspects.length) {
            return state;
          }

          const reordered = arrayMove(columnProspects, fromIndex, toIndex);
          reordered.forEach((p, idx) => {
            p.order = idx;
          });

          const updatedProspects = state.prospects.map(p => {
            if (p.status === status) {
              const reorderedProspect = reordered.find(r => String(r.id) === String(p.id));
              return reorderedProspect || p;
            }
            return p;
          });

          return { prospects: updatedProspects };
        });

        // Batch update orders in backend
        const columnProspects = get().prospects
          .filter(p => p.status === status)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        Promise.all(
          columnProspects.map((p, idx) =>
            supabase
              .from('prospects')
              .update({ order: idx })
              .eq('id', p.id)
          )
        ).then();
      },

      // Clear error
      clearError: () => set({ error: null }),

      // --- UI ACTIONS ---
      openModal: (type, prospect = null) => set({
        activeModal: type,
        selectedProspect: prospect
      }),

      closeModal: () => set({
        activeModal: null,
        selectedProspect: null
      }),

      showToastNotification: (message, type = 'info', duration = 4000) => {
        set({ toast: { message, type } });
        setTimeout(() => {
          if (get().toast?.message === message) {
            set({ toast: null });
          }
        }, duration);
      },

      hideToast: () => set({ toast: null }),
    }),
    {
      name: 'prospect-store',
    }
  )
);

// ============================================================================
// STABLE SELECTOR HOOKS
// ============================================================================

export const useProspects = () =>
  useAppStore(useShallow(state => state.prospects));

export const useLoading = () =>
  useAppStore(state => state.loading);

export const useError = () =>
  useAppStore(state => state.error);

export const useFilters = () =>
  useAppStore(useShallow(state => state.filters));

export const useActions = () =>
  useAppStore(
    useShallow(state => ({
      fetchProspects: state.fetchProspects,
      updateFilters: state.updateFilters,
      updateProspect: state.updateProspect,
      createProspect: state.createProspect,
      deleteProspect: state.deleteProspect,
      updateProspectStatus: state.updateProspectStatus,
      reorderWithinColumn: state.reorderWithinColumn,
      clearError: state.clearError,
    }))
  );

// Computed selectors
export const useFilteredProspects = () => {
  const prospects = useProspects();
  const filters = useFilters();

  return React.useMemo(() => {
    let filtered = [...prospects];

    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        p.name?.toLowerCase().includes(searchLower) ||
        p.email?.toLowerCase().includes(searchLower) ||
        p.specialty?.toLowerCase().includes(searchLower)
      );
    }

    // Profession filter
    if (filters.selectedProfessions.length > 0) {
      filtered = filtered.filter(p =>
        p.profession && filters.selectedProfessions.includes(p.profession)
      );
    }

    // License state filter
    if (filters.licenseStateQuery) {
      const stateLower = filters.licenseStateQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.licenses?.some(license =>
          license.toLowerCase().includes(stateLower)
        )
      );
    }

    return filtered;
  }, [prospects, filters]);
};

// UI Related Selectors
export const useActiveModal = () => useAppStore(state => state.activeModal);
export const useSelectedProspect = () => useAppStore(state => state.selectedProspect);
export const useToast = () => useAppStore(state => state.toast);

export const useModalHelpers = () => {
  const openModal = useAppStore(state => state.openModal);
  const closeModal = useAppStore(state => state.closeModal);
  const showToastNotification = useAppStore(state => state.showToastNotification);

  const copyToClipboard = React.useCallback(async (text: string, id?: number) => {
    try {
      await navigator.clipboard.writeText(text);
      showToastNotification('Copied to clipboard', 'success');
    } catch (err) {
      showToastNotification('Failed to copy', 'error');
    }
  }, [showToastNotification]);

  return {
    openModal,
    closeModal,
    showToastNotification,
    copyToClipboard,
  };
};