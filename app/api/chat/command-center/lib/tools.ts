/**
 * Command Center Tools
 * Server-side tool definitions for LLM actions.
 */

import { z } from 'zod';
import { CONFIG } from './config';

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

export function createCommandCenterTools(supabase: any, logger?: { info?: Function; warn?: Function; error?: Function }) {
  return {
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
          nova_url: args.nova_url ? String(args.nova_url).trim() : buildNovaUrl(candidateId),
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
  };
}

