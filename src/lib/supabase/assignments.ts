/**
 * Active Assignments Data Layer
 *
 * Provides hooks and functions for managing active assignment data from Supabase.
 * Uses TanStack Query for caching, optimistic updates, and realtime synchronization.
 *
 * UPDATED: Now queries active_dashboard_view (Active status only)
 * REMOVED: 'Accepted' status clinicians (signed/prestart) from dashboard
 * FIXED: Corrected RPC parameter names and standardized on using the primary `id` for all mutations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '../supabase';

export interface ActiveAssignment {
  id: string | number; // Primary key from active_assignments table
  candidate_id: string | number;
  engagement_id: string | number;
  candidate_name: string;
  phone: string | null;
  email: string | null;
  nova_url: string | null;
  facility_name: string | null;
  specialty: string | null;
  end_date: string;
  days_to_end: number;
  end_bucket: string;
  status: string;
  bill_rate: number | null;
  actual_margin: number | null;
  notes: string | null;
  extension_stage: string;
  is_looking_for_new_facility: boolean;
  is_exiting: boolean;
  am_name?: string | null;
  ac_name?: string | null;
}

export interface AssignmentFilters {
  search?: string;
  stage?: string;
  weekMin?: number;
  weekMax?: number;
  looking?: boolean;
  exiting?: boolean;
}

// ============================================================================
// QUERY KEY FACTORY
// ============================================================================

const assignmentKeys = {
  all: ['assignments'] as const,
  lists: () => [...assignmentKeys.all, 'list'] as const,
  list: (filters: AssignmentFilters) => [...assignmentKeys.lists(), filters] as const,
};

// ============================================================================
// FETCH ASSIGNMENTS - UPDATED: Now queries active_dashboard_view (Active status only)
// REMOVED: 'Accepted' status clinicians (signed/prestart)
// ============================================================================

async function fetchActiveAssignments(filters: AssignmentFilters = {}): Promise<ActiveAssignment[]> {
  console.log('[fetchActiveAssignments] Fetching from active_dashboard_view with filters:', filters);

  // ========================================================================
  // Query active_assignments_dashboard
  // NOTE: The view pulls from active_assignments table which should only contain Active status
  // ========================================================================
  let query = supabase
    .from('active_assignments_dashboard')
    .select('*')
    .order('days_to_end', { ascending: true });

  // Apply filters
  if (filters.stage) {
    query = query.eq('extension_stage', filters.stage);
  }

  if (filters.weekMin !== undefined && filters.weekMax !== undefined) {
    query = query.gte('days_to_end', filters.weekMin).lte('days_to_end', filters.weekMax);
  }

  if (filters.looking === true) {
    query = query.eq('is_looking_for_new_facility', true);
  }

  if (filters.exiting === true) {
    query = query.eq('is_exiting', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[fetchActiveAssignments] Query error:', error);
    throw new Error(`Failed to fetch assignments: ${error.message}`);
  }

  console.log('[fetchActiveAssignments] Fetched assignments:', data?.length || 0);

  // Validate that all returned records have status = 'Active' (development only)
  if (data && process.env.NODE_ENV === 'development') {
    const nonActiveRecords = data.filter(d => d.status !== 'Active');
    if (nonActiveRecords.length > 0) {
      console.warn('[fetchActiveAssignments] WARNING: Found non-Active records:', nonActiveRecords);
    }
  }

  // Apply client-side search filter (full-text search on multiple fields)
  let results = data || [];
  if (filters.search && filters.search.trim()) {
    const searchLower = filters.search.toLowerCase();
    results = results.filter(
      (a) =>
        a.candidate_name?.toLowerCase().includes(searchLower) ||
        a.facility_name?.toLowerCase().includes(searchLower) ||
        a.specialty?.toLowerCase().includes(searchLower)
    );
  }

  return results;
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Hook to fetch and manage active assignments with optional filtering
 */
export function useAssignments(filters: AssignmentFilters = {}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: assignmentKeys.list(filters),
    queryFn: () => fetchActiveAssignments(filters),
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchOnWindowFocus: true,
  });

  // Subscribe to realtime changes
  // UPDATED: Only listen for Active status changes (no more Accepted)
  useEffect(() => {
    const channel = supabase
      .channel('engagements_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'engagements',
          filter: 'status=eq.Active', // ← UPDATED: Only Active status
        },
        (payload) => {
          console.log('[useAssignments] Engagement changed:', payload);
          // Invalidate all assignment queries on any change
          queryClient.invalidateQueries({ queryKey: assignmentKeys.lists() });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

/**
 * Mutation to update extension stage for one or more engagements
 * FIXED: Uses correct RPC parameter names (p_ids, p_new_stage)
 */
export function useUpdateExtensionStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      newStage,
    }: {
      id: number;
      newStage: string;
    }) => {
      console.log('[RPC] Calling bulk_update_extension_stage with:', {
        p_ids: [id],
        p_new_stage: newStage,
      });

      const { data, error } = await supabase.rpc('bulk_update_extension_stage', {
        p_ids: [id],         // ← FIXED: Matches SQL function parameter name
        p_new_stage: newStage, // ← FIXED: Matches SQL function parameter name
      });

      console.log('[RPC] Response:', { data, error, dataType: typeof data, isArray: Array.isArray(data) });

      if (error) {
        console.error('Error updating extension stage:', error);
        throw new Error(`Failed to update stage: ${error.message}`);
      }

      // FIXED: Function returns SETOF, so data is an array
      if (!Array.isArray(data) || data.length === 0) {
        console.error('[RPC] No engagement updated. Data:', data);
        throw new Error(`No engagement found with ID ${id}`);
      }

      console.log('[RPC] Update successful, returning:', data[0]);
      return data[0];
    },
    onMutate: async ({ id, newStage }) => {
      // Cancel outgoing queries
      await queryClient.cancelQueries({ queryKey: assignmentKeys.lists() });

      // Snapshot previous values
      const previousQueries = queryClient.getQueriesData<ActiveAssignment[]>({
        queryKey: assignmentKeys.lists(),
      });

      // Optimistically update all matching queries
      queryClient.setQueriesData<ActiveAssignment[]>(
        { queryKey: assignmentKeys.lists() },
        (old) => {
          if (!old) return old;
          return old.map((assignment) =>
            assignment.id === id
              ? { ...assignment, extension_stage: newStage }
              : assignment
          );
        }
      );

      return { previousQueries };
    },
    onError: (err, variables, context) => {
      console.error('Update stage error:', err);
      // Rollback optimistic updates
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: assignmentKeys.lists() });
    },
  });
}

