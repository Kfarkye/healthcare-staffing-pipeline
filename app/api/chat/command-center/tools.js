/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * TOOLS — Command Center (v4.2 - Hardened Production Runtime)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * UPGRADES from v4.1:
 * - MAX_KEY_COUNT guard: prevents pathological objects from consuming tokens
 * - Truncated items tracking: observability for how many items were cut
 * - pickCampaignVars: safer template merge (prevents leaking nested objects)
 * - safeTemplateReplace: extracted helper for template variable replacement
 * - Scalar result wrapping: stable output shapes for primitive returns
 *
 * PRESERVED from v4.1:
 * - Crash-proof wrapper: tool execution never kills the stream
 * - Circular-safe sanitization: prevents JSON crashes on cyclic objects
 * - Deep sanitization: Date → ISO, BigInt → string, Error → plain object, Map/Set supported
 * - Token guard: truncates large arrays at any depth
 * - Timeout hygiene: clears timers; consistent meta envelope
 * - Supabase error normalization: handles error objects and error strings
 * - Fail-closed guard: returns stable error if Supabase client missing
 * - Email deduplication in add_recipients
 * - Upsert for add_prospect (idempotent)
 * - Backward-compatible _latency field
 *
 * @module app/api/chat/command-center/tools
 */

import { tool } from 'ai';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG_DEFAULTS = Object.freeze({
    TIMEOUT_MS: 15000,
    MAX_OUTPUT_CHARS: 12000, // Reduced from 25k to prevent slow serialization and 504s
    MAX_ARRAY_ITEMS: 15,
    MAX_DEPTH: 6,
    MAX_KEY_COUNT: 2000, // Prevents pathological objects
});

/**
 * @typedef {string | number | boolean | null} JsonPrimitive
 * @typedef {JsonPrimitive | JsonObject | JsonValue[]} JsonValue
 * @typedef {{ [k: string]: JsonValue }} JsonObject
 * @typedef {Record<string, any>} AnyRecord
 */

/**
 * @typedef {Object} SanitizeContext
 * @property {number} truncated_items
 * @property {number} key_count
 */

/**
 * @typedef {Object} ToolMeta
 * @property {string} tool
 * @property {number} latency_ms
 * @property {number} [payload_chars]
 * @property {boolean} [truncated]
 * @property {number} [truncated_items]
 */

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build a Nova profile URL from candidate ID.
 * @param {string | number} candidateId
 * @returns {string}
 */
function buildNovaUrl(candidateId) {
    return `https://nova.ayahealthcare.com/#/recruiting/candidates/${candidateId}/new-profile/about`;
}

/**
 * Extract date-only ISO string (YYYY-MM-DD).
 * @param {Date} d
 * @returns {string}
 */
function isoDateOnly(d) {
    return d.toISOString().split('T')[0];
}

/**
 * Normalize common Supabase error shapes into a stable string.
 * @param {unknown} err
 * @returns {string}
 */
function normalizeDbError(err) {
    if (!err) return 'Database operation failed.';
    if (typeof err === 'string') return err;

    if (typeof err === 'object') {
        const e = /** @type {AnyRecord} */ (err);
        if (typeof e.message === 'string' && e.message.trim()) return e.message;
        if (typeof e.error_description === 'string' && e.error_description.trim()) return e.error_description;

        try {
            const j = JSON.stringify(e);
            if (j && j !== '{}' && j !== 'null') return j;
        } catch {
            // ignore
        }
    }

    return 'Database operation failed.';
}

/**
 * Safe stringify that never throws.
 * @param {unknown} value
 * @returns {string}
 */
function safeStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return '"[Unserializable Payload]"';
    }
}

/**
 * Produce a minimal summary when payload is too large.
 * @param {any} value
 * @returns {AnyRecord}
 */
function summarizeLargePayload(value) {
    if (value === null || value === undefined) return { summary: null };
    if (typeof value !== 'object') return { summary: value };

    const out = /** @type {AnyRecord} */ ({});

    if (typeof value.count === 'number') out.count = value.count;
    if (typeof value.total_found === 'number') out.total_found = value.total_found;
    if (typeof value.generated === 'number') out.generated = value.generated;

    if (Array.isArray(value.results)) out.results_count = value.results.length;
    if (Array.isArray(value.prospects)) out.prospects_count = value.prospects.length;
    if (Array.isArray(value.travelers)) out.travelers_count = value.travelers.length;
    if (Array.isArray(value.templates)) out.templates_count = value.templates.length;

    if (!Object.keys(out).length) {
        out.keys = Object.keys(value).slice(0, 25);
    }

    return out;
}

