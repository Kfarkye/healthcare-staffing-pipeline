// ============================================================================
// src/hooks/useEngagementsDashboard.ts
// Production-ready: unified read (engagements_dashboard) + realtime + paging
// Deps: supabase client at ../lib/supabase
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

export type AgingBucket =
  | 'READY'
  | 'SUBMITTED_0_2_DAYS'
  | 'SUBMITTED_3_6_DAYS'
  | 'SUBMITTED_7_PLUS_DAYS';

export type Stage = 'SUBMITTED' | 'SIGNED' | 'ACTIVE';

export interface EngagementRow {
  engagement_id: string;
  candidate_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  nova_url: string | null;
  primary_specialty: string | null;
  home_state: string | null;
  licenses: string[] | null;
  job_id: string | null;
  facility_name: string | null;
  specialty: string | null;
  location_city: string | null;
  location_state: string | null;
  raw_status: string | null;
  stage: Stage | null;
  is_current: boolean | null;
  submitted_at: string | null;
  recruiter: string | null;
  notes: string | null;
  seeking_new: boolean | null;
  updated_at: string | null;
  days_since_submitted: number | null;
  aging_bucket: AgingBucket;
  stage_rank: number | null;
  source_type?: 'PROSPECT' | 'TRANSITIONING_CLINICIAN' | null;
}

type Options = {
  q?: string;                    // free text search
  bucket?: AgingBucket | 'ALL';  // column filter
  pageSize?: number;             // default 50
};

export function useEngagementsDashboard(opts: Options = {}) {
  const { q = '', bucket = 'ALL', pageSize = 50 } = opts;
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const searchRef = useRef(q);

  const fetchPage = useCallback(async (reset = false) => {
    setLoading(true);
    setError(null);

    const from = reset ? 0 : page * pageSize;
    const to = from + pageSize - 1;

    // Base query
    let query = supabase
      .from('engagements_dashboard')
      .select('*', { count: 'exact' })
      .order('stage_rank', { ascending: false })
      .order('submitted_at', { ascending: true, nullsFirst: true })
      .range(from, to);

    // Filter by aging bucket if set
    if (bucket !== 'ALL') {
      query = query.eq('aging_bucket', bucket);
    }

    // Client-side text filter after fetch (fast + keeps index simple)
    const { data, error, count } = await query;
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    let next = (data as EngagementRow[]) ?? [];
    const term = searchRef.current.trim().toLowerCase();
    if (term) {
      next = next.filter((r) =>
        [
          r.full_name,
          r.facility_name,
          r.specialty,
          r.location_city,
          r.location_state,
          r.raw_status,
          r.recruiter,
          r.job_id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(term)
      );
    }

    setRows((prev) => (reset ? next : [...prev, ...next]));
    const total = count ?? next.length;
    setHasMore(to + 1 < total);
    setLoading(false);
  }, [bucket, page, pageSize]);

  // Reset pagination when filters/search change
  useEffect(() => {
    searchRef.current = q;
    setPage(0);
    fetchPage(true);
  }, [q, bucket, fetchPage]);

  // Load additional pages on demand
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    setPage((p) => p + 1);
  }, [loading, hasMore]);

  useEffect(() => {
    if (page === 0) return;
    fetchPage(false);
  }, [page, fetchPage]);

  // Realtime: refresh on INSERT/UPDATE/DELETE to base tables
  useEffect(() => {
    const channel = supabase
      .channel('engagements_dashboard_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'engagements' }, () => {
        // Soft refresh first page only; keeps UX snappy
        fetchPage(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPage]);

  return {
    rows,
    loading,
    error,
    hasMore,
    loadMore,
    refresh: () => fetchPage(true),
  };
}
