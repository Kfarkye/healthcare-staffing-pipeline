// ============================================================================
// src/hooks/useClinicianDashboard.api.ts
// Migrated version: uses API routes instead of direct Supabase queries.
// Drop-in replacement — same return shape as the original.
//
// To activate: rename this to useClinicianDashboard.ts
//              rename original to useClinicianDashboard.legacy.ts
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { clinicians, engagements } from '../lib/api';

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

export type TabId = 'KANBAN' | 'PROSPECTS' | 'READY' | 'SUBMITTED' | 'OFFER' | 'PRESTART' | 'SIGNED' | 'ACTIVE' | 'INACTIVE';
export type SourceType = 'PROSPECT' | 'TRANSITIONING' | 'EXTENSION_REQUEST' | 'EXTENSION_SIGNED' | string;

export interface ClinicianRow {
  // IDs
  candidate_id: string | number;
  prospect_id: string | number | null;
  engagement_id: string | number | null;
  job_id: string | number | null;
  facility_id: string | number | null;
  contract_id?: string | number | null;

  // Personal Info
  full_name: string | null;
  email: string | null;
  phone: string | null;
  nova_url: string | null;

  // Professional Info
  primary_specialty: string | null;
  engagement_specialty?: string | null;
  home_state: string | null;
  licenses: string[] | null;
  recruiter: string | null;
  available_start_date: string | null;
  profile_complete?: boolean | null;
  references_verified?: number | null;
  rto_notes?: string | null;

  // Engagement/Assignment Details
  facility_name: string | null;
  location_city: string | null;
  location_state: string | null;
  raw_status: string | null;
  stage: Stage | null;
  tab: TabId | null;
  is_current?: boolean | null;
  submitted_at: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_end_date: string | null;
  bill_rate: number | null;
  actual_margin: number | null;
  engagement_notes: string | null;
  seeking_new?: boolean | null;
  am_name: string | null;
  ac_name: string | null;
  extension_stage: string | null;
  is_active_submittal: boolean | null;
  is_weekly_priority: boolean | null;

  // Derived/Aggregated
  primary_state: PrimaryState;
  aging_bucket: AgingBucket | null;
  days_since_submitted: number | null;
  days_to_end: number | null;
  end_bucket: EndBucket | null;
  other_engagements_count: number;
  stage_rank: number | null;
  source_type: SourceType | null;
  updated_at: string | null;
}

export type ViewName = 'prospects_dashboard' | 'submittals_dashboard' | 'active_assignments_dashboard';

export type Options = {
  view: ViewName;
  q?: string;
  limit?: number;
};

export function useClinicianDashboard(opts: Options) {
  const { view, q = '', limit = 200 } = opts;
  const [rows, setRows] = useState<ClinicianRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const searchRef = useRef(q);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await clinicians.list({
        view,
        q: searchRef.current,
        limit,
      });

      setRows((result.rows as ClinicianRow[]) || []);
      setIsStale(false);
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

  // Realtime: debounced refresh on changes (still uses browser Supabase client)
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const channel = supabase
      .channel(`${view}_live`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'engagements'
      }, () => {
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

  // Promote via API route
  const promote = useCallback(async (engagementId: string, nextStage: Stage) => {
    try {
      await engagements.promote(engagementId, nextStage);
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
    isStale,
    refresh: fetchRows,
    promote,
  };
}
