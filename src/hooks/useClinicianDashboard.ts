// ============================================================================
// src/hooks/useClinicianDashboard.ts
// Production-ready: unified read with app-wide deduplication
// Works with: prospects_dashboard, submittals_dashboard, active_assignments_dashboard
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { retryWithBackoff, withTimeout, circuitBreaker, getCachedData, setCachedData, classifyError } from '../lib/resilience';

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

// Define these here to avoid circular imports with submittals.ts
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
  const [rows, setRows] = useState<ClinicianRow[]>(() => {
    // Initial SWR: Load from cache if possible
    const cacheKey = `dashboard_${view}_${q}_${limit}`;
    return getCachedData<ClinicianRow[]>(cacheKey) || [];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isStale, setIsStale] = useState(false);
  const searchRef = useRef(q);

  const fetchRows = useCallback(async () => {
    const cacheKey = `dashboard_${view}_${searchRef.current}_${limit}`;
    const cached = getCachedData<ClinicianRow[]>(cacheKey);

    // If we have cached data, show it immediately and refresh in background
    if (cached) {
      setRows(cached);
      setIsStale(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const data = await circuitBreaker(view, async () => {
        return await retryWithBackoff(async () => {
          // Wrapped in IIFE to create promise for withTimeout
          return await withTimeout((async () => {
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
            return (data as ClinicianRow[]) || [];
          })(), 15000); // 15s timeout
        }, { attempts: 3, baseMs: 1000 });
      }, { failureThreshold: 3, coolDownMs: 10000 });

      const finalData = (data as ClinicianRow[]) || [];
      setRows(finalData);
      setCachedData(cacheKey, finalData);
      setIsStale(false);
    } catch (err: any) {
      console.error('[useClinicianDashboard] Error:', err);
      // If we have stale data, we keep showing it but mark it as stale
      if (cached) {
        setIsStale(true);
        setError(`Refresh failed: ${err.message}. Showing last known data.`);
      } else {
        setError(err.message || 'Failed to load data');
      }
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
      // For mutations, we use a simpler circuit breaker or direct call
      // No automatic retry for mutations unless idempotent (promote is idempotent here)
      const { error: updateError } = await retryWithBackoff(async () => {
        return await supabase
          .from('engagements')
          .update({
            stage: nextStage,
            is_current: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', engagementId);
      });

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
    isStale,
    refresh: fetchRows,
    promote,
  };
}
