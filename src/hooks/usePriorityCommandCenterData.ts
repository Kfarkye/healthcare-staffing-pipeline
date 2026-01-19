// ============================================================================
// src/hooks/usePriorityCommandCenterData.ts
// PRODUCTION READY - Centralized data hook for Priority Command Center
// Architecture: Parallel fetching, optimistic updates, 5min cache
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES
// ============================================================================

export interface PriorityClick {
  idx: number;
  candidate_id: string;
  job_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  job_title?: string;
  facility_name?: string;
  location_city?: string;
  location_state?: string;
  specialty?: string;
  recruiter_name?: string;
  recruiter_email?: string;
  application_date?: string;
  days_since_application?: number;
  gross_weekly?: number;
  shift_type?: string;
  [key: string]: any;
}

export interface LocalCandidate {
  id: number;
  candidate_id: string;
  candidate_name: string;
  candidate_email?: string;
  candidate_phone?: string;
  home_city?: string;
  home_state?: string;
  specialty?: string;
  profession?: string;
  licenses?: string[];
  application_date?: string;
  distance_miles?: number;
  facility_name?: string;
  job_id?: string;
  gross_weekly?: number;
  [key: string]: any;
}

export interface JobOpening {
  job_id: string;
  facility_name: string | null;
  location_city?: string;
  location_state?: string;
  specialty?: string;
  profession?: string;
  shift_type?: string;
  gross_weekly?: number;
  start_date?: string;
  duration_weeks?: number;
  beds?: number;
  trauma_level?: string;
  assignment_id?: string;
  [key: string]: any;
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function usePriorityCommandCenterData() {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['priority-command-center'],
    queryFn: async () => {
      console.log('[usePriorityCommandCenterData] Fetching all data in parallel...');

      const [hotListRes, localCandidatesRes, jobOpeningsRes] = await Promise.all([
        supabase
          .from('priority_interested_clicks')
          .select('*')
          .order('application_date', { ascending: false }),

        supabase
          .from('local_candidates_view')
          .select('*')
          .order('application_date', { ascending: false }),

        supabase
          .from('job_openings')
          .select('*')
          .order('gross_weekly', { ascending: false, nullsFirst: false })
          .limit(5000)
      ]);

      if (hotListRes.error) {
        console.error('[usePriorityCommandCenterData] Hot List error:', hotListRes.error);
        throw new Error(`Failed to fetch Hot List: ${hotListRes.error.message}`);
      }

      if (localCandidatesRes.error) {
        console.error('[usePriorityCommandCenterData] Local Candidates error:', localCandidatesRes.error);
        throw new Error(`Failed to fetch Local Candidates: ${localCandidatesRes.error.message}`);
      }

      if (jobOpeningsRes.error) {
        console.error('[usePriorityCommandCenterData] Job Openings error:', jobOpeningsRes.error);
        throw new Error(`Failed to fetch Job Openings: ${jobOpeningsRes.error.message}`);
      }

      const enrichedHotList = (hotListRes.data || []).map(click => {
        let daysSince = 0;
        if (click.application_date) {
          const appDate = new Date(click.application_date);
          const today = new Date();
          daysSince = Math.floor((today.getTime() - appDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        return { ...click, days_since_application: daysSince };
      });

      console.log('[usePriorityCommandCenterData] Successfully fetched:', {
        hotList: enrichedHotList.length,
        localCandidates: localCandidatesRes.data?.length || 0,
        jobOpenings: jobOpeningsRes.data?.length || 0,
      });

      return {
        hotList: enrichedHotList as PriorityClick[],
        localCandidates: (localCandidatesRes.data || []) as LocalCandidate[],
        jobOpenings: (jobOpeningsRes.data || []) as JobOpening[],
      };
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export function useUpdatePriorityClick() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ idx, updates }: { idx: number; updates: Partial<PriorityClick> }) => {
      const { error } = await supabase
        .from('priority_interested_clicks')
        .update(updates)
        .eq('idx', idx);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['priority-command-center'] });
    },
  });
}
