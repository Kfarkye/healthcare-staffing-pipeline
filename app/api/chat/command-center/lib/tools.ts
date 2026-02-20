/**
 * Command Center Tools
 * Server-side tool definitions for LLM actions.
 */

import { z } from 'zod';
import { CONFIG } from './config';

const NOVA_SECTION_PATHS: Record<string, string> = {
  about: '/new-profile/about',
  profile: '/new-profile/about',
};

const NOVA_PAGE_PATHS: Record<string, string> = {
  search: '#/recruiting/search-all-candidates',
  search_all_candidates: '#/recruiting/search-all-candidates',
  live: '#/recruiting/live-nurses-new',
  live_list: '#/recruiting/live-nurses-new',
  livelist: '#/recruiting/live-nurses-new',
  deals: '#/recruiting/deals',
  jobs: '#/recruiting/jobs',
  margins: '#/recruiting/margins',
  contract_requests: '#/recruiting/contract-requests-new',
  contract_requests_new: '#/recruiting/contract-requests-new',
  tickets: '#/travelx/tickets',
  job_openings: '#/recruiting/job-openings/{job_id}',
  job_opening: '#/recruiting/job-openings/{job_id}',
  job: '#/recruiting/jobs/{job_id}',
};

function normalizeNovaKey(input?: string | null): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeNovaPath(path?: string | null): string {
  const raw = String(path || '').trim();
  if (!raw) return '';
  if (raw.startsWith('#')) return `/${raw}`;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function parseCandidateIdFromNovaUrl(url?: string | null): number | null {
  if (!url) return null;
  const match = url.match(/\/candidates?\/(\d+)/i);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function buildNovaUrl(candidateId: number): string {
  const base = CONFIG.nova.baseUrl;
  const path = CONFIG.nova.candidatePath;
  const suffix = CONFIG.nova.profileSuffix;
  return `${base}${path}/${candidateId}${suffix}`;
}

function normalizeStateAbbr(state?: string | null): string | null {
  if (!state) return null;
  const cleaned = String(state).trim().toUpperCase();
  return cleaned.length === 2 ? cleaned : null;
}

async function resolveProspectId(
  supabase: any,
  input: { prospect_id?: number; candidate_id?: number; email?: string }
): Promise<number | null> {
  if (input.prospect_id) return input.prospect_id;
  if (input.candidate_id) {
    const { data } = await supabase
      .from('prospects')
      .select('id')
      .eq('candidate_id', input.candidate_id)
      .maybeSingle();
    return data?.id ?? null;
  }
  if (input.email) {
    const { data } = await supabase
      .from('prospects')
      .select('id')
      .ilike('email', input.email)
      .maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

export function createCommandCenterTools(supabase: any, logger?: { info?: Function; warn?: Function; error?: Function }) {
  return {
    lookup_candidate: {
      description:
        'Find candidates/prospects by candidate_id, email, or name.',
      parameters: z.object({
        candidate_id: z.number().int().positive().optional(),
        email: z.string().email().optional(),
        name: z.string().optional(),
        limit: z.number().int().positive().max(20).optional(),
      }),
      execute: async (args: any) => {
        const limit = Math.min(Number(args.limit || 5), 20);
        let query = supabase
          .from('prospects')
          .select('id, candidate_id, name, email, phone, status, nova_url, recruiter, specialty, profession, home_state, licenses, engagement_level')
          .limit(limit);

        if (args.candidate_id) {
          query = query.eq('candidate_id', args.candidate_id);
        } else if (args.email) {
          query = query.ilike('email', String(args.email).trim());
        } else if (args.name) {
          query = query.ilike('name', `%${String(args.name).trim()}%`);
        } else {
          return { ok: false, error: 'Provide candidate_id, email, or name.' };
        }

        const { data, error } = await query;
        if (error) return { ok: false, error: error.message };
        return { ok: true, matches: data || [] };
      },
    },

    add_candidate: {
      description:
        'Add a new candidate/prospect to the system. Requires candidate_id (or nova_url) and name.',
      parameters: z
        .object({
          candidate_id: z.number().int().positive().optional(),
          nova_url: z.string().url().optional(),
          name: z.string().min(1),
          email: z.string().email().optional(),
          phone: z.string().optional(),
          profession: z.string().optional(),
          specialty: z.string().optional(),
          home_state: z.string().optional(),
          notes: z.string().optional(),
          status: z.string().optional(),
          recruiter: z.string().optional(),
          licenses: z.array(z.string()).optional(),
          facility: z.string().optional(),
          followup_stage: z.string().optional(),
          engagement_level: z.string().optional(),
          update_if_exists: z.boolean().optional(),
        })
        .refine((data) => Boolean(data.candidate_id || data.nova_url), {
          message: 'candidate_id or nova_url is required',
        }),
      execute: async (args: any) => {
        const candidateId = args.candidate_id ?? parseCandidateIdFromNovaUrl(args.nova_url);
        if (!candidateId) {
          return { ok: false, error: 'candidate_id is required (or a valid nova_url).' };
        }

        const candidateName = String(args.name || '').trim();
        if (!candidateName) {
          return { ok: false, error: 'name is required.' };
        }

        const { data: existing, error: lookupErr } = await supabase
          .from('prospects')
          .select('id, candidate_id, name, email')
          .eq('candidate_id', candidateId)
          .maybeSingle();

        if (lookupErr) {
          return { ok: false, error: lookupErr.message };
        }

        const rawNovaUrl = args.nova_url ? String(args.nova_url).trim() : null;
        const normalizedNovaUrl = rawNovaUrl && /^https?:\/\//i.test(rawNovaUrl)
          ? rawNovaUrl
          : buildNovaUrl(candidateId);

        const payload: Record<string, any> = {
          candidate_id: candidateId,
          name: candidateName,
          email: args.email ? String(args.email).toLowerCase().trim() : null,
          phone: args.phone ? String(args.phone).trim() : null,
          profession: args.profession ? String(args.profession).trim() : null,
          specialty: args.specialty ? String(args.specialty).trim() : null,
          home_state: args.home_state ? String(args.home_state).trim().toUpperCase() : null,
          notes: args.notes ? String(args.notes).trim() : null,
          status: args.status ? String(args.status).trim() : 'New',
          recruiter: args.recruiter ? String(args.recruiter).trim() : null,
          licenses: Array.isArray(args.licenses) ? args.licenses : null,
          facility: args.facility ? String(args.facility).trim() : null,
          followup_stage: args.followup_stage ? String(args.followup_stage).trim() : null,
          engagement_level: args.engagement_level ? String(args.engagement_level).trim() : null,
          nova_url: normalizedNovaUrl,
        };

        if (existing) {
          if (!args.update_if_exists) {
            return {
              ok: false,
              error: 'Candidate already exists.',
              existing,
            };
          }

          const { data: updated, error: updErr } = await supabase
            .from('prospects')
            .update(payload)
            .eq('id', existing.id)
            .select('*')
            .single();

          if (updErr) return { ok: false, error: updErr.message };

          logger?.info?.('tool_add_candidate_updated', {
            candidate_id: candidateId,
            id: updated?.id,
          });

          return { ok: true, action: 'updated', prospect: updated };
        }

        const { data, error } = await supabase
          .from('prospects')
          .insert([payload])
          .select('*')
          .single();

        if (error) {
          return { ok: false, error: error.message };
        }

        logger?.info?.('tool_add_candidate_created', {
          candidate_id: candidateId,
          id: data?.id,
        });

        return { ok: true, action: 'created', prospect: data };
      },
    },

    update_candidate: {
      description: 'Update an existing candidate/prospect by candidate_id, prospect_id, or email.',
      parameters: z.object({
        prospect_id: z.number().int().positive().optional(),
        candidate_id: z.number().int().positive().optional(),
        email: z.string().email().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
        profession: z.string().optional(),
        specialty: z.string().optional(),
        home_state: z.string().optional(),
        notes: z.string().optional(),
        status: z.string().optional(),
        recruiter: z.string().optional(),
        licenses: z.array(z.string()).optional(),
        facility: z.string().optional(),
        followup_stage: z.string().optional(),
        engagement_level: z.string().optional(),
        nova_url: z.string().url().optional(),
      }),
      execute: async (args: any) => {
        const prospectId = await resolveProspectId(supabase, {
          prospect_id: args.prospect_id,
          candidate_id: args.candidate_id,
          email: args.email,
        });

        if (!prospectId) {
          return { ok: false, error: 'Candidate not found (provide candidate_id, prospect_id, or email).' };
        }

        const updates: Record<string, any> = {
          name: args.name ? String(args.name).trim() : undefined,
          email: args.email ? String(args.email).toLowerCase().trim() : undefined,
          phone: args.phone ? String(args.phone).trim() : undefined,
          profession: args.profession ? String(args.profession).trim() : undefined,
          specialty: args.specialty ? String(args.specialty).trim() : undefined,
          home_state: args.home_state ? String(args.home_state).trim().toUpperCase() : undefined,
          notes: args.notes ? String(args.notes).trim() : undefined,
          status: args.status ? String(args.status).trim() : undefined,
          recruiter: args.recruiter ? String(args.recruiter).trim() : undefined,
          licenses: Array.isArray(args.licenses) ? args.licenses : undefined,
          facility: args.facility ? String(args.facility).trim() : undefined,
          followup_stage: args.followup_stage ? String(args.followup_stage).trim() : undefined,
          engagement_level: args.engagement_level ? String(args.engagement_level).trim() : undefined,
          nova_url: args.nova_url ? String(args.nova_url).trim() : undefined,
        };

        const cleaned = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(cleaned).length === 0) {
          return { ok: false, error: 'No update fields provided.' };
        }

        const { data, error } = await supabase
          .from('prospects')
          .update(cleaned)
          .eq('id', prospectId)
          .select('*')
          .single();

        if (error) return { ok: false, error: error.message };

        logger?.info?.('tool_update_candidate', { prospect_id: prospectId });
        return { ok: true, prospect: data };
      },
    },

    add_candidate_note: {
      description:
        'Create a note for a candidate/prospect. Requires prospect_id or candidate_id and note content.',
      parameters: z.object({
        prospect_id: z.number().int().positive().optional(),
        candidate_id: z.number().int().positive().optional(),
        note_type: z.string().optional(),
        content: z.string().min(1),
        author_id: z.string().uuid().optional(),
      }),
      execute: async (args: any) => {
        let prospectId = args.prospect_id as number | undefined;
        const candidateId = args.candidate_id as number | undefined;

        if (!prospectId && !candidateId) {
          return { ok: false, error: 'prospect_id or candidate_id is required.' };
        }

        if (!prospectId && candidateId) {
          const { data: prospect, error: lookupErr } = await supabase
            .from('prospects')
            .select('id, candidate_id, name')
            .eq('candidate_id', candidateId)
            .maybeSingle();

          if (lookupErr) return { ok: false, error: lookupErr.message };
          if (!prospect) return { ok: false, error: 'Candidate not found.' };
          prospectId = prospect.id;
        }

        const payload = {
          prospect_id: prospectId,
          author_id: args.author_id ?? null,
          note_type: args.note_type ? String(args.note_type).trim() : 'general',
          content: String(args.content).trim(),
        };

        const { data, error } = await supabase
          .from('candidate_notes')
          .insert([payload])
          .select('*')
          .single();

        if (error) return { ok: false, error: error.message };

        // Keep latest note visible in legacy UI (prospects.notes)
        await supabase
          .from('prospects')
          .update({ notes: payload.content })
          .eq('id', prospectId);

        logger?.info?.('tool_add_candidate_note', {
          prospect_id: prospectId,
          note_id: data?.id,
        });

        return { ok: true, note: data, prospect_id: prospectId };
      },
    },

    get_candidate_notes: {
      description: 'Fetch recent notes for a candidate/prospect.',
      parameters: z.object({
        prospect_id: z.number().int().positive().optional(),
        candidate_id: z.number().int().positive().optional(),
        email: z.string().email().optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async (args: any) => {
        const prospectId = await resolveProspectId(supabase, {
          prospect_id: args.prospect_id,
          candidate_id: args.candidate_id,
          email: args.email,
        });

        if (!prospectId) {
          return { ok: false, error: 'Candidate not found (provide candidate_id, prospect_id, or email).' };
        }

        const limit = Math.min(Number(args.limit || 10), 50);
        const { data, error } = await supabase
          .from('candidate_notes')
          .select('id, prospect_id, author_id, note_type, content, created_at')
          .eq('prospect_id', prospectId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) return { ok: false, error: error.message };
        return { ok: true, prospect_id: prospectId, notes: data || [] };
      },
    },

    get_nova_link: {
      description:
        'Build a Nova link. Supports candidate profile links, global pages, and optional custom_path.',
      parameters: z.object({
        candidate_id: z.number().int().positive().optional(),
        nova_url: z.string().url().optional(),
        section: z.string().optional(),
        page: z.string().optional(),
        custom_path: z.string().optional(),
        job_id: z.union([z.string(), z.number()]).optional(),
      }),
      execute: async (args: any) => {
        const candidateId = args.candidate_id ?? parseCandidateIdFromNovaUrl(args.nova_url);
        const sectionKey = normalizeNovaKey(args.section);
        const pageKey = normalizeNovaKey(args.page);

        // If candidate info is present, build candidate-scoped link.
        if (candidateId) {
          let path = '';
          if (args.custom_path) {
            path = normalizeNovaPath(args.custom_path);
          } else if (sectionKey) {
            path = NOVA_SECTION_PATHS[sectionKey] || '';
          }

          const base = `${CONFIG.nova.baseUrl}${CONFIG.nova.candidatePath}/${candidateId}`;
          const link = path ? `${base}${path}` : `${base}${CONFIG.nova.profileSuffix}`;

          return {
            ok: true,
            link,
            section: sectionKey || 'about',
            candidate_id: candidateId,
          };
        }

        // Otherwise, build a global Nova page link.
        let pagePath = '';
        if (args.custom_path) {
          pagePath = normalizeNovaPath(args.custom_path);
        } else if (pageKey) {
          pagePath = NOVA_PAGE_PATHS[pageKey] || '';
          if (pagePath && pagePath.includes('{job_id}')) {
            const jobId = args.job_id ? String(args.job_id).trim() : '';
            if (jobId) pagePath = pagePath.replace('{job_id}', jobId);
          }
        }

        if (!pagePath) {
          return {
            ok: false,
            error:
              'Provide candidate_id/nova_url for candidate links, or page/custom_path for global links.',
          };
        }

        const link = `${CONFIG.nova.baseUrl}${pagePath}`;
        return {
          ok: true,
          link,
          page: pageKey || 'custom',
        };
      },
    },

    get_state_board_link: {
      description: 'Return the state board verification link for a given state (and optional profession).',
      parameters: z.object({
        state: z.string().min(2),
        profession: z.string().optional(),
      }),
      execute: async (args: any) => {
        const state = normalizeStateAbbr(args.state);
        if (!state) return { ok: false, error: 'State must be a 2-letter code.' };

        const profession = args.profession ? String(args.profession).trim() : 'all';

        const baseQuery = supabase
          .from('state_board_links')
          .select('id, state, profession, url, notes, source')
          .eq('state', state);

        const { data: exact, error: exactErr } = await baseQuery
          .eq('profession', profession)
          .limit(1)
          .maybeSingle();

        if (exactErr) return { ok: false, error: exactErr.message };
        if (exact) return { ok: true, link: exact.url, data: exact };

        // Fallback to state-wide "all" entry
        const { data, error } = await baseQuery.eq('profession', 'all').limit(1).maybeSingle();
        if (error) return { ok: false, error: error.message };
        if (!data) {
          return { ok: false, error: 'No state board link found.' };
        }

        return { ok: true, link: data.url, data };
      },
    },

    upsert_state_board_link: {
      description: 'Create or update a state board verification link.',
      parameters: z.object({
        state: z.string().min(2),
        profession: z.string().optional(),
        url: z.string().url(),
        notes: z.string().optional(),
        source: z.string().optional(),
      }),
      execute: async (args: any) => {
        const state = normalizeStateAbbr(args.state);
        if (!state) return { ok: false, error: 'State must be a 2-letter code.' };

        const payload = {
          state,
          profession: args.profession ? String(args.profession).trim() : 'all',
          url: String(args.url).trim(),
          notes: args.notes ? String(args.notes).trim() : null,
          source: args.source ? String(args.source).trim() : null,
        };

        const { data, error } = await supabase
          .from('state_board_links')
          .upsert(payload, { onConflict: 'state,profession' })
          .select('*')
          .single();

        if (error) return { ok: false, error: error.message };
        return { ok: true, entry: data };
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // Weissach Pipeline Query Tools (read-only)
    // ═══════════════════════════════════════════════════════════════════════════

    weissach_get_candidate: {
      description:
        'Get a detailed candidate profile including assignments, notes, certifications, and DNA. Search by candidate_id or name.',
      parameters: z.object({
        candidate_id: z.number().int().positive().optional(),
        name: z.string().optional(),
      }),
      execute: async (args: any) => {
        if (!args.candidate_id && !args.name) {
          return { ok: false, error: 'Provide candidate_id or name.' };
        }

        try {
          let query = supabase
            .from('prospects')
            .select(`
              id, candidate_id, name, email, phone, specialty, profession,
              recruiter, status, home_state, licenses, nova_url,
              target_gross, target_take_home, is_diamond_verified, rto_requested,
              available_start_date, profile_complete, references_verified,
              engagement_level, facility, created_at, updated_at,
              engagements(id, status, start_date, end_date, facility_name, specialty, bill_rate, actual_margin, extension_stage, is_looking_for_new_facility, is_exiting),
              candidate_notes(id, note_type, content, created_at)
            `);

          if (args.candidate_id) {
            query = query.eq('candidate_id', args.candidate_id);
          } else {
            query = query.ilike('name', `%${String(args.name).trim()}%`);
          }

          const { data, error } = await query.limit(10);

          if (error) {
            return { ok: false, error: 'Database query failed', detail: error.message };
          }

          if (!data || data.length === 0) {
            return {
              ok: false,
              error: args.candidate_id
                ? `No candidate found with candidate_id ${args.candidate_id}`
                : `No candidate found matching "${args.name}"`,
            };
          }

          // Multiple matches → disambiguation
          if (data.length > 1) {
            return {
              ok: true,
              multiple: true,
              matches: data.map((c: any) => ({
                candidate_id: c.candidate_id,
                name: c.name,
                specialty: c.specialty,
                status: c.status,
                home_state: c.home_state,
                recruiter: c.recruiter,
              })),
              message: `Multiple candidates match "${args.name}". Be more specific or use candidate_id.`,
            };
          }

          // Single match — enrich with certifications and DNA (separate FK path via candidate_id)
          const candidate = data[0];

          const [certsResult, dnaResult] = await Promise.all([
            supabase
              .from('certifications')
              .select('id, cert_name, hspa_id, issued_at, expires_at, is_verified, verification_url')
              .eq('candidate_id', candidate.candidate_id),
            supabase
              .from('candidate_dna')
              .select('*')
              .eq('candidate_id', candidate.candidate_id)
              .maybeSingle(),
          ]);

          return {
            ok: true,
            candidate: {
              ...candidate,
              engagements: candidate.engagements || [],
              candidate_notes: candidate.candidate_notes || [],
            },
            certifications: certsResult.data || [],
            dna: dnaResult.data || null,
          };
        } catch (err: any) {
          return { ok: false, error: 'Database query failed', detail: err?.message || String(err) };
        }
      },
    },

    weissach_search_candidates: {
      description:
        'Search candidates with filters. At least one filter is required. Specialty searches both specialty and profession columns.',
      parameters: z.object({
        specialty: z.string().optional(),
        status: z.string().optional(),
        home_state: z.string().optional(),
        recruiter: z.string().optional(),
        profession: z.string().optional(),
        available: z.boolean().optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async (args: any) => {
        const hasFilter =
          args.specialty || args.status || args.home_state ||
          args.recruiter || args.profession || args.available !== undefined;

        if (!hasFilter) {
          return {
            ok: false,
            error: 'Provide at least one search filter (specialty, status, home_state, recruiter, profession, or available).',
          };
        }

        try {
          const limit = Math.min(Number(args.limit || 20), 50);
          const filters: string[] = [];

          let query = supabase
            .from('prospects')
            .select(
              'id, candidate_id, name, email, phone, specialty, profession, recruiter, status, home_state, licenses, nova_url, engagement_level, available_start_date',
              { count: 'exact' },
            );

          if (args.status) {
            query = query.ilike('status', String(args.status).trim());
            filters.push(`status=${args.status}`);
          }
          if (args.home_state) {
            query = query.ilike('home_state', String(args.home_state).trim());
            filters.push(`home_state=${args.home_state}`);
          }
          if (args.recruiter) {
            query = query.ilike('recruiter', `%${String(args.recruiter).trim()}%`);
            filters.push(`recruiter~=${args.recruiter}`);
          }
          if (args.specialty) {
            // Search BOTH specialty and profession with OR so "RRT" matches either column
            const term = String(args.specialty).trim();
            query = query.or(`specialty.ilike.%${term}%,profession.ilike.%${term}%`);
            filters.push(`specialty/profession~=${term}`);
          }
          if (args.profession && !args.specialty) {
            // Standalone profession filter only when specialty wasn't already searching both
            query = query.ilike('profession', `%${String(args.profession).trim()}%`);
            filters.push(`profession~=${args.profession}`);
          }
          if (args.available === true) {
            query = query.not('available_start_date', 'is', null);
            filters.push('has_available_date');
          }

          const { data, error, count } = await query
            .order('updated_at', { ascending: false })
            .limit(limit);

          if (error) {
            return { ok: false, error: 'Database query failed', detail: error.message };
          }

          return {
            ok: true,
            results: data || [],
            total_matched: count ?? (data || []).length,
            query_summary: `Searched with filters: ${filters.join(', ')}`,
          };
        } catch (err: any) {
          return { ok: false, error: 'Database query failed', detail: err?.message || String(err) };
        }
      },
    },

    weissach_get_facility: {
      description:
        'Get facility details including jobs and active assignments. Search by facility_id or name.',
      parameters: z.object({
        facility_id: z.number().int().positive().optional(),
        name: z.string().optional(),
      }),
      execute: async (args: any) => {
        if (!args.facility_id && !args.name) {
          return { ok: false, error: 'Provide facility_id or name.' };
        }

        try {
          let query = supabase
            .from('facilities')
            .select(`
              id, name, city, state, created_at, updated_at,
              jobs(id, job_id, specialty, shift, hours_per_week, start_date, duration_weeks)
            `);

          if (args.facility_id) {
            query = query.eq('id', args.facility_id);
          } else {
            query = query.ilike('name', `%${String(args.name).trim()}%`);
          }

          const { data, error } = await query.limit(10);

          if (error) {
            return { ok: false, error: 'Database query failed', detail: error.message };
          }

          if (!data || data.length === 0) {
            return {
              ok: false,
              error: args.facility_id
                ? `No facility found with id ${args.facility_id}`
                : `No facility found matching "${args.name}"`,
            };
          }

          // Multiple matches → disambiguation
          if (data.length > 1) {
            return {
              ok: true,
              multiple: true,
              matches: data.map((f: any) => ({
                id: f.id,
                name: f.name,
                city: f.city,
                state: f.state,
              })),
              message: `Multiple facilities match "${args.name}". Be more specific or use facility_id.`,
            };
          }

          const facility = data[0];

          // Get active engagements at this facility (matched by facility_name text)
          const { data: engagements } = await supabase
            .from('engagements')
            .select(
              'id, prospect_id, status, start_date, end_date, specialty, bill_rate, actual_margin, extension_stage, prospects(candidate_id, name)',
            )
            .ilike('facility_name', `%${facility.name}%`)
            .in('status', [
              'Active', 'ACTIVE', 'Pre-Start (New)', 'Pre-Start (Extension)',
              'Submitted', 'Offer Extended', 'Signed',
            ]);

          return {
            ok: true,
            facility: {
              ...facility,
              jobs: facility.jobs || [],
            },
            active_engagements: engagements || [],
          };
        } catch (err: any) {
          return { ok: false, error: 'Database query failed', detail: err?.message || String(err) };
        }
      },
    },

    weissach_get_active_pipeline: {
      description:
        'Get active pipeline overview: submittals in progress and assignments ending soon.',
      parameters: z.object({
        recruiter: z.string().optional(),
        days_ahead: z.number().int().positive().max(90).optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async (args: any) => {
        try {
          const limit = Math.min(Number(args.limit || 25), 50);
          const daysAhead = Math.min(Number(args.days_ahead || 30), 90);
          const now = new Date();
          const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
          const nowISO = now.toISOString().split('T')[0];
          const cutoffISO = cutoff.toISOString().split('T')[0];

          // Active submittals: prospects in submittal-related statuses
          let submittalQuery = supabase
            .from('prospects')
            .select('id, candidate_id, name, specialty, profession, status, recruiter, home_state, facility, updated_at')
            .in('status', ['Submitted', 'Submittal Ready', 'Interested', 'Profile Updates'])
            .order('updated_at', { ascending: false })
            .limit(limit);

          if (args.recruiter) {
            submittalQuery = submittalQuery.ilike('recruiter', `%${String(args.recruiter).trim()}%`);
          }

          // Ending assignments: active engagements with end_date within the window
          let endingQuery = supabase
            .from('engagements')
            .select(
              'id, prospect_id, status, start_date, end_date, facility_name, specialty, bill_rate, actual_margin, extension_stage, is_looking_for_new_facility, is_exiting, prospects(candidate_id, name, recruiter)',
            )
            .in('status', ['Active', 'ACTIVE'])
            .lte('end_date', cutoffISO)
            .gte('end_date', nowISO)
            .order('end_date', { ascending: true })
            .limit(limit);

          const [submittalResult, endingResult] = await Promise.all([
            submittalQuery,
            endingQuery,
          ]);

          if (submittalResult.error) {
            return { ok: false, error: 'Database query failed', detail: submittalResult.error.message };
          }
          if (endingResult.error) {
            return { ok: false, error: 'Database query failed', detail: endingResult.error.message };
          }

          return {
            ok: true,
            active_submittals: submittalResult.data || [],
            ending_assignments: endingResult.data || [],
            summary: {
              total_submittals: (submittalResult.data || []).length,
              total_ending: (endingResult.data || []).length,
              window_days: daysAhead,
              as_of: nowISO,
            },
          };
        } catch (err: any) {
          return { ok: false, error: 'Database query failed', detail: err?.message || String(err) };
        }
      },
    },

    weissach_check_compliance: {
      description:
        'Check compliance status: expiring certifications and license gaps. Optionally scope to a specific candidate.',
      parameters: z.object({
        candidate_id: z.number().int().positive().optional(),
        name: z.string().optional(),
        days_ahead: z.number().int().positive().max(90).optional(),
      }),
      execute: async (args: any) => {
        try {
          const daysAhead = Math.min(Number(args.days_ahead || 30), 90);
          const now = new Date();
          const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
          const nowISO = now.toISOString().split('T')[0];
          const cutoffISO = cutoff.toISOString().split('T')[0];

          // Scoped to a specific candidate
          if (args.candidate_id || args.name) {
            let prospectQuery = supabase
              .from('prospects')
              .select('id, candidate_id, name, licenses, specialty, profession, home_state');

            if (args.candidate_id) {
              prospectQuery = prospectQuery.eq('candidate_id', args.candidate_id);
            } else {
              prospectQuery = prospectQuery.ilike('name', `%${String(args.name).trim()}%`);
            }

            const { data: prospects, error: pErr } = await prospectQuery.limit(10);

            if (pErr) {
              return { ok: false, error: 'Database query failed', detail: pErr.message };
            }
            if (!prospects || prospects.length === 0) {
              return {
                ok: false,
                error: args.candidate_id
                  ? `No candidate found with candidate_id ${args.candidate_id}`
                  : `No candidate found matching "${args.name}"`,
              };
            }

            // Multiple matches → disambiguation
            if (prospects.length > 1) {
              return {
                ok: true,
                multiple: true,
                matches: prospects.map((c: any) => ({
                  candidate_id: c.candidate_id,
                  name: c.name,
                  specialty: c.specialty,
                })),
                message: 'Multiple candidates match. Be more specific or use candidate_id.',
              };
            }

            const candidate = prospects[0];

            const { data: certs, error: cErr } = await supabase
              .from('certifications')
              .select('id, cert_name, issued_at, expires_at, is_verified')
              .eq('candidate_id', candidate.candidate_id)
              .order('expires_at', { ascending: true });

            if (cErr) {
              return { ok: false, error: 'Database query failed', detail: cErr.message };
            }

            const allCerts = certs || [];
            const expiringSoon = allCerts.filter(
              (c: any) => c.expires_at && c.expires_at >= nowISO && c.expires_at <= cutoffISO,
            );
            const alreadyExpired = allCerts.filter(
              (c: any) => c.expires_at && c.expires_at < nowISO,
            );

            return {
              ok: true,
              candidate: {
                candidate_id: candidate.candidate_id,
                name: candidate.name,
                licenses: candidate.licenses || [],
                home_state: candidate.home_state,
              },
              certifications: allCerts,
              expiring_within_window: expiringSoon,
              already_expired: alreadyExpired,
              compliance_summary: {
                total_certs: allCerts.length,
                expiring_soon: expiringSoon.length,
                expired: alreadyExpired.length,
                window_days: daysAhead,
                checked_at: nowISO,
              },
            };
          }

          // Board-wide compliance scan (no candidate specified)
          const { data: expiring, error } = await supabase
            .from('certifications')
            .select('id, candidate_id, cert_name, expires_at, is_verified')
            .not('expires_at', 'is', null)
            .lte('expires_at', cutoffISO)
            .gte('expires_at', nowISO)
            .order('expires_at', { ascending: true })
            .limit(50);

          if (error) {
            return { ok: false, error: 'Database query failed', detail: error.message };
          }

          return {
            ok: true,
            expiring_certifications: expiring || [],
            compliance_summary: {
              total_expiring: (expiring || []).length,
              window_days: daysAhead,
              checked_at: nowISO,
            },
          };
        } catch (err: any) {
          return { ok: false, error: 'Database query failed', detail: err?.message || String(err) };
        }
      },
    },

    weissach_get_engagement: {
      description:
        'Get assignment/engagement details by engagement_id or candidate_id, with related prospect and job info.',
      parameters: z.object({
        engagement_id: z.number().int().positive().optional(),
        candidate_id: z.number().int().positive().optional(),
        status: z.string().optional(),
      }),
      execute: async (args: any) => {
        if (!args.engagement_id && !args.candidate_id) {
          return { ok: false, error: 'Provide engagement_id or candidate_id.' };
        }

        try {
          let query = supabase
            .from('engagements')
            .select(`
              id, prospect_id, status, start_date, end_date, facility_name,
              specialty, bill_rate, actual_margin, notes, extension_stage,
              is_looking_for_new_facility, is_exiting, created_at, updated_at,
              prospects(candidate_id, name, email, phone, recruiter, home_state, nova_url),
              jobs(id, job_id, specialty, shift, hours_per_week, start_date, duration_weeks, facilities(name, city, state))
            `);

          if (args.engagement_id) {
            query = query.eq('id', args.engagement_id);
          } else {
            // Resolve prospect_id from candidate_id
            const { data: prospect } = await supabase
              .from('prospects')
              .select('id')
              .eq('candidate_id', args.candidate_id)
              .maybeSingle();

            if (!prospect) {
              return { ok: false, error: `No candidate found with candidate_id ${args.candidate_id}` };
            }
            query = query.eq('prospect_id', prospect.id);
          }

          if (args.status) {
            query = query.ilike('status', String(args.status).trim());
          }

          const { data, error } = await query
            .order('start_date', { ascending: false })
            .limit(10);

          if (error) {
            return { ok: false, error: 'Database query failed', detail: error.message };
          }

          if (!data || data.length === 0) {
            return {
              ok: false,
              error: args.engagement_id
                ? `No engagement found with id ${args.engagement_id}`
                : `No engagements found for candidate_id ${args.candidate_id}${args.status ? ` with status "${args.status}"` : ''}`,
            };
          }

          return {
            ok: true,
            engagements: data.map((e: any) => ({
              ...e,
              prospects: e.prospects || null,
              jobs: e.jobs || null,
            })),
            total: data.length,
          };
        } catch (err: any) {
          return { ok: false, error: 'Database query failed', detail: err?.message || String(err) };
        }
      },
    },

    weissach_search_jobs: {
      description:
        'Search open job positions by specialty, state, or facility name. At least one filter is required.',
      parameters: z.object({
        specialty: z.string().optional(),
        state: z.string().optional(),
        facility_name: z.string().optional(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      execute: async (args: any) => {
        const hasFilter = args.specialty || args.state || args.facility_name;
        if (!hasFilter) {
          return {
            ok: false,
            error: 'Provide at least one search filter (specialty, state, or facility_name).',
          };
        }

        try {
          const limit = Math.min(Number(args.limit || 20), 50);
          const filters: string[] = [];

          let query = supabase
            .from('jobs')
            .select(
              'id, job_id, specialty, shift, hours_per_week, start_date, duration_weeks, created_at, updated_at, facilities(id, name, city, state)',
              { count: 'exact' },
            );

          if (args.specialty) {
            query = query.ilike('specialty', `%${String(args.specialty).trim()}%`);
            filters.push(`specialty~=${args.specialty}`);
          }

          // State and facility_name filter via the facilities table
          if (args.state || args.facility_name) {
            let facilityQuery = supabase.from('facilities').select('id');
            if (args.state) {
              facilityQuery = facilityQuery.ilike('state', String(args.state).trim());
              filters.push(`state=${args.state}`);
            }
            if (args.facility_name) {
              facilityQuery = facilityQuery.ilike('name', `%${String(args.facility_name).trim()}%`);
              filters.push(`facility~=${args.facility_name}`);
            }

            const { data: facilities, error: fErr } = await facilityQuery;
            if (fErr) {
              return { ok: false, error: 'Database query failed', detail: fErr.message };
            }

            const facilityIds = (facilities || []).map((f: any) => f.id);
            if (facilityIds.length === 0) {
              return {
                ok: true,
                results: [],
                total_matched: 0,
                query_summary: `No facilities match the filter: ${filters.join(', ')}`,
              };
            }
            query = query.in('facility_id', facilityIds);
          }

          const { data, error, count } = await query
            .order('start_date', { ascending: false })
            .limit(limit);

          if (error) {
            return { ok: false, error: 'Database query failed', detail: error.message };
          }

          return {
            ok: true,
            results: (data || []).map((j: any) => ({
              ...j,
              facilities: j.facilities || null,
            })),
            total_matched: count ?? (data || []).length,
            query_summary: `Jobs matching: ${filters.join(', ')}`,
          };
        } catch (err: any) {
          return { ok: false, error: 'Database query failed', detail: err?.message || String(err) };
        }
      },
    },
  };
}
