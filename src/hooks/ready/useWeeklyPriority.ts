// ============================================================================
// src/hooks/ready/useWeeklyPriority.ts
// ULTIMATE PRODUCTION VERSION
// Enterprise-grade weekly priority management with React Query
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { PRIORITY_STATUSES, MAX_WEEKLY_PROSPECTS } from '../../lib/constants';
import { getStartOfWeek, shouldResetThisWeek, markResetComplete } from '../../lib/dates';

// ============================================================================
// TYPES
// ============================================================================

export type PriorityStatus = typeof PRIORITY_STATUSES[number];

export interface PriorityProspect {
  id: number;
  name: string;
  specialty?: string | null;
  status: string;
  previous_status_info?: string | null;
  status_updated_at?: string | null;
  updated_at?: string | null;
  phone?: string | null;
  email?: string | null;
  nova_url?: string | null;
}

interface MoveProspectParams {
  id: number;
  newStatus: PriorityStatus;
  previousStatus?: PriorityStatus;
}

interface AddProspectParams {
  id: number;
  previousStatus: string;
}

// ============================================================================
// HOOK
// ============================================================================

export function useWeeklyPriority() {
  const queryClient = useQueryClient();

  // ============================================================================
  // QUERIES - Data Fetching with React Query
  // ============================================================================

  // Fetch priority prospects (those in the board)
  const {
    data: priority = [],
    isLoading: isLoadingPriority,
    error: priorityError,
    refetch: refetchPriority,
  } = useQuery<PriorityProspect[]>({
    queryKey: ['weekly-priority'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('prospects')
        .select('id, name, specialty, status, previous_status_info, status_updated_at, updated_at, phone, email, nova_url')
        .in('status', PRIORITY_STATUSES as any)
        .order('status_updated_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch priority prospects: ${error.message}`);
      return data || [];
    },
    staleTime: 30000, // Consider data fresh for 30 seconds
    refetchOnWindowFocus: true,
  });

  // Fetch available prospects (all non-priority prospects)
  const {
    data: available = [],
    isLoading: isLoadingAvailable,
    error: availableError,
    refetch: refetchAvailable,
  } = useQuery<PriorityProspect[]>({
    queryKey: ['available-for-priority'],
    queryFn: async () => {
      // Fetch all prospects and filter out priority ones in memory
      // This is simpler and avoids PostgREST query complexity
      const { data: allProspects, error } = await supabase
        .from('prospects')
        .select('id, name, specialty, status, previous_status_info, phone, email')
        .order('updated_at', { ascending: false })
        .limit(500); // Get more prospects to filter from

      if (error) throw new Error(`Failed to fetch available prospects: ${error.message}`);

      // Filter out priority statuses
      const prioritySet = new Set(PRIORITY_STATUSES);
      const filtered = (allProspects || []).filter(p => !prioritySet.has(p.status as any));

      return filtered.slice(0, 100); // Return top 100 after filtering
    },
    staleTime: 60000, // Consider data fresh for 1 minute
  });

  // ============================================================================
  // MUTATIONS - Data Modifications
  // ============================================================================

  // Smart Weekly Reset - Preserves original prospect status
  const resetMutation = useMutation({
    mutationFn: async () => {
      // Fetch all current priority prospects
      const { data: currentPriority, error: selectError } = await supabase
        .from('prospects')
        .select('id, previous_status_info, status')
        .in('status', PRIORITY_STATUSES as any);

      if (selectError) throw new Error(`Reset failed: ${selectError.message}`);
      if (!currentPriority || currentPriority.length === 0) return;

      console.log(`[Weekly Reset] Restoring ${currentPriority.length} prospects to original status`);

      // Restore each prospect to their original status
      const updates = currentPriority.map(prospect => {
        const restoredStatus = prospect.previous_status_info || 'New Lead';
        
        return supabase
          .from('prospects')
          .update({
            status: restoredStatus,
            previous_status_info: null,
            status_updated_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);
      });

      const results = await Promise.all(updates);
      const errors = results.filter(r => r.error);
      
      if (errors.length > 0) {
        console.error('[Weekly Reset] Some updates failed:', errors);
        throw new Error(`Reset partially failed: ${errors.length} prospects couldn't be updated`);
      }

      console.log('[Weekly Reset] Completed successfully');
    },
    onSuccess: () => {
      markResetComplete();
      queryClient.invalidateQueries({ queryKey: ['weekly-priority'] });
      queryClient.invalidateQueries({ queryKey: ['available-for-priority'] });
    },
    onError: (error) => {
      console.error('[Weekly Reset] Failed:', error);
    },
  });

  // Move prospect between priority columns
  const moveMutation = useMutation({
    mutationFn: async ({ id, newStatus }: MoveProspectParams) => {
      const { error } = await supabase
        .from('prospects')
        .update({
          status: newStatus,
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw new Error(`Failed to move prospect: ${error.message}`);
    },
    onMutate: async ({ id, newStatus }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['weekly-priority'] });

      // Snapshot previous value
      const previousPriority = queryClient.getQueryData<PriorityProspect[]>(['weekly-priority']);

      // Optimistically update
      queryClient.setQueryData<PriorityProspect[]>(['weekly-priority'], (old = []) =>
        old.map(p =>
          p.id === id
            ? { ...p, status: newStatus, status_updated_at: new Date().toISOString() }
            : p
        )
      );

      return { previousPriority };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousPriority) {
        queryClient.setQueryData(['weekly-priority'], context.previousPriority);
      }
      console.error('[Move] Failed:', error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-priority'] });
    },
  });

  // Add prospect to priority board
  const addMutation = useMutation({
    mutationFn: async ({ id, previousStatus }: AddProspectParams) => {
      // Check limit before adding
      const currentCount = priority.length;
      if (currentCount >= MAX_WEEKLY_PROSPECTS) {
        throw new Error(`Cannot exceed ${MAX_WEEKLY_PROSPECTS} priority prospects per week`);
      }

      const { error } = await supabase
        .from('prospects')
        .update({
          status: 'This Week',
          status_updated_at: new Date().toISOString(),
          previous_status_info: previousStatus, // Preserve original status
        })
        .eq('id', id);

      if (error) throw new Error(`Failed to add prospect: ${error.message}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-priority'] });
      queryClient.invalidateQueries({ queryKey: ['available-for-priority'] });
    },
    onError: (error) => {
      console.error('[Add] Failed:', error);
    },
  });

  // ============================================================================
  // WEEKLY RESET TRIGGER
  // ============================================================================

  useEffect(() => {
    if (shouldResetThisWeek() && !resetMutation.isPending) {
      console.log('[useWeeklyPriority] Triggering smart weekly reset...');
      resetMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  const moveBetweenColumns = useCallback(
    async (id: number, newStatus: PriorityStatus) => {
      return moveMutation.mutateAsync({ id, newStatus });
    },
    [moveMutation]
  );

  const addToPriority = useCallback(
    async (id: number, previousStatus: string) => {
      return addMutation.mutateAsync({ id, previousStatus });
    },
    [addMutation]
  );

  const refetch = useCallback(() => {
    refetchPriority();
    refetchAvailable();
  }, [refetchPriority, refetchAvailable]);

  return {
    // Data
    priority,
    available,
    
    // State
    loading: isLoadingPriority || isLoadingAvailable,
    error: priorityError || availableError,
    isMoving: moveMutation.isPending,
    isAdding: addMutation.isPending,
    isResetting: resetMutation.isPending,
    
    // Actions
    moveBetweenColumns,
    addToPriority,
    refetch,
    
    // Metadata
    canAddMore: priority.length < MAX_WEEKLY_PROSPECTS,
    slotsRemaining: MAX_WEEKLY_PROSPECTS - priority.length,
  };
}