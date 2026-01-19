// ============================================================================
// Follow-Up React Query Hooks
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type {
  FollowUpDashboard,
  CreateFollowUpParams,
  FollowUpFilters
} from '../types/followUps';

const QUERY_KEY = 'follow-ups';

/**
 * Get current user's follow-ups
 */
export function useFollowUps(filters?: FollowUpFilters) {
  return useQuery({
    queryKey: [QUERY_KEY, filters],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      let query = supabase
        .from('follow_ups_dashboard')
        .select('*')
        .eq('recruiter_id', user.id);

      // Apply filters
      if (filters?.type) {
        query = query.eq('follow_up_type', filters.type);
      }

      if (filters?.status === 'completed') {
        query = query.eq('completed', true);
      } else if (filters?.status === 'pending') {
        query = query.eq('completed', false);
      }

      if (filters?.dateRange) {
        query = query
          .gte('scheduled_date', filters.dateRange.start)
          .lte('scheduled_date', filters.dateRange.end);
      }

      query = query.order('scheduled_date', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;
      return data as FollowUpDashboard[];
    },
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Get pending follow-ups only
 */
export function usePendingFollowUps() {
  return useFollowUps({ status: 'pending' });
}

/**
 * Create a new follow-up
 */
export function useCreateFollowUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateFollowUpParams) => {
      const { data, error } = await supabase.rpc('create_follow_up', {
        p_candidate_id: params.candidate_id,
        p_follow_up_type: params.follow_up_type,
        p_scheduled_date: params.scheduled_date,
        p_notes: params.notes || null,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/**
 * Complete a follow-up
 */
export function useCompleteFollowUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (followUpId: string) => {
      const { data, error } = await supabase.rpc('complete_follow_up', {
        follow_up_uuid: followUpId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/**
 * Reschedule a follow-up
 */
export function useRescheduleFollowUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ followUpId, newDate }: { followUpId: string; newDate: string }) => {
      const { data, error } = await supabase.rpc('reschedule_follow_up', {
        follow_up_uuid: followUpId,
        new_date: newDate,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/**
 * Delete a follow-up
 */
export function useDeleteFollowUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (followUpId: string) => {
      const { error } = await supabase
        .from('follow_ups')
        .delete()
        .eq('id', followUpId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/**
 * Update follow-up notes
 */
export function useUpdateFollowUpNotes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ followUpId, notes }: { followUpId: string; notes: string }) => {
      const { data, error } = await supabase
        .from('follow_ups')
        .update({ notes, updated_at: new Date().toISOString() })
        .eq('id', followUpId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
