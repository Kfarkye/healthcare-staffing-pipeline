/**
 * Command Center Tools
 * Server-side tool definitions for LLM actions.
 *
 * Legacy tools query the "prospects" schema.
 * Weissach tools (prefixed weissach_*) query the Weissach pipeline schema
 * (candidates, facilities, jobs, licenses, certifications,
 *  submittals, assignments, pay_packages, contact_log, notes).
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

    // ══════════════════════════════════════════════════════════════════════════
    // WEISSACH PIPELINE TOOLS
    // Query the Weissach pipeline tables. All tools prefixed weissach_*.
    // ══════════════════════════════════════════════════════════════════════════

    weissach_get_candidate: {
      description:
        'Get a full Weissach candidate profile with licenses, certifications, assignments, active submittals, notes, and recent contact log. Use for detailed clinical lookups.',
      parameters: z.object({
        name: z.string().optional(),
        candidate_id: z.string().uuid().optional(),
      }),
      execute: async (args: any) => {
        try {
          // 1. Find candidate
          let candidateQuery = supabase
            .from('candidates')
            .select('*')
            .limit(1);

          if (args.candidate_id) {
            candidateQuery = candidateQuery.eq('id', args.candidate_id);
          } else if (args.name) {
            candidateQuery = candidateQuery.ilike('name', `%${String(args.name).trim()}%`);
          } else {
            return { ok: false, error: 'Provide name or candidate_id.' };
          }

          const { data: candidate, error: candErr } = await candidateQuery.maybeSingle();
          if (candErr) return { ok: false, error: candErr.message };
          if (!candidate) return { ok: false, error: 'Candidate not found in Weissach pipeline.' };

          const cid = candidate.id;

          // 2. Parallel joins
          const [licensesRes, certsRes, assignmentsRes, submittalsRes, notesRes, contactRes] = await Promise.all([
            supabase.from('licenses').select('*').eq('candidate_id', cid).order('expiration_date', { ascending: true }),
            supabase.from('certifications').select('*').eq('candidate_id', cid).order('expiration_date', { ascending: true }),
            supabase.from('assignments').select('*, facilities(name, city, state)').eq('candidate_id', cid).order('start_date', { ascending: false }),
            supabase.from('submittals').select('*, jobs(title, specialty, shift, start_date), facilities(name, city, state)').eq('candidate_id', cid).in('status', ['submitted', 'under_review', 'interview_scheduled', 'offer_pending', 'offer_extended']).order('submitted_at', { ascending: false }),
            supabase.from('notes').select('*').eq('candidate_id', cid).order('created_at', { ascending: false }).limit(20),
            supabase.from('contact_log').select('*').eq('candidate_id', cid).order('created_at', { ascending: false }).limit(5),
          ]);

          // 3. Surface red flags at top level
          const notes = notesRes.data || [];
          const redFlags = notes
            .filter((n: any) => n.note_type === 'red_flag')
            .map((n: any) => n.content);

          const result = {
            ok: true as const,
            candidate,
            licenses: licensesRes.data || [],
            certifications: certsRes.data || [],
            assignments: assignmentsRes.data || [],
            submittals: submittalsRes.data || [],
            notes,
            red_flags: redFlags,
            contact_log: contactRes.data || [],
          };

          // Output validation
          const outputParse = WeissachCandidateProfileOutput.safeParse(result);
          if (!outputParse.success) {
            logger?.warn?.('weissach_get_candidate_output_validation', {
              errors: outputParse.error.flatten().fieldErrors,
            });
          }

          logger?.info?.('weissach_get_candidate', { candidate_id: cid, name: candidate.name });
          return result;
        } catch (err: any) {
          return { ok: false, error: err.message || 'Failed to fetch candidate profile.' };
        }
      },
    },

    weissach_search_candidates: {
      description:
        'Search Weissach candidates by specialty, license state, availability, certification, or compact license status. Returns matched candidates ranked by soonest available.',
      parameters: z.object({
        specialty: z.string().optional(),
        license_state: z.string().optional(),
        available_before: z.string().optional(),
        certification: z.string().optional(),
        has_compact: z.boolean().optional(),
      }),
      execute: async (args: any) => {
        try {
          const filters: string[] = [];

          // Start with candidates
          let query = supabase
            .from('candidates')
            .select('id, name, specialty, sub_specialty, years_experience, available_date, home_state, preferred_locations, status, recruiter');

          if (args.specialty) {
            const term = `%${String(args.specialty).trim()}%`;
            query = query.or(`specialty.ilike.${term},sub_specialty.ilike.${term}`);
            filters.push(`specialty≈${args.specialty}`);
          }

          if (args.available_before) {
            query = query.lte('available_date', String(args.available_before).trim());
            filters.push(`available≤${args.available_before}`);
          }

          query = query.eq('status', 'active')
            .order('available_date', { ascending: true })
            .limit(20);

          const { data: candidates, error: candErr } = await query;
          if (candErr) return { ok: false, error: candErr.message };
          if (!candidates?.length) return { ok: true, matches: [], filters };

          // Enrich each candidate with license/cert data
          const candidateIds = candidates.map((c: any) => c.id);

          const [licensesRes, certsRes, notesRes] = await Promise.all([
            supabase.from('licenses').select('candidate_id, state, is_compact, status').in('candidate_id', candidateIds),
            supabase.from('certifications').select('candidate_id, name, status').in('candidate_id', candidateIds).eq('status', 'active'),
            supabase.from('notes').select('candidate_id, content').in('candidate_id', candidateIds).eq('note_type', 'red_flag'),
          ]);

          const licenseMap = new Map<string, any[]>();
          for (const lic of (licensesRes.data || [])) {
            const arr = licenseMap.get(lic.candidate_id) || [];
            arr.push(lic);
            licenseMap.set(lic.candidate_id, arr);
          }

          const certMap = new Map<string, string[]>();
          for (const cert of (certsRes.data || [])) {
            const arr = certMap.get(cert.candidate_id) || [];
            arr.push(cert.name);
            certMap.set(cert.candidate_id, arr);
          }

          const flagMap = new Map<string, string[]>();
          for (const note of (notesRes.data || [])) {
            const arr = flagMap.get(note.candidate_id) || [];
            arr.push(note.content);
            flagMap.set(note.candidate_id, arr);
          }

          let results = candidates.map((c: any) => {
            const lics = licenseMap.get(c.id) || [];
            return {
              ...c,
              license_states: lics.filter((l: any) => l.status === 'active').map((l: any) => l.state),
              has_compact: lics.some((l: any) => l.is_compact),
              active_certifications: certMap.get(c.id) || [],
              red_flags: flagMap.get(c.id) || [],
            };
          });

          // Post-filter for license_state
          if (args.license_state) {
            const st = String(args.license_state).trim().toUpperCase();
            results = results.filter((c: any) => c.license_states.includes(st));
            filters.push(`license_state=${st}`);
          }

          // Post-filter for certification
          if (args.certification) {
            const certTerm = String(args.certification).trim().toLowerCase();
            results = results.filter((c: any) =>
              c.active_certifications.some((cert: string) => cert.toLowerCase().includes(certTerm))
            );
            filters.push(`certification≈${args.certification}`);
          }

          // Post-filter for compact
          if (args.has_compact === true) {
            results = results.filter((c: any) => c.has_compact);
            filters.push('has_compact=true');
          }

          const outputParse = WeissachSearchOutput.safeParse({ ok: true, matches: results.slice(0, 10), filters });
          if (!outputParse.success) {
            logger?.warn?.('weissach_search_candidates_output_validation', {
              errors: outputParse.error.flatten().fieldErrors,
            });
          }

          logger?.info?.('weissach_search_candidates', { filters, matchCount: results.length });
          return { ok: true, matches: results.slice(0, 10), filters };
        } catch (err: any) {
          return { ok: false, error: err.message || 'Search failed.' };
        }
      },
    },

    weissach_get_facility: {
      description:
        'Get Weissach facility details including open jobs, assignment history (all candidates who worked there), and facility notes.',
      parameters: z.object({
        name: z.string().optional(),
        facility_id: z.string().uuid().optional(),
      }),
      execute: async (args: any) => {
        try {
          let fQuery = supabase.from('facilities').select('*').limit(1);

          if (args.facility_id) {
            fQuery = fQuery.eq('id', args.facility_id);
          } else if (args.name) {
            fQuery = fQuery.ilike('name', `%${String(args.name).trim()}%`);
          } else {
            return { ok: false, error: 'Provide name or facility_id.' };
          }

          const { data: facility, error: fErr } = await fQuery.maybeSingle();
          if (fErr) return { ok: false, error: fErr.message };
          if (!facility) return { ok: false, error: 'Facility not found in Weissach pipeline.' };

          const fid = facility.id;

          const [jobsRes, assignmentsRes, notesRes] = await Promise.all([
            supabase.from('jobs').select('*').eq('facility_id', fid).eq('status', 'open').order('start_date', { ascending: true }),
            supabase.from('assignments').select('*, candidates(name, specialty)').eq('facility_id', fid).order('start_date', { ascending: false }),
            supabase.from('notes').select('*').eq('facility_id', fid).order('created_at', { ascending: false }).limit(10),
          ]);

          const result = {
            ok: true as const,
            facility,
            open_jobs: jobsRes.data || [],
            assignments: assignmentsRes.data || [],
            notes: notesRes.data || [],
          };

          const outputParse = WeissachFacilityOutput.safeParse(result);
          if (!outputParse.success) {
            logger?.warn?.('weissach_get_facility_output_validation', {
              errors: outputParse.error.flatten().fieldErrors,
            });
          }

          logger?.info?.('weissach_get_facility', { facility_id: fid, name: facility.name });
          return result;
        } catch (err: any) {
          return { ok: false, error: err.message || 'Failed to fetch facility.' };
        }
      },
    },

    weissach_get_active_pipeline: {
      description:
        'Get overview of all active pipeline deals: pending submittals, upcoming assignment extensions (ending within 30 days). Optionally filter by specialty.',
      parameters: z.object({
        specialty: z.string().optional(),
      }),
      execute: async (args: any) => {
        try {
          const activeStatuses = ['submitted', 'under_review', 'interview_scheduled', 'offer_pending', 'offer_extended'];

          let submittalQuery = supabase
            .from('submittals')
            .select('*, candidates(name, specialty), jobs(title, start_date, shift), facilities(name, city, state)')
            .in('status', activeStatuses)
            .order('submitted_at', { ascending: false });

          const thirtyDaysOut = new Date();
          thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
          const thirtyDaysStr = thirtyDaysOut.toISOString().split('T')[0];

          let assignmentQuery = supabase
            .from('assignments')
            .select('*, candidates(name, specialty), facilities(name, city, state)')
            .eq('status', 'active')
            .lte('end_date', thirtyDaysStr)
            .order('end_date', { ascending: true });

          if (args.specialty) {
            const term = `%${String(args.specialty).trim()}%`;
            // Filter by candidate specialty via the join
            submittalQuery = submittalQuery.ilike('candidates.specialty', term);
            assignmentQuery = assignmentQuery.ilike('candidates.specialty', term);
          }

          const [submittalsRes, assignmentsRes] = await Promise.all([
            submittalQuery,
            assignmentQuery,
          ]);

          const result = {
            ok: true as const,
            active_submittals: submittalsRes.data || [],
            ending_soon: assignmentsRes.data || [],
            summary: {
              total_submittals: (submittalsRes.data || []).length,
              total_ending_soon: (assignmentsRes.data || []).length,
              filter: args.specialty || null,
            },
          };

          const outputParse = WeissachPipelineOutput.safeParse(result);
          if (!outputParse.success) {
            logger?.warn?.('weissach_get_active_pipeline_output_validation', {
              errors: outputParse.error.flatten().fieldErrors,
            });
          }

          logger?.info?.('weissach_get_active_pipeline', { submittals: result.summary.total_submittals, ending: result.summary.total_ending_soon });
          return result;
        } catch (err: any) {
          return { ok: false, error: err.message || 'Failed to fetch pipeline.' };
        }
      },
    },

    weissach_check_compliance: {
      description:
        'Run a compliance audit for a specific Weissach candidate: expired/expiring licenses and certifications, red flag notes, and recent engagement status.',
      parameters: z.object({
        candidate_id: z.string().uuid(),
      }),
      execute: async (args: any) => {
        try {
          const cid = String(args.candidate_id).trim();

          // Verify candidate exists
          const { data: candidate, error: candErr } = await supabase
            .from('candidates')
            .select('id, name, specialty')
            .eq('id', cid)
            .maybeSingle();

          if (candErr) return { ok: false, error: candErr.message };
          if (!candidate) return { ok: false, error: 'Candidate not found.' };

          const now = new Date();
          const thirtyDays = new Date();
          thirtyDays.setDate(now.getDate() + 30);
          const thirtyDaysStr = thirtyDays.toISOString().split('T')[0];
          const nowStr = now.toISOString().split('T')[0];

          const fourteenDaysAgo = new Date();
          fourteenDaysAgo.setDate(now.getDate() - 14);
          const fourteenDaysStr = fourteenDaysAgo.toISOString();

          const [licensesRes, certsRes, flagsRes, contactRes] = await Promise.all([
            supabase.from('licenses').select('*').eq('candidate_id', cid),
            supabase.from('certifications').select('*').eq('candidate_id', cid),
            supabase.from('notes').select('content, created_at').eq('candidate_id', cid).eq('note_type', 'red_flag').order('created_at', { ascending: false }),
            supabase.from('contact_log').select('id').eq('candidate_id', cid).gte('created_at', fourteenDaysStr).limit(1),
          ]);

          const licenses = licensesRes.data || [];
          const certs = certsRes.data || [];

          const expiredLicenses = licenses.filter((l: any) => l.expiration_date && l.expiration_date < nowStr);
          const expiringLicenses = licenses.filter((l: any) => l.expiration_date && l.expiration_date >= nowStr && l.expiration_date <= thirtyDaysStr);

          const expiredCerts = certs.filter((c: any) => c.expiration_date && c.expiration_date < nowStr);
          const expiringCerts = certs.filter((c: any) => c.expiration_date && c.expiration_date >= nowStr && c.expiration_date <= thirtyDaysStr);

          const hasRecentContact = (contactRes.data || []).length > 0;

          const issues: string[] = [];
          for (const l of expiredLicenses) issues.push(`License EXPIRED: ${l.state} (expired ${l.expiration_date})`);
          for (const l of expiringLicenses) issues.push(`License EXPIRING SOON: ${l.state} (expires ${l.expiration_date})`);
          for (const c of expiredCerts) issues.push(`Certification EXPIRED: ${c.name} (expired ${c.expiration_date})`);
          for (const c of expiringCerts) issues.push(`Certification EXPIRING SOON: ${c.name} (expires ${c.expiration_date})`);
          if (!hasRecentContact) issues.push('No contact in last 14 days — engagement may be stale.');

          const result = {
            ok: true as const,
            candidate: { id: candidate.id, name: candidate.name, specialty: candidate.specialty },
            compliance_status: issues.length === 0 ? 'clear' as const : 'action_required' as const,
            issues,
            expired_licenses: expiredLicenses,
            expiring_licenses: expiringLicenses,
            expired_certifications: expiredCerts,
            expiring_certifications: expiringCerts,
            red_flags: (flagsRes.data || []).map((n: any) => n.content),
            has_recent_contact: hasRecentContact,
          };

          const outputParse = WeissachComplianceOutput.safeParse(result);
          if (!outputParse.success) {
            logger?.warn?.('weissach_check_compliance_output_validation', {
              errors: outputParse.error.flatten().fieldErrors,
            });
          }

          logger?.info?.('weissach_check_compliance', { candidate_id: cid, status: result.compliance_status, issueCount: issues.length });
          return result;
        } catch (err: any) {
          return { ok: false, error: err.message || 'Compliance check failed.' };
        }
      },
    },

    weissach_add_note: {
      description:
        'Add a typed note to any Weissach entity (candidate, facility, job, submittal, or assignment). At least one entity ID is required.',
      parameters: z.object({
        content: z.string().min(1),
        note_type: z.enum(['general', 'clinical', 'preference', 'red_flag', 'relationship', 'compliance']),
        candidate_id: z.string().uuid().optional(),
        facility_id: z.string().uuid().optional(),
        job_id: z.string().uuid().optional(),
        submittal_id: z.string().uuid().optional(),
        assignment_id: z.string().uuid().optional(),
      }),
      execute: async (args: any) => {
        try {
          const hasEntity = args.candidate_id || args.facility_id || args.job_id || args.submittal_id || args.assignment_id;
          if (!hasEntity) {
            return { ok: false, error: 'At least one entity ID is required (candidate_id, facility_id, job_id, submittal_id, or assignment_id).' };
          }

          const payload: Record<string, any> = {
            content: String(args.content).trim(),
            note_type: String(args.note_type).trim(),
          };
          if (args.candidate_id) payload.candidate_id = args.candidate_id;
          if (args.facility_id) payload.facility_id = args.facility_id;
          if (args.job_id) payload.job_id = args.job_id;
          if (args.submittal_id) payload.submittal_id = args.submittal_id;
          if (args.assignment_id) payload.assignment_id = args.assignment_id;

          const { data, error } = await supabase
            .from('notes')
            .insert([payload])
            .select('*')
            .single();

          if (error) return { ok: false, error: error.message };

          logger?.info?.('weissach_add_note', { note_id: data?.id, note_type: args.note_type });
          return { ok: true, note: data };
        } catch (err: any) {
          return { ok: false, error: err.message || 'Failed to add note.' };
        }
      },
    },

    weissach_log_contact: {
      description:
        'Record a contact event with a Weissach candidate (call, email, text, etc.).',
      parameters: z.object({
        candidate_id: z.string().uuid(),
        channel: z.enum(['phone', 'email', 'text', 'teams', 'voicemail', 'ringcentral']),
        direction: z.enum(['outbound', 'inbound']),
        outcome: z.enum(['connected', 'voicemail', 'no_answer', 'sent', 'received', 'opened', 'replied', 'bounced']).optional(),
        subject: z.string().optional(),
        body_preview: z.string().optional(),
      }),
      execute: async (args: any) => {
        try {
          const payload: Record<string, any> = {
            candidate_id: String(args.candidate_id).trim(),
            channel: String(args.channel).trim(),
            direction: String(args.direction).trim(),
          };
          if (args.outcome) payload.outcome = String(args.outcome).trim();
          if (args.subject) payload.subject = String(args.subject).trim();
          if (args.body_preview) payload.body_preview = String(args.body_preview).trim();

          const { data, error } = await supabase
            .from('contact_log')
            .insert([payload])
            .select('*')
            .single();

          if (error) return { ok: false, error: error.message };

          logger?.info?.('weissach_log_contact', { contact_id: data?.id, channel: args.channel });
          return { ok: true, contact: data };
        } catch (err: any) {
          return { ok: false, error: err.message || 'Failed to log contact.' };
        }
      },
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// Weissach Output Validation Schemas
// ════════════════════════════════════════════════════════════════════════════════

const WeissachCandidateProfileOutput = z.object({
  ok: z.literal(true),
  candidate: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    specialty: z.string(),
    sub_specialty: z.string().nullable().optional(),
    profession: z.string().nullable().optional(),
    years_experience: z.number().nullable().optional(),
    available_date: z.string().nullable().optional(),
    home_state: z.string().nullable().optional(),
    preferred_locations: z.array(z.string()).nullable().optional(),
    pay_floor: z.number().nullable().optional(),
    housing_pref: z.string().nullable().optional(),
    communication_style: z.string().nullable().optional(),
    preferred_contact: z.string().nullable().optional(),
    nova_id: z.string().nullable().optional(),
    recruiter: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
  }).passthrough(),
  licenses: z.array(z.object({
    id: z.string().uuid(),
    candidate_id: z.string().uuid(),
    state: z.string(),
    license_number: z.string().nullable().optional(),
    is_compact: z.boolean().nullable().optional(),
    expiration_date: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
  }).passthrough()),
  certifications: z.array(z.object({
    id: z.string().uuid(),
    candidate_id: z.string().uuid(),
    name: z.string(),
    issuer: z.string().nullable().optional(),
    expiration_date: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
  }).passthrough()),
  assignments: z.array(z.any()),
  submittals: z.array(z.any()),
  notes: z.array(z.object({
    id: z.string().uuid(),
    note_type: z.string(),
    content: z.string(),
  }).passthrough()),
  red_flags: z.array(z.string()),
  contact_log: z.array(z.any()),
});

const WeissachSearchOutput = z.object({
  ok: z.literal(true),
  matches: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    specialty: z.string(),
    years_experience: z.number().nullable().optional(),
    available_date: z.string().nullable().optional(),
    license_states: z.array(z.string()),
    active_certifications: z.array(z.string()),
    red_flags: z.array(z.string()),
  }).passthrough()),
  filters: z.array(z.string()),
});

const WeissachFacilityOutput = z.object({
  ok: z.literal(true),
  facility: z.object({
    id: z.string().uuid(),
    name: z.string(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
  }).passthrough(),
  open_jobs: z.array(z.any()),
  assignments: z.array(z.any()),
  notes: z.array(z.any()),
});

const WeissachPipelineOutput = z.object({
  ok: z.literal(true),
  active_submittals: z.array(z.any()),
  ending_soon: z.array(z.any()),
  summary: z.object({
    total_submittals: z.number(),
    total_ending_soon: z.number(),
    filter: z.string().nullable(),
  }),
});

const WeissachComplianceOutput = z.object({
  ok: z.literal(true),
  candidate: z.object({
    id: z.string().uuid(),
    name: z.string(),
    specialty: z.string(),
  }),
  compliance_status: z.enum(['clear', 'action_required']),
  issues: z.array(z.string()),
  expired_licenses: z.array(z.any()),
  expiring_licenses: z.array(z.any()),
  expired_certifications: z.array(z.any()),
  expiring_certifications: z.array(z.any()),
  red_flags: z.array(z.string()),
  has_recent_contact: z.boolean(),
});
