/**
 * Command Center Tools
 * Server-side tool definitions for LLM actions.
 *
 * Uses the shared admin client from /api/data/_shared (same connection
 * as all /api/data/* endpoints) instead of creating a separate client.
 */

import { z } from 'zod';
import { CONFIG } from './config';
import { getAdminClient } from '@/lib/supabase/admin';

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
  client: any,
  input: { prospect_id?: number; candidate_id?: number; email?: string }
): Promise<number | null> {
  if (input.prospect_id) return input.prospect_id;
  if (input.candidate_id) {
    const { data } = await client
      .from('prospects')
      .select('id')
      .eq('candidate_id', input.candidate_id)
      .maybeSingle();
    return data?.id ?? null;
  }
  if (input.email) {
    const { data } = await client
      .from('prospects')
      .select('id')
      .ilike('email', input.email)
      .maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

export function createCommandCenterTools(supabase?: any, logger?: { info?: Function; warn?: Function; error?: Function }) {
  // Use the shared admin client (same as /api/data/* endpoints)
  // Falls back to passed-in client for backwards compatibility
  const db = supabase || getAdminClient();
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
        let query = db
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

        const { data: existing, error: lookupErr } = await db
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

          const { data: updated, error: updErr } = await db
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

        const { data, error } = await db
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
        const prospectId = await resolveProspectId(db, {
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

        const { data, error } = await db
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
          const { data: prospect, error: lookupErr } = await db
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

        const { data, error } = await db
          .from('candidate_notes')
          .insert([payload])
          .select('*')
          .single();

        if (error) return { ok: false, error: error.message };

        // Keep latest note visible in legacy UI (prospects.notes)
        await db
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
        const prospectId = await resolveProspectId(db, {
          prospect_id: args.prospect_id,
          candidate_id: args.candidate_id,
          email: args.email,
        });

        if (!prospectId) {
          return { ok: false, error: 'Candidate not found (provide candidate_id, prospect_id, or email).' };
        }

        const limit = Math.min(Number(args.limit || 10), 50);
        const { data, error } = await db
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

        const baseQuery = db
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

        const { data, error } = await db
          .from('state_board_links')
          .upsert(payload, { onConflict: 'state,profession' })
          .select('*')
          .single();

        if (error) return { ok: false, error: error.message };
        return { ok: true, entry: data };
      },
    },
  };
}
