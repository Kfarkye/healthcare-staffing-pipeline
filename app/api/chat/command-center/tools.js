/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TOOLS — Command Center (v4.0 - Elite Production Architecture)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * UPGRADES:
 * - 🛡️ Crash-Proof Wrapper: Global try/catch guarantees the stream never dies.
 * - 🧼 Deep Sanitization: Recursively converts Dates to strings & strips undefined.
 * - 📉 Token Guard: Automatically truncates results >15 items to save context.
 * - ⚡ Parallelism: Uses Promise.allSettled for searches to prevent partial failure locks.
 * 
 * @module app/api/chat/command-center/tools
 */

import { tool } from 'ai';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// INFRASTRUCTURE: RESILIENT RUNTIME LAYER
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
    TIMEOUT_MS: 15000,      // Hard limit for tool execution
    MAX_OUTPUT_CHARS: 25000, // Safety limit for context window
    MAX_ARRAY_ITEMS: 15     // Truncation limit for lists
};

/**
 * Recursively sanitizes data for AI Stream compatibility.
 * Critical for preventing "Stream Parser" errors.
 */
function sanitizeForAI(data, depth = 0) {
    if (depth > 5) return '[Max Depth Exceeded]';
    if (data === null || data === undefined) return null;
    if (typeof data !== 'object') return data;

    // Fix: Convert Date objects to ISO strings (AI SDK crash prevention)
    if (data instanceof Date) return data.toISOString();

    if (Array.isArray(data)) {
        // Fix: Truncate massive arrays to save tokens
        if (depth === 0 && data.length > CONFIG.MAX_ARRAY_ITEMS) {
            const truncated = data.slice(0, CONFIG.MAX_ARRAY_ITEMS).map(item => sanitizeForAI(item, depth + 1));
            // Add a virtual item to inform AI of truncation
            truncated.push({ _system_msg: `... ${data.length - CONFIG.MAX_ARRAY_ITEMS} more items truncated for performance.` });
            return truncated;
        }
        return data.map(item => sanitizeForAI(item, depth + 1));
    }

    const clean = {};
    for (const [key, val] of Object.entries(data)) {
        // Strip heavy internal fields
        if (key.startsWith('_') && key !== '_system_msg') continue;
        const sanitized = sanitizeForAI(val, depth + 1);
        if (sanitized !== undefined) clean[key] = sanitized;
    }
    return clean;
}

/**
 * The "Safety Net" Wrapper.
 * Wraps every tool execution to ensure JSON validity and handle errors gracefully.
 */