/**
 * Pick only safe campaign fields for template merge.
 * Prevents leaking nested objects (template, id, timestamps) into generated emails.
 * @param {AnyRecord} campaign
 * @returns {AnyRecord}
 */
function pickCampaignVars(campaign) {
    const keys = [
        'position_title',
        'facility_name',
        'city',
        'state',
        'start_date',
        'end_date',
        'gross_weekly_pay',
        'job_id',
    ];

    const out = /** @type {AnyRecord} */ ({});
    for (const k of keys) {
        if (campaign && campaign[k] !== undefined && campaign[k] !== null) {
            out[k] = campaign[k];
        }
    }
    return out;
}

/**
 * Safe template variable replacement with regex escaping.
 * @param {string} template
 * @param {AnyRecord} vars
 * @returns {string}
 */
function safeTemplateReplace(template, vars) {
    let out = template;

    for (const [k, v] of Object.entries(vars)) {
        if (v === null || v === undefined) continue;
        const safeK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(`{{${safeK}}}`, 'gi');
        out = out.replace(reg, String(v));
    }

    return out;
}

/**
 * Circular-safe sanitizer:
 * - Strips undefined
 * - Drops private keys starting with "_" except "_system_msg"
 * - Date → ISO, BigInt → string, Error → plain object
 * - Map → object, Set → array
 * - Truncates arrays at any depth
 * - Caps depth and key count
 *
 * @param {unknown} data
 * @param {typeof CONFIG_DEFAULTS} opts
 * @param {number} [depth=0]
 * @param {WeakSet<object>} [seen]
 * @param {SanitizeContext} [ctx]
 * @returns {JsonValue}
 */
function sanitizeForAI(data, opts, depth = 0, seen, ctx) {
    const context = ctx || { truncated_items: 0, key_count: 0 };

    if (depth > opts.MAX_DEPTH) return '[Max Depth Exceeded]';
    if (context.key_count > opts.MAX_KEY_COUNT) return '[Max Keys Exceeded]';

    if (data === null || data === undefined) return null;

    const t = typeof data;

    if (t === 'string' || t === 'number' || t === 'boolean') return /** @type {JsonPrimitive} */ (data);
    if (t === 'bigint') return String(data);
    if (t === 'function' || t === 'symbol') return null;

    if (data instanceof Date) return data.toISOString();

    if (data instanceof Error) {
        const errObj = /** @type {AnyRecord} */ ({ name: data.name || 'Error', message: data.message || 'Unknown error' });
        if (data.stack) errObj.stack = data.stack;
        return /** @type {JsonValue} */ (errObj);
    }

    if (data instanceof Map) {
        const obj = /** @type {AnyRecord} */ ({});
        for (const [k, v] of data.entries()) {
            const key = typeof k === 'string' ? k : safeStringify(k);
            obj[key] = sanitizeForAI(v, opts, depth + 1, seen, context);
            context.key_count += 1;
        }
        return /** @type {JsonValue} */ (obj);
    }

    if (data instanceof Set) {
        return sanitizeForAI(Array.from(data.values()), opts, depth + 1, seen, context);
    }

    // Arrays - truncate at ANY depth
    if (Array.isArray(data)) {
        const len = data.length;
        const limit = opts.MAX_ARRAY_ITEMS;
        const sliced = len > limit ? data.slice(0, limit) : data;

        const sanitized = sliced.map((item) => sanitizeForAI(item, opts, depth + 1, seen, context));

        if (len > limit) {
            context.truncated_items += len - limit;
            sanitized.push({ _system_msg: `... ${len - limit} more items truncated for performance.` });
        }

        return sanitized;
    }

    // Objects (circular-safe)
    if (t === 'object') {
        const obj = /** @type {object} */ (data);
        if (!seen) seen = new WeakSet();
        if (seen.has(obj)) return '[Circular]';
        seen.add(obj);

        const clean = /** @type {AnyRecord} */ ({});

        for (const [key, val] of Object.entries(/** @type {AnyRecord} */(obj))) {
            if (key.startsWith('_') && key !== '_system_msg') continue;

            const sanitized = sanitizeForAI(val, opts, depth + 1, seen, context);
            if (sanitized !== undefined) clean[key] = sanitized;

            context.key_count += 1;
            if (context.key_count > opts.MAX_KEY_COUNT) break;
        }

        return /** @type {JsonValue} */ (clean);
    }

    return null;
}