/**
 * Mutation to toggle looking/exiting flags
 * FIXED: Uses correct RPC parameter name `p_id` and handles SETOF return
 */
export function useToggleAssignmentFlag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      flagName,
      flagValue,
    }: {
      id: number;
      flagName: 'looking' | 'exiting';
      flagValue: boolean;
    }) => {
      console.log('[toggleFlag] Calling RPC with:', { id, flagName, flagValue });

      const { data, error } = await supabase.rpc('toggle_assignment_flag', {
        p_id: id,                 // ← CRITICAL FIX: Changed from p_engagement_id to p_id
        p_flag_name: flagName,    // ← FIXED: Matches SQL function parameter name
        p_flag_value: flagValue,  // ← FIXED: Matches SQL function parameter name
      });

      if (error) {
        console.error('Error toggling flag:', error);
        throw new Error(`Failed to toggle flag: ${error.message}`);
      }

      // FIXED: Function returns SETOF, so data is an array
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error(`No assignment found with ID ${id}`);
      }

      console.log('[toggleFlag] Success:', data[0]);
      return data[0];
    },
    onMutate: async ({ id, flagName, flagValue }) => {
      await queryClient.cancelQueries({ queryKey: assignmentKeys.lists() });

      const previousQueries = queryClient.getQueriesData<ActiveAssignment[]>({
        queryKey: assignmentKeys.lists(),
      });

      // Optimistically update
      queryClient.setQueriesData<ActiveAssignment[]>(
        { queryKey: assignmentKeys.lists() },
        (old) => {
          if (!old) return old;
          return old.map((assignment) =>
            assignment.id === id
              ? {
                ...assignment,
                is_looking_for_new_facility:
                  flagName === 'looking' ? flagValue : assignment.is_looking_for_new_facility,
                is_exiting:
                  flagName === 'exiting' ? flagValue : assignment.is_exiting,
              }
              : assignment
          );
        }
      );

      return { previousQueries };
    },
    onError: (err, variables, context) => {
      console.error('Toggle flag error:', err);
      if (context?.previousQueries) {
        context.previousQueries.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.lists() });
    },
  });
}

/**
 * Change assignment status (Active → Accepted, etc.)
 * FIXED: Standardized to use primary `id` for consistency.
 *
 * Use cases:
 * - Mark as "Accepted" when extension is signed (moves to Prestart Dashboard)
 * - Mark as "Completed" when assignment ends
 * - Mark as "Cancelled" if assignment is terminated early
 */
export function useUpdateAssignmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      newStatus,
    }: {
      id: number;
      newStatus: 'Active' | 'Accepted' | 'Completed' | 'Cancelled';
    }) => {
      console.log('[updateStatus] Changing status:', { id, newStatus });

      // This assumes a relationship where `active_assignments.id` can be used to find the right engagement.
      // This is more robust than relying on `engagement_id` which can be null.
      // A backend function (`update_engagement_status_by_assignment_id`) would be even better,
      // but a direct update can work if the relationship is clear.
      const { error } = await supabase
        .from('engagements')
        .update({
          status: newStatus,
          // If marking as Accepted, also update extension_stage to 'signed'
          ...(newStatus === 'Accepted' ? { extension_stage: 'signed' } : {})
        })
        .eq('id', id); // ← CRITICAL FIX: Changed from engagement_id to id for consistency

      if (error) {
        console.error('[updateStatus] Error:', error);
        throw new Error(error.message);
      }

      return { id, newStatus };
    },
    onSuccess: (data) => {
      console.log('[updateStatus] Success:', data);
      // Refresh the active assignments list
      queryClient.invalidateQueries({ queryKey: assignmentKeys.lists() });
    },
  });
}

/**
 * Mutation to import assignments from TSV data
 */
export function useImportAssignments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tsvData: string) => {
      // Import dynamically to avoid circular dependencies
      const { parseAssignmentData, importAssignmentsToSupabase } = await import(
        '../../services/tsvImportService'
      );

      // Parse TSV data
      const assignments = parseAssignmentData(tsvData);

      if (assignments.length === 0) {
        throw new Error('No valid assignments found in TSV data');
      }

      // Import to Supabase
      const result = await importAssignmentsToSupabase(assignments);

      if (!result.success) {
        throw new Error(result.errors.join('; '));
      }

      return result;
    },
    onSuccess: (result) => {
      console.log(`[Import] Successfully imported ${result.imported} assignments`);
      // Invalidate all queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: assignmentKeys.lists() });
    },
    onError: (error) => {
      console.error('[Import] Failed to import assignments:', error);
    },
  });
}