function createSafeTool(config) {
    const { execute, description, parameters, name } = config;

    const wrappedExecute = async (args) => {
        const start = Date.now();
        const toolId = name || 'unknown_tool';

        try {
            // 1. Timeout Race
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Execution timed out (${CONFIG.TIMEOUT_MS}ms)`)), CONFIG.TIMEOUT_MS)
            );

            // 2. Execute
            const result = await Promise.race([execute(args), timeoutPromise]);

            // 3. Handle Explicit Database Errors
            if (result && result.error && typeof result.error === 'object') {
                console.warn(`[Tool Error: ${toolId}] DB Error:`, result.error);
                return {
                    success: false,
                    status: 'db_error',
                    message: result.error.message || 'Database operation failed.'
                };
            }

            // 4. Sanitize & Serialize
            const safeResult = sanitizeForAI(result);

            // 5. Output Size Guard
            const payloadSize = JSON.stringify(safeResult).length;
            if (payloadSize > CONFIG.MAX_OUTPUT_CHARS) {
                console.warn(`[Tool Warning: ${toolId}] Payload too large (${payloadSize} chars). Truncating.`);
                return {
                    success: true,
                    status: 'truncated',
                    message: 'Result too large. Returning summary only.',
                    summary: safeResult.summary || safeResult.count || 'Data found but truncated.'
                };
            }

            return { success: true, ...safeResult, _latency: `${Date.now() - start}ms` };

        } catch (error) {
            console.error(`[Tool Crash: ${toolId}]`, error);
            // CRITICAL: Return valid JSON instead of throwing to keep stream alive
            return {
                success: false,
                status: 'crash',
                error: error.message || 'Unknown Error',
                message: `System Error in ${toolId}. Please ask user to refine query.`
            };
        }
    };

    return tool({ description, parameters, execute: wrappedExecute });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function createCommandCenterTools(supabase) {

    return {
        // ── SYSTEM ─────────────────────────────────────────────────────────────

        debug_system: createSafeTool({
            name: 'debug_system',
            description: 'Check database connectivity and row counts.',
            parameters: z.object({}),
            execute: async () => {
                // Use 'head: true' for low-latency checks
                const results = await Promise.allSettled([
                    supabase.from('prospects').select('id', { count: 'estimated', head: true }),
                    supabase.from('travel_candidates').select('id', { count: 'estimated', head: true }),
                    supabase.from('cold_outreach_campaigns').select('id', { count: 'estimated', head: true }),
                ]);

                const [p, t, c] = results;

                return {
                    status: 'operational',
                    counts: {
                        prospects: p.status === 'fulfilled' ? p.value.count : 'ERR',
                        travelers: t.status === 'fulfilled' ? t.value.count : 'ERR',
                        campaigns: c.status === 'fulfilled' ? c.value.count : 'ERR',
                    },
                    db_ok: results.every(r => r.status === 'fulfilled' && !r.value.error)
                };
            },
        }),

        // ── TEMPLATES ──────────────────────────────────────────────────────────

        list_templates: createSafeTool({
            name: 'list_templates',
            description: `List communication templates.
            
            USE THIS WHEN:
            - User asks "what templates do I have?" or "list my templates"
            - User wants to see available email styles before drafting
            
            DO NOT USE THIS WHEN:
            - You are in the middle of drafting an email
            - Template was already listed in this conversation`,
            parameters: z.object({
                category: z.enum(['active', 'prospect', 'retention', 'all']).optional(),
            }),
            execute: async ({ category }) => {
                let query = supabase
                    .from('communication_templates')
                    .select('name, category, description, required_variables') // Lean select
                    .eq('is_active', true);

                if (category && category !== 'all') query = query.eq('category', category);

                const { data, error } = await query.order('category').limit(50);
                if (error) return { error };

                return { templates: data || [], count: data?.length || 0 };
            },
        }),

        get_template: createSafeTool({
            name: 'get_template',
            description: `Retrieve full content of a specific template.
            
            USE THIS WHEN:
            - You need exact wording or merge variables for a template
            - About to draft an email and need template structure
            
            DO NOT USE THIS WHEN:
            - Template content is already in your system prompt
            - Performing a general search or lookup`,
            parameters: z.object({ template_name: z.string() }),
            execute: async ({ template_name }) => {
                const { data, error } = await supabase
                    .from('communication_templates')
                    .select('*')
                    .eq('name', template_name)
                    .maybeSingle(); // Safe: Does not throw on 0 rows

                if (error) return { error };
                if (!data) return { found: false, message: `Template "${template_name}" not found.` };

                return { ...data, usage: 'Replace {{variables}} with actual data.' };
            },
        }),

        // ── SEARCH (PARALLEL & LEAN) ───────────────────────────────────────────

        search_all_candidates: createSafeTool({
            name: 'search_all_candidates',
            description: `Search prospects and active travelers by name.
            
            USE THIS WHEN:
            - User mentions a person's name and asks for details, link, or email
            - User asks for a "Nova link", "Aya link", or "profile URL"
            - User wants status or facility info for a specific candidate
            
            DO NOT USE THIS WHEN:
            - User is asking a general question about staffing
            - No specific person name is mentioned`,
            parameters: z.object({
                name: z.string().min(1),
            }),
            execute: async ({ name }) => {
                const cleanName = name.trim();

                // Parallel execution + Specific columns (Reduces token usage)
                const [prospectsRes, travelersRes] = await Promise.allSettled([
                    supabase
                        .from('prospects')
                        .select('candidate_id, name, specialty, home_state, status, nova_url')
                        .ilike('name', `%${cleanName}%`)
                        .limit(10),
                    supabase
                        .from('travel_candidates')
                        .select('candidate_id, candidate_name, facility, contract_status')
                        .ilike('candidate_name', `%${cleanName}%`)
                        .limit(10),
                ]);

                const prospects = prospectsRes.status === 'fulfilled' ? (prospectsRes.value.data ?? []) : [];
                const travelers = travelersRes.status === 'fulfilled' ? (travelersRes.value.data ?? []) : [];

                return {
                    results: [
                        ...prospects.map(p => ({
                            type: 'Prospect',
                            name: p.name,
                            info: `${p.specialty || 'RN'} | ${p.home_state}`,
                            status: p.status,
                            id: p.candidate_id,
                            link: p.nova_url || `https://nova.ayahealthcare.com/#/recruiting/candidates/${p.candidate_id}/new-profile/about`
                        })),
                        ...travelers.map(t => ({
                            type: 'Traveler',
                            name: t.candidate_name,
                            info: `${t.facility}`,
                            status: t.contract_status,
                            id: t.candidate_id,
                            link: `https://nova.ayahealthcare.com/#/recruiting/candidates/${t.candidate_id}/new-profile/about`
                        }))
                    ],
                    total_found: prospects.length + travelers.length
                };
            },
        }),

        search_prospects: createSafeTool({
            name: 'search_prospects',
            description: `Search the prospect pipeline with filters.
            
            USE THIS WHEN:
            - User wants to filter by specialty, state, or status
            - User asks "show me all ICU nurses" or "prospects in California"
            
            DO NOT USE THIS WHEN:
            - User just wants one specific person (use search_all_candidates)
            - No filtering criteria mentioned`,
            parameters: z.object({
                name: z.string().optional(),
                specialty: z.string().optional(),
                home_state: z.string().optional(),
                status: z.enum(['New', 'Contacted', 'Interested', 'Passive', 'Rotation']).optional(),
            }),
            execute: async ({ name, specialty, home_state, status }) => {
                let query = supabase
                    .from('prospects')
                    .select('candidate_id, name, specialty, home_state, status, nova_url');

                if (name) query = query.ilike('name', `%${name.trim()}%`);
                if (specialty) query = query.ilike('specialty', `%${specialty.trim()}%`);
                if (home_state) query = query.ilike('home_state', `%${home_state.trim()}%`);
                if (status) query = query.eq('status', status);

                const { data, error } = await query.limit(20);
                if (error) return { error };

                return { prospects: data || [], count: data?.length || 0 };
            },
        }),

        search_travel_list: createSafeTool({
            name: 'search_travel_list',
            description: `Search active travelers for current contractors.
            
            USE THIS WHEN:
            - User asks about active travelers or current contractors
            - User wants contracts ending soon
            - User asks about a specific facility's travelers
            
            DO NOT USE THIS WHEN:
            - User is looking up a prospect (not yet placed)
            - User just wants a Nova link (use search_all_candidates)`,
            parameters: z.object({
                name: z.string().optional(),
                facility: z.string().optional(),
                ending_soon: z.boolean().optional().describe('Filter for contracts ending within 30 days'),
            }),
            execute: async ({ name, facility, ending_soon }) => {
                let query = supabase
                    .from('travel_candidates')
                    .select('candidate_id, candidate_name, facility, start_date, end_date, contract_status');

                if (name) query = query.ilike('candidate_name', `%${name.trim()}%`);
                if (facility) query = query.ilike('facility', `%${facility.trim()}%`);
                if (ending_soon) {
                    const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    query = query
                        .lte('end_date', thirtyDaysOut)
                        .gte('end_date', new Date().toISOString().split('T')[0]);
                }

                const { data, error } = await query.limit(20);
                if (error) return { error };

                return { travelers: data || [], count: data?.length || 0 };
            },
        }),

        get_prospect_details: createSafeTool({
            name: 'get_prospect_details',
            description: `Retrieve full profile details for a candidate.
            
            USE THIS WHEN:
            - You have a nova_id and need full details
            - User wants comprehensive profile info beyond search results
            
            DO NOT USE THIS WHEN:
            - You don't have an identifier (use search_all_candidates first)
            - User just wants quick link or email (search results have those)`,
            parameters: z.object({
                nova_id: z.number().optional(),
                name: z.string().optional(),
            }),
            execute: async ({ nova_id, name }) => {
                if (!nova_id && !name) return { error: 'Provide nova_id or name.' };

                // 1. Check Prospects
                let pQuery = supabase.from('prospects').select('*');
                if (nova_id) pQuery = pQuery.eq('candidate_id', nova_id);
                else pQuery = pQuery.ilike('name', `%${name.trim()}%`);

                const { data: prospect } = await pQuery.maybeSingle();
                if (prospect) return { ...prospect, source: 'prospect' };

                // 2. Check Travelers
                let tQuery = supabase.from('travel_candidates').select('*');
                if (nova_id) tQuery = tQuery.eq('candidate_id', nova_id);
                else tQuery = tQuery.ilike('candidate_name', `%${name.trim()}%`);

                const { data: traveler } = await tQuery.maybeSingle();
                if (traveler) return { ...traveler, source: 'active_traveler' };

                return { found: false, message: 'Candidate not found.' };
            },
        }),

        // ── PROSPECT MANAGEMENT ────────────────────────────────────────────────

        add_prospect: createSafeTool({
            name: 'add_prospect',
            description: `Create a new prospect record in the pipeline.
            
            USE THIS WHEN:
            - User says "add this candidate" or "save this prospect"
            - User provides Nova URL/ID and wants to track them
            
            DO NOT USE THIS WHEN:
            - User is just looking up existing candidates
            - User hasn't provided Nova ID or URL (ask for it first)`,
            parameters: z.object({
                name: z.string().min(1),
                nova_id: z.number().optional(),
                nova_url: z.string().optional(),
                specialty: z.string().optional(),
                home_state: z.string().optional(),
                email: z.string().email().optional(),
                phone: z.string().optional(),
                notes: z.string().optional(),
            }),
            execute: async ({ name, nova_id, nova_url, specialty, home_state, email, phone, notes }) => {
                let resolvedNovaId = nova_id;
                let resolvedNovaUrl = nova_url;

                // Extract ID from URL if needed
                if (!resolvedNovaId && nova_url) {
                    const match = nova_url.match(/\/candidates\/(\d+)/);
                    if (match) resolvedNovaId = parseInt(match[1], 10);
                }

                if (!resolvedNovaId) {
                    return { error: 'Nova ID required. Ask user for ID or Profile URL.' };
                }

                if (!resolvedNovaUrl) {
                    resolvedNovaUrl = `https://nova.ayahealthcare.com/#/recruiting/candidates/${resolvedNovaId}/new-profile/about`;
                }

                const { data, error } = await supabase
                    .from('prospects')
                    .insert({
                        name: name.trim(),
                        specialty,
                        home_state,
                        email,
                        phone,
                        notes,
                        status: 'New',
                        candidate_id: resolvedNovaId,
                        nova_url: resolvedNovaUrl,
                    })
                    .select()
                    .single();

                if (error) return { error };
                return { action: 'PROSPECT_ADDED', prospect: data };
            },
        }),

        update_prospect_status: createSafeTool({
            name: 'update_prospect_status',
            description: `Move candidate to a different pipeline stage.
            
            USE THIS WHEN:
            - User says "mark as contacted" or "move to interested"
            - User wants to update a prospect's status
            
            DO NOT USE THIS WHEN:
            - User is just searching for candidates
            - User hasn't specified which status to use`,
            parameters: z.object({
                nova_id: z.number(),
                new_status: z.enum(['New', 'Contacted', 'Interested', 'Passive', 'Rotation']),
                reason: z.string().optional(),
            }),
            execute: async ({ nova_id, new_status, reason }) => {
                const { data: current } = await supabase
                    .from('prospects')
                    .select('status, notes, name')
                    .eq('candidate_id', nova_id)
                    .maybeSingle();

                if (!current) return { error: 'Prospect not found.' };

                const timestamp = new Date().toISOString().split('T')[0];
                const auditEntry = reason
                    ? `[${timestamp}] ${current.status} -> ${new_status}: ${reason}`
                    : `[${timestamp}] ${current.status} -> ${new_status}`;
                const updatedNotes = current.notes ? `${current.notes}\n${auditEntry}` : auditEntry;

                const { data, error } = await supabase
                    .from('prospects')
                    .update({
                        status: new_status,
                        notes: updatedNotes,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('candidate_id', nova_id)
                    .select()
                    .single();

                if (error) return { error };
                return { action: 'STATUS_UPDATED', prospect: data };
            },
        }),

        // ── CAMPAIGNS ──────────────────────────────────────────────────────────

        create_campaign: createSafeTool({
            name: 'create_campaign',
            description: 'Initialize a new cold outreach campaign.',
            parameters: z.object({
                position_title: z.string(),
                facility_name: z.string(),
                city: z.string(),
                state: z.string(),
                start_date: z.string(),
                end_date: z.string(),
                gross_weekly_pay: z.coerce.number(), // Coerce handles strings like "2000"
                job_id: z.string().optional(),
            }),
            execute: async (args) => {
                const { data, error } = await supabase
                    .from('cold_outreach_campaigns')
                    .insert({
                        ...args,
                        state: args.state.toUpperCase().slice(0, 2),
                        status: 'draft',
                    })
                    .select('id, position_title')
                    .single();

                if (error) return { error };
                return {
                    action: 'CAMPAIGN_CREATED',
                    campaign_id: data.id,
                    next_steps: ['add_recipients']
                };
            },
        }),

        add_recipients: createSafeTool({
            name: 'add_recipients',
            description: 'Add recipients to a campaign from text/CSV.',
            parameters: z.object({
                campaign_id: z.string().uuid(),
                raw_text: z.string(),
            }),
            execute: async ({ campaign_id, raw_text }) => {
                // Verify Campaign
                const { data: c } = await supabase.from('cold_outreach_campaigns').select('id').eq('id', campaign_id).maybeSingle();
                if (!c) return { error: 'Campaign not found.' };

                // Robust Parsing
                const lines = raw_text.split(/[\n\r]+/).filter(l => l.trim());
                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
                const candidates = [];

                for (const line of lines) {
                    const emails = line.match(emailRegex);
                    if (!emails?.length) continue;

                    const email = emails[0].toLowerCase().trim();
                    let namePart = line.replace(email, '').replace(/[,;\t|<>]+/g, ' ').replace(/^[\d\s.-]+/, '').trim();
                    const parts = namePart.split(/\s+/).filter(p => p);

                    candidates.push({
                        campaign_id,
                        first_name: parts[0] || 'Unknown',
                        last_name: parts.slice(1).join(' ') || null,
                        email,
                        email_normalized: email,
                        status: 'pending'
                    });
                }

                if (!candidates.length) return { error: 'No valid emails found.' };

                const { data, error } = await supabase
                    .from('cold_outreach_recipients')
                    .upsert(candidates, { onConflict: 'campaign_id,email_normalized', ignoreDuplicates: true })
                    .select('id');

                if (error) return { error };

                return {
                    success: true,
                    added: data?.length || 0,
                    message: `Added ${data?.length} recipients.`
                };
            },
        }),

        generate_blast_emails: createSafeTool({
            name: 'generate_blast_emails',
            description: 'Generate personalized emails for pending recipients.',
            parameters: z.object({
                campaign_id: z.string().uuid(),
            }),
            execute: async ({ campaign_id }) => {
                const { data: campaign } = await supabase
                    .from('cold_outreach_campaigns')
                    .select('*, template:communication_templates(*)')
                    .eq('id', campaign_id)
                    .maybeSingle();

                if (!campaign) return { error: 'Campaign not found.' };

                const { data: recipients } = await supabase
                    .from('cold_outreach_recipients')
                    .select('id, first_name, last_name')
                    .eq('campaign_id', campaign_id)
                    .eq('status', 'pending')
                    .limit(100);

                if (!recipients?.length) return { message: 'No pending recipients.' };

                const sT = campaign.template?.subject_template || 'Opportunity: {{position_title}}';
                const bT = campaign.template?.body_template || 'Hi {{first_name}},\n\n{{custom_hook}}\n\nPay: {{gross_weekly_pay}}';

                const updates = recipients.map(r => {
                    let s = sT, b = bT;
                    // Safe regex replacement for variables
                    const vars = { ...campaign, ...r };
                    Object.entries(vars).forEach(([k, v]) => {
                        if (v === null || v === undefined) return;
                        // Escape regex characters
                        const safeK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const reg = new RegExp(`{{${safeK}}}`, 'gi');
                        s = s.replace(reg, String(v));
                        b = b.replace(reg, String(v));
                    });

                    return {
                        id: r.id,
                        campaign_id,
                        generated_subject: s,
                        generated_body: b,
                        status: 'generated',
                        updated_at: new Date().toISOString()
                    };
                });

                const { error } = await supabase.from('cold_outreach_recipients').upsert(updates);
                if (error) return { error };

                await supabase.from('cold_outreach_campaigns').update({ status: 'ready' }).eq('id', campaign_id);

                return { generated: updates.length, action: 'EMAILS_GENERATED' };
            },
        }),
    };
}

export default { createCommandCenterTools };