/**
 * Safety wrapper: never throws; always returns valid JSON.
 *
 * @param {Object} cfg
 * @param {string} cfg.name
 * @param {string} cfg.description
 * @param {z.ZodTypeAny} cfg.parameters
 * @param {(args: any) => Promise<any>} cfg.execute
 * @param {Partial<typeof CONFIG_DEFAULTS>} [cfg.configOverrides]
 */
function createSafeTool(cfg) {
    const { execute, description, parameters, name, configOverrides } = cfg;
    const opts = Object.freeze({ ...CONFIG_DEFAULTS, ...(configOverrides || {}) });

    const wrappedExecute = async (args) => {
        const startedAt = Date.now();
        const toolId = name || 'unknown_tool';

        /** @type {ReturnType<typeof setTimeout> | null} */
        let timeoutId = null;

        try {
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(`Execution timed out (${opts.TIMEOUT_MS}ms)`)), opts.TIMEOUT_MS);
            });

            const result = await Promise.race([execute(args), timeoutPromise]);

            // CRITICAL: Clear timeout to prevent timer leak
            if (timeoutId) clearTimeout(timeoutId);

            // Standardize error returns: { error: ... } (string or object)
            if (result && typeof result === 'object' && 'error' in result) {
                const latency = Date.now() - startedAt;
                return {
                    success: false,
                    status: 'db_error',
                    error: normalizeDbError(result.error),
                    message: 'Database operation failed.',
                    _latency: `${latency}ms`,
                    _meta: { tool: toolId, latency_ms: latency },
                };
            }

            const context = { truncated_items: 0, key_count: 0 };
            const safeResult = /** @type {AnyRecord} */ (sanitizeForAI(result, opts, 0, undefined, context));

            // If tool returned a scalar, wrap it to keep output shape stable
            const payloadObj =
                safeResult && typeof safeResult === 'object' && !Array.isArray(safeResult)
                    ? safeResult
                    : { result: safeResult };

            const payload = safeStringify(payloadObj);
            const payloadChars = payload.length;
            const latency = Date.now() - startedAt;

            if (payloadChars > opts.MAX_OUTPUT_CHARS) {
                const summary = summarizeLargePayload(payloadObj);
                return {
                    success: true,
                    status: 'truncated',
                    message: 'Result too large. Returning summary only.',
                    ...summary,
                    _latency: `${latency}ms`,
                    _meta: {
                        tool: toolId,
                        latency_ms: latency,
                        payload_chars: payloadChars,
                        truncated: true,
                        truncated_items: context.truncated_items || undefined,
                    },
                };
            }

            // Preserve user _meta under _meta_user if present
            if (payloadObj && typeof payloadObj === 'object' && payloadObj._meta) {
                payloadObj._meta_user = payloadObj._meta;
                delete payloadObj._meta;
            }

            return {
                success: true,
                ...payloadObj,
                _latency: `${latency}ms`,
                _meta: {
                    tool: toolId,
                    latency_ms: latency,
                    payload_chars: payloadChars,
                    truncated_items: context.truncated_items || undefined,
                },
            };
        } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);

            const latency = Date.now() - startedAt;
            const msg = err?.message ? String(err.message) : 'Unknown error';

            return {
                success: false,
                status: 'crash',
                error: msg,
                message: `System error in ${toolId}.`,
                _latency: `${latency}ms`,
                _meta: { tool: toolId, latency_ms: latency },
            };
        }
    };

    return tool({ description, parameters, execute: wrappedExecute });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOOL DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create Command Center tools with Supabase client.
 * @param {any} supabase - Supabase client instance
 * @param {Partial<typeof CONFIG_DEFAULTS>} [configOverrides]
 */
