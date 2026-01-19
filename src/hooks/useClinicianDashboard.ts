// ============================================================================
// src/hooks/useClinicianDashboard.ts
// Production-ready: unified read with app-wide deduplication
// Works with: prospects_dashboard, submittals_dashboard, active_assignments_dashboard
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type AgingBucket =
  | 'READY'
  | 'SUBMITTED_0_2_DAYS'
  | 'SUBMITTED_3_6_DAYS'
  | 'SUBMITTED_7_PLUS_DAYS';

export type EndBucket =
  | 'ENDED_OVERDUE'
  | 'ENDS_IN_2_WEEKS'
  | 'ENDS_IN_30_DAYS'
  | 'ENDS_LATER';

export type PrimaryState = 'PROSPECTING' | 'SUBMITTED' | 'SIGNED' | 'ACTIVE' | 'INACTIVE';
export type Stage = 'SUBMITTED' | 'SIGNED' | 'ACTIVE';

export interface ClinicianRow {
  candidate_id: string;
  prospect_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  nova_url: string | null;
  primary_specialty: string | null;
  home_state: string | null;
  licenses: string[] | null;
  candidate_stage: string | null;
  prospect_status: string | null;
  available_start_date: string | null;
  profile_complete: boolean | null;
  references_verified: number | null;
  rto_notes: string | null;

  engagement_id: string | null;
  facility_name: string | null;
  engagement_specialty: string | null;
  location_city: string | null;
  location_state: string | null;
  job_id: string | null;
  raw_status: string | null;
  stage: Stage | null;
  is_current: boolean | null;
  submitted_at: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_end_date: string | null;
  bill_rate: number | null;
  actual_margin: number | null;
  recruiter: string | null;
  engagement_notes: string | null;
  seeking_new: boolean | null;
  am_name: string | null;
  ac_name: string | null;
  extension_stage: string | null;
  tab: string | null;
  is_active_submittal: boolean | null;
  is_weekly_priority: boolean | null;

  primary_state: PrimaryState;
  aging_bucket: AgingBucket | null;
  days_since_submitted: number | null;
  days_to_end: number | null;
  end_bucket: EndBucket | null;
  other_engagements_count: number;
  stage_rank: number | null;
  source_type: 'PROSPECT' | 'TRANSITIONING_CLINICIAN' | null;
  updated_at: string | null;
}

type ViewName = 'prospects_dashboard' | 'submittals_dashboard' | 'active_assignments_dashboard';

type Options = {
  view: ViewName;
  q?: string;
  limit?: number;
};

export function useClinicianDashboard(opts: Options) {
  const { view, q = '', limit = 200 } = opts;
  const [rows, setRows] = useState<ClinicianRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef(q);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Base query
      let query = supabase
        .from(view)
        .select('*')
        .limit(limit);

      // Server-side text search (fast!)
      if (searchRef.current.trim()) {
        const term = searchRef.current.trim();
        query = query.or(
          `full_name.ilike.%${term}%,facility_name.ilike.%${term}%,location_city.ilike.%${term}%,location_state.ilike.%${term}%,raw_status.ilike.%${term}%,recruiter.ilike.%${term}%,job_id.ilike.%${term}%`
        );
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      setRows((data as ClinicianRow[]) || []);
    } catch (err: any) {
      console.error('[useClinicianDashboard] Error:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [view, limit]);

  // Refetch when search changes
  useEffect(() => {
    searchRef.current = q;
    fetchRows();
  }, [q, fetchRows]);

  // Realtime: debounced refresh on changes
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const channel = supabase
      .channel(`${view}_live`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'engagements'
      }, () => {
        // Debounce: wait 1s for burst changes
        clearTimeout(timeout);
        timeout = setTimeout(fetchRows, 1000);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'candidates'
      }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(fetchRows, 1000);
      })
      .subscribe();

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [fetchRows, view]);

  // Direct promote function (no Edge Function needed)
  const promote = useCallback(async (engagementId: string, nextStage: Stage) => {
    try {
      const { error: updateError } = await supabase
        .from('engagements')
        .update({
          stage: nextStage,
          is_current: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', engagementId);

      if (updateError) throw updateError;

      // Refresh to show updated state
      fetchRows();
    } catch (err: any) {
      console.error('[useClinicianDashboard] Promote error:', err);
      throw err;
    }
  }, [fetchRows]);

  return {
    rows,
    loading,
    error,
    refresh: fetchRows,
    promote,
  };
}