export function createCommandCenterTools(supabase, configOverrides) {
    // Fail-closed: tools still exist, but every call returns a stable error payload
    if (!supabase) {
        const dead = createSafeTool({
            name: 'supabase_missing',
            description: 'Supabase client missing.',
            parameters: z.object({}),
            configOverrides,
            execute: async () => ({ error: 'Supabase client missing.' }),
        });

        return {
            debug_system: dead,
            list_templates: dead,
            get_template: dead,
            search_all_candidates: dead,
            resolve_candidate: dead,
            search_prospects: dead,
            search_travel_list: dead,
            get_prospect_details: dead,
            add_prospect: dead,
            update_prospect_status: dead,
            create_campaign: dead,
            add_recipients: dead,
            generate_blast_emails: dead,
        };
    }

    return {
        // ── SYSTEM ─────────────────────────────────────────────────────────────

        debug_system: createSafeTool({
            name: 'debug_system',
            description: 'Check database connectivity and row counts.',
            parameters: z.object({}),
            configOverrides,
            execute: async () => {
                const results = await Promise.allSettled([
                    supabase.from('prospects').select('id', { count: 'estimated', head: true }),
                    supabase.from('travel_candidates').select('id', { count: 'estimated', head: true }),
                    supabase.from('cold_outreach_campaigns').select('id', { count: 'estimated', head: true }),
                ]);

                const [p, t, c] = results;

                const prospectsOk = p.status === 'fulfilled' && !p.value.error;
                const travelersOk = t.status === 'fulfilled' && !t.value.error;
                const campaignsOk = c.status === 'fulfilled' && !c.value.error;

                return {
                    status: 'operational',
                    counts: {
                        prospects: prospectsOk ? p.value.count : 'ERR',
                        travelers: travelersOk ? t.value.count : 'ERR',
                        campaigns: campaignsOk ? c.value.count : 'ERR',
                    },
                    db_ok: prospectsOk && travelersOk && campaignsOk,
                };
            },
        }),

        // ── TEMPLATES ──────────────────────────────────────────────────────────

        list_templates: createSafeTool({
            name: 'list_templates',
            description: `List communication templates.

USE THIS WHEN:
- User asks to list templates or available styles

DO NOT USE THIS WHEN:
- You are mid-draft
- Templates were already listed in this conversation`,
            parameters: z.object({
                category: z.enum(['active', 'prospect', 'retention', 'all']).optional(),
            }),
            configOverrides,
            execute: async ({ category }) => {
                let query = supabase
                    .from('communication_templates')
                    .select('name, category, description, required_variables')
                    .eq('is_active', true);

                if (category && category !== 'all') query = query.eq('category', category);

                const { data, error } = await query.order('category').limit(50);
                if (error) return { error };

                return { templates: data || [], count: data?.length || 0 };
            },
        }),

        get_template: createSafeTool({
            name: 'get_template',
            description: `Retrieve full content of a specific template.`,
            parameters: z.object({ template_name: z.string().min(1) }),
            configOverrides,
            execute: async ({ template_name }) => {
                const { data, error } = await supabase
                    .from('communication_templates')
                    .select('*')
                    .eq('name', template_name)
                    .maybeSingle();

                if (error) return { error };
                if (!data) return { found: false, message: `Template "${template_name}" not found.` };

                return { ...data, usage: 'Replace {{variables}} with actual data.' };
            },
        }),

        // ── SEARCH ─────────────────────────────────────────────────────────────

        search_all_candidates: createSafeTool({
            name: 'search_all_candidates',
            description: `Search prospects and active travelers by name.`,
            parameters: z.object({
                name: z.string().min(1),
            }),
            configOverrides,
            execute: async ({ name }) => {
                const cleanName = name.trim();

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

                const prospectsPayload =
                    prospectsRes.status === 'fulfilled' ? prospectsRes.value : { data: [], error: prospectsRes.reason };
                const travelersPayload =
                    travelersRes.status === 'fulfilled' ? travelersRes.value : { data: [], error: travelersRes.reason };

                // Partial failure handling
                const warnings = [
                    prospectsPayload.error ? 'Prospects query failed.' : null,
                    travelersPayload.error ? 'Travelers query failed.' : null,
                ].filter(Boolean);

                const prospects = prospectsPayload.data ?? [];
                const travelers = travelersPayload.data ?? [];

                const results = [
                    ...prospects.map((p) => ({
                        type: 'Prospect',
                        name: p.name,
                        info: `${p.specialty || 'Unknown'} | ${p.home_state || 'N/A'}`,
                        status: p.status,
                        id: p.candidate_id,
                        link: p.nova_url || buildNovaUrl(p.candidate_id),
                    })),
                    ...travelers.map((t) => ({
                        type: 'Traveler',
                        name: t.candidate_name,
                        info: `${t.facility || 'N/A'}`,
                        status: t.contract_status,
                        id: t.candidate_id,
                        link: buildNovaUrl(t.candidate_id),
                    })),
                ];

                return {
                    results,
                    total_found: results.length,
                    warnings: warnings.length ? warnings : undefined,
                };
            },
        }),

        resolve_candidate: createSafeTool({
            name: 'resolve_candidate',
            description: `Resolve a candidate by name to get their candidate_id, nova_url, and email.

USE THIS WHEN:
- Drafting an email and need to populate Nova link and candidate_id
- User mentions a candidate name and you need their profile link
- Building next steps that require candidate_id

RETURNS: Single best match with candidate_id, name, email, nova_url.`,
            parameters: z.object({
                name: z.string().min(1).describe('Candidate name to lookup'),
            }),
            configOverrides,
            execute: async ({ name }) => {
                const cleanName = name.trim();

                // Search prospects first (most common source)
                const { data: prospects, error: pErr } = await supabase
                    .from('prospects')
                    .select('candidate_id, name, email, nova_url, specialty, status')
                    .ilike('name', `%${cleanName}%`)
                    .limit(5);

                if (pErr) {
                    return { error: pErr.message, found: false };
                }

                // Find best match: exact match first, then partial
                const exactMatch = prospects?.find(
                    (p) => p.name?.toLowerCase() === cleanName.toLowerCase()
                );
                const bestMatch = exactMatch || prospects?.[0];

                if (!bestMatch) {
                    // Fallback to travelers
                    const { data: travelers, error: tErr } = await supabase
                        .from('travel_candidates')
                        .select('candidate_id, candidate_name, email')
                        .ilike('candidate_name', `%${cleanName}%`)
                        .limit(3);

                    if (tErr || !travelers?.length) {
                        return { found: false, searched_name: cleanName };
                    }

                    const traveler = travelers[0];
                    return {
                        found: true,
                        candidate_id: traveler.candidate_id,
                        name: traveler.candidate_name,
                        email: traveler.email || null,
                        nova_url: buildNovaUrl(traveler.candidate_id),
                        source: 'travelers',
                    };
                }

                return {
                    found: true,
                    candidate_id: bestMatch.candidate_id,
                    name: bestMatch.name,
                    email: bestMatch.email || null,
                    nova_url: bestMatch.nova_url || buildNovaUrl(bestMatch.candidate_id),
                    specialty: bestMatch.specialty || null,
                    status: bestMatch.status || null,
                    source: 'prospects',
                };
            },
        }),

        search_prospects: createSafeTool({
            name: 'search_prospects',
            description: `Search the prospect pipeline with filters.`,
            parameters: z.object({
                name: z.string().optional(),
                specialty: z.string().optional(),
                home_state: z.string().optional(),
                status: z.enum(['New', 'Contacted', 'Interested', 'Passive', 'Rotation']).optional(),
            }),
            configOverrides,
            execute: async ({ name, specialty, home_state, status }) => {
                let query = supabase.from('prospects').select('candidate_id, name, specialty, home_state, status, nova_url');

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
            description: `Search active travelers for current contractors.`,
            parameters: z.object({
                name: z.string().optional(),
                facility: z.string().optional(),
                ending_soon: z.boolean().optional().describe('Filter for contracts ending within 30 days'),
            }),
            configOverrides,
            execute: async ({ name, facility, ending_soon }) => {
                let query = supabase
                    .from('travel_candidates')
                    .select('candidate_id, candidate_name, facility, start_date, end_date, contract_status');

                if (name) query = query.ilike('candidate_name', `%${name.trim()}%`);
                if (facility) query = query.ilike('facility', `%${facility.trim()}%`);

                if (ending_soon) {
                    const startIso = isoDateOnly(new Date());
                    const endIso = isoDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
                    query = query.gte('end_date', startIso).lte('end_date', endIso);
                }

                const { data, error } = await query.limit(20);
                if (error) return { error };

                return { travelers: data || [], count: data?.length || 0 };
            },
        }),

        get_prospect_details: createSafeTool({
            name: 'get_prospect_details',
            description: `Retrieve full profile details for a candidate.`,
            parameters: z.object({
                nova_id: z.number().optional(),
                name: z.string().optional(),
            }),
            configOverrides,
            execute: async ({ nova_id, name }) => {
                if (!nova_id && !name) return { error: 'Provide nova_id or name.' };

                // 1) Prospects
                let pQuery = supabase.from('prospects').select('*');
                if (nova_id) pQuery = pQuery.eq('candidate_id', nova_id);
                else pQuery = pQuery.ilike('name', `%${name.trim()}%`);

                const { data: prospect, error: pErr } = await pQuery.maybeSingle();
                if (pErr) return { error: pErr };
                if (prospect) return { ...prospect, source: 'prospect' };

                // 2) Travelers
                let tQuery = supabase.from('travel_candidates').select('*');
                if (nova_id) tQuery = tQuery.eq('candidate_id', nova_id);
                else tQuery = tQuery.ilike('candidate_name', `%${name.trim()}%`);

                const { data: traveler, error: tErr } = await tQuery.maybeSingle();
                if (tErr) return { error: tErr };
                if (traveler) return { ...traveler, source: 'active_traveler' };

                return { found: false, message: 'Candidate not found.' };
            },
        }),

        // ── PROSPECT MANAGEMENT ────────────────────────────────────────────────

        add_prospect: createSafeTool({
            name: 'add_prospect',
            description: `Create or update a prospect record in the pipeline.`,
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
            configOverrides,
            execute: async ({ name, nova_id, nova_url, specialty, home_state, email, phone, notes }) => {
                let resolvedNovaId = nova_id;
                let resolvedNovaUrl = nova_url;

                if (!resolvedNovaId && nova_url) {
                    const match = nova_url.match(/\/candidates\/(\d+)/);
                    if (match) resolvedNovaId = Number.parseInt(match[1], 10);
                }

                if (!resolvedNovaId || !Number.isFinite(resolvedNovaId)) {
                    return { error: 'Nova ID required. Provide Nova ID or Profile URL.' };
                }

                if (!resolvedNovaUrl) resolvedNovaUrl = buildNovaUrl(resolvedNovaId);

                // Upsert prevents duplicate candidate rows (idempotent)
                const { data, error } = await supabase
                    .from('prospects')
                    .upsert(
                        {
                            name: name.trim(),
                            specialty,
                            home_state,
                            email,
                            phone,
                            notes,
                            status: 'New',
                            candidate_id: resolvedNovaId,
                            nova_url: resolvedNovaUrl,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: 'candidate_id' }
                    )
                    .select()
                    .single();

                if (error) return { error };
                return { action: 'PROSPECT_UPSERTED', prospect: data };
            },
        }),

        update_prospect_status: createSafeTool({
            name: 'update_prospect_status',
            description: `Move candidate to a different pipeline stage.`,
            parameters: z.object({
                nova_id: z.number(),
                new_status: z.enum(['New', 'Contacted', 'Interested', 'Passive', 'Rotation']),
                reason: z.string().optional(),
            }),
            configOverrides,
            execute: async ({ nova_id, new_status, reason }) => {
                const { data: current, error: cErr } = await supabase
                    .from('prospects')
                    .select('status, notes, name')
                    .eq('candidate_id', nova_id)
                    .maybeSingle();

                if (cErr) return { error: cErr };
                if (!current) return { error: 'Prospect not found.' };

                const stamp = isoDateOnly(new Date());
                const auditEntry = reason
                    ? `[${stamp}] ${current.status} -> ${new_status}: ${reason}`
                    : `[${stamp}] ${current.status} -> ${new_status}`;

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
                position_title: z.string().min(1),
                facility_name: z.string().min(1),
                city: z.string().min(1),
                state: z.string().min(2),
                start_date: z.string().min(1),
                end_date: z.string().min(1),
                gross_weekly_pay: z.coerce.number(),
                job_id: z.string().optional(),
            }),
            configOverrides,
            execute: async (args) => {
                const { data, error } = await supabase
                    .from('cold_outreach_campaigns')
                    .insert({
                        ...args,
                        state: String(args.state).toUpperCase().slice(0, 2),
                        status: 'draft',
                        updated_at: new Date().toISOString(),
                    })
                    .select('id, position_title')
                    .single();

                if (error) return { error };
                return { action: 'CAMPAIGN_CREATED', campaign_id: data.id, next_steps: ['add_recipients'] };
            },
        }),

        add_recipients: createSafeTool({
            name: 'add_recipients',
            description: 'Add recipients to a campaign from text/CSV.',
            parameters: z.object({
                campaign_id: z.string().uuid(),
                raw_text: z.string().min(1),
            }),
            configOverrides,
            execute: async ({ campaign_id, raw_text }) => {
                const { data: c, error: cErr } = await supabase
                    .from('cold_outreach_campaigns')
                    .select('id')
                    .eq('id', campaign_id)
                    .maybeSingle();

                if (cErr) return { error: cErr };
                if (!c) return { error: 'Campaign not found.' };

                const lines = raw_text
                    .split(/[\n\r]+/)
                    .map((l) => l.trim())
                    .filter(Boolean);

                const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;

                // Deduplicate emails
                const dedup = new Set();
                const candidates = [];

                for (const line of lines) {
                    const match = line.match(emailRegex);
                    if (!match) continue;

                    const email = match[0].toLowerCase().trim();
                    if (dedup.has(email)) continue;
                    dedup.add(email);

                    const namePart = line
                        .replace(match[0], '')
                        .replace(/[,;\t|<>]+/g, ' ')
                        .replace(/^[\d\s.-]+/, '')
                        .trim();

                    const parts = namePart.split(/\s+/).filter(Boolean);

                    candidates.push({
                        campaign_id,
                        first_name: parts[0] || 'Unknown',
                        last_name: parts.slice(1).join(' ') || null,
                        email,
                        email_normalized: email,
                        status: 'pending',
                        updated_at: new Date().toISOString(),
                    });
                }

                if (!candidates.length) return { error: 'No valid emails found.' };

                const { data, error } = await supabase
                    .from('cold_outreach_recipients')
                    .upsert(candidates, { onConflict: 'campaign_id,email_normalized', ignoreDuplicates: true })
                    .select('id');

                if (error) return { error };

                return { action: 'RECIPIENTS_ADDED', added: data?.length || 0 };
            },
        }),

        generate_blast_emails: createSafeTool({
            name: 'generate_blast_emails',
            description: 'Generate personalized emails for pending recipients.',
            parameters: z.object({
                campaign_id: z.string().uuid(),
            }),
            configOverrides,
            execute: async ({ campaign_id }) => {
                const { data: campaign, error: campErr } = await supabase
                    .from('cold_outreach_campaigns')
                    .select('*, template:communication_templates(*)')
                    .eq('id', campaign_id)
                    .maybeSingle();

                if (campErr) return { error: campErr };
                if (!campaign) return { error: 'Campaign not found.' };

                const { data: recipients, error: rErr } = await supabase
                    .from('cold_outreach_recipients')
                    .select('id, first_name, last_name')
                    .eq('campaign_id', campaign_id)
                    .eq('status', 'pending')
                    .limit(100);

                if (rErr) return { error: rErr };
                if (!recipients?.length) return { message: 'No pending recipients.' };

                const subjectTemplate = campaign.template?.subject_template || 'Opportunity: {{position_title}}';
                const bodyTemplate =
                    campaign.template?.body_template || 'Hi {{first_name}},\n\n{{custom_hook}}\n\nPay: {{gross_weekly_pay}}';

                // CRITICAL: Use pickCampaignVars to avoid leaking nested objects
                const baseVars = pickCampaignVars(campaign);

                const updates = recipients.map((r) => {
                    const vars = { ...baseVars, ...r };

                    const generated_subject = safeTemplateReplace(subjectTemplate, vars);
                    const generated_body = safeTemplateReplace(bodyTemplate, vars);

                    return {
                        id: r.id,
                        campaign_id,
                        generated_subject,
                        generated_body,
                        status: 'generated',
                        updated_at: new Date().toISOString(),
                    };
                });

                const { error: upErr } = await supabase.from('cold_outreach_recipients').upsert(updates);
                if (upErr) return { error: upErr };

                const { error: statusErr } = await supabase
                    .from('cold_outreach_campaigns')
                    .update({ status: 'ready', updated_at: new Date().toISOString() })
                    .eq('id', campaign_id);

                if (statusErr) return { error: statusErr };

                return { action: 'EMAILS_GENERATED', generated: updates.length };
            },
        }),
    };
}

export default { createCommandCenterTools };
