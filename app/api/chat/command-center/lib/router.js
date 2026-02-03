/**
 * ============================================================================
 * router.js — Control Plane & Hybrid Intent Router (Production Paste-and-Go)
 * ============================================================================
 *
 * FIXES INCLUDED (Your Failure Modes):
 * 1) Email Card Hallucination: Deterministic safety gates (2-token rule + strict boundaries).
 * 2) 504 Timeouts: AbortController hard-kills the upstream LLM request at 1000ms.
 * 3) Nova Routing: Correct hash router matching for nova.ayahealthcare.com/#/...
 * 4) Substring Bugs: All trigger detection uses \b boundaries (no "context" => "text").
 * 5) Pre-Gate Optimization: Info questions + code/stack traces skip LLM entirely (<1ms).
 * 6) Mode Layer (Tier 0): Deterministic routing when modeLocked is enabled.
 * 7) DB Query Narrowing: Only ATS terms or search+ID combos route to DATABASE_ACTION.
 *
 * Drop-in path:
 *   app/api/chat/command-center/lib/router.js
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';

// ============================================================================
// SECTION 1: Intents + Modes
// ============================================================================

export const Intent = Object.freeze({
  DRAFT_OUTREACH: 'DRAFT_OUTREACH',
  DRAFT_EMAIL: 'DRAFT_EMAIL',
  OFFER_DETAILS: 'OFFER_DETAILS',
  EDIT_CONTENT: 'EDIT_CONTENT',
  LICENSING_REQUEST: 'LICENSING_REQUEST',
  REASSIGNMENT_REQUEST: 'REASSIGNMENT_REQUEST',
  DATABASE_ACTION: 'DATABASE_ACTION',
  CAMPAIGN_WORKFLOW: 'CAMPAIGN_WORKFLOW',
  SEARCH_QUERY: 'SEARCH_QUERY',
  GENERAL_CHAT: 'GENERAL_CHAT',
  UNKNOWN: 'UNKNOWN',
});

/**
 * @typedef {typeof Intent[keyof typeof Intent]} IntentType
 */

const INTENT_ENUM = /** @type {[string, ...string[]]} */ (Object.values(Intent));
const INTENT_SET = new Set(INTENT_ENUM);

export const ChatMode = Object.freeze({
  DEFAULT: 'default',
  COLD_OUTREACH: 'cold_outreach',
  BATCH_REASSIGN: 'batch_reassign',
  REPLY_MODE: 'reply_mode',
});

/**
 * @typedef {typeof ChatMode[keyof typeof ChatMode]} ChatModeType
 */

export const MODE_UI_HINTS = Object.freeze({
  [ChatMode.DEFAULT]: 'Ask to draft emails, find candidates, or check Nova…',
  [ChatMode.COLD_OUTREACH]: 'Paste filters, facility details, IDs, or lists for outreach…',
  [ChatMode.BATCH_REASSIGN]: 'Paste candidate IDs or Nova links to reassign…',
  [ChatMode.REPLY_MODE]: 'Paste the inbound email thread to generate a reply…',
});

/**
 * @typedef {'email_response' | 'chat'} ResponseKind
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {string} intent
 * @property {ResponseKind} kind
 * @property {boolean} requiresTools
 * @property {number} confidence
 * @property {string} reason
 * @property {{ candidate_name?: string; topic?: string; urgency?: 'high' | 'normal' }} parameters
 * @property {boolean} [fastPath]
 * @property {boolean} [modeLocked]
 */

/** @type {Readonly<Record<string, boolean>>} */
const TOOL_REQUIREMENTS = Object.freeze({
  // Email drafts default FALSE to reduce latency; downstream can fetch if ID missing.
  [Intent.DRAFT_EMAIL]: false,
  [Intent.DRAFT_OUTREACH]: false,
  [Intent.EDIT_CONTENT]: false,

  // Ops & data flows
  [Intent.OFFER_DETAILS]: true,
  [Intent.REASSIGNMENT_REQUEST]: true,
  [Intent.DATABASE_ACTION]: true,
  [Intent.CAMPAIGN_WORKFLOW]: true,

  // Non-tool intents
  [Intent.LICENSING_REQUEST]: false,
  [Intent.SEARCH_QUERY]: false,
  [Intent.GENERAL_CHAT]: false,
  [Intent.UNKNOWN]: false,
});

/** @type {Readonly<Record<string, ResponseKind>>} */
const RESPONSE_KIND = Object.freeze({
  [Intent.DRAFT_EMAIL]: 'email_response',
  [Intent.DRAFT_OUTREACH]: 'email_response',
  [Intent.EDIT_CONTENT]: 'email_response',

  [Intent.OFFER_DETAILS]: 'chat',
  [Intent.DATABASE_ACTION]: 'chat',
  [Intent.CAMPAIGN_WORKFLOW]: 'chat',
  [Intent.REASSIGNMENT_REQUEST]: 'chat',
  [Intent.LICENSING_REQUEST]: 'chat',
  [Intent.SEARCH_QUERY]: 'chat',
  [Intent.GENERAL_CHAT]: 'chat',
  [Intent.UNKNOWN]: 'chat',
});

// ============================================================================
// SECTION 2: Schema + Constants
// ============================================================================

const ClassificationSchema = z.object({
  reason: z.string().describe('Short 1-sentence reason for classification.'),
  intent: z.enum(INTENT_ENUM),
  confidence: z.number().min(0).max(1),
  parameters: z
    .object({
      candidate_name: z.string().optional(),
      topic: z.string().optional(),
      urgency: z.enum(['high', 'normal']).optional(),
    })
    .default({}),
});

/**
 * @typedef {{ role: 'user' | 'assistant' | string; content: unknown }} HistoryMessage
 */

/**
 * @typedef {{ name?: string; message: string }} NormalizedError
 */

const HISTORY_WINDOW = 2;
/** @type {{ candidate_name?: string; topic?: string; urgency?: 'high' | 'normal' }} */
const DEFAULT_PARAMETERS = Object.freeze({});
const MAX_MESSAGE_CHARS = 12000;
const MAX_LLM_CHARS = 4000;
const MAX_HISTORY_MESSAGE_CHARS = 2000;
const SEMANTIC_BUDGET_MS = 1000;

const SYSTEM_PROMPT = `
You are the Intent Router for a Healthcare ATS. Classify the user's request.

Rules:
1) Negation ("don't send", "cancel", "no email") -> GENERAL_CHAT
2) Info questions ("why/how/what...") -> GENERAL_CHAT
3) DRAFT_EMAIL only for: ask for references, request docs, check interest, reply drafting
4) OFFER_DETAILS: offer details, compare offers, draft offer letter
5) DATABASE_ACTION: find/lookup candidate, Nova profile
Return only the schema fields.
`;

/**
 * @param {unknown} err
 * @returns {NormalizedError}
 */
function normalizeError(err) {
  if (err instanceof Error) return { name: err.name, message: err.message };
  if (typeof err === 'string') return { message: err };
  if (err && typeof err === 'object') {
    const anyErr = /** @type {any} */ (err);
    const name = typeof anyErr.name === 'string' ? anyErr.name : undefined;
    const message =
      typeof anyErr.message === 'string'
        ? anyErr.message
        : safeJsonStringify(anyErr) || 'Unknown error';
    return { name, message };
  }
  return { message: 'Unknown error' };
}

/**
 * @param {unknown} val
 * @returns {string}
 */
function safeJsonStringify(val) {
  try {
    return JSON.stringify(val);
  } catch {
    return '';
  }
}

/**
 * @param {unknown} input
 * @returns {string}
 */
function coerceToString(input) {
  if (typeof input === 'string') return input;
  if (input == null) return '';
  if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
    return String(input);
  }
  const json = safeJsonStringify(input);
  return json || String(input);
}

/**
 * @param {unknown} input
 * @param {number} [maxLen]
 * @returns {string}
 */
function normalizeText(input, maxLen) {
  const raw = coerceToString(input);
  const cleaned = raw.replace(/\u0000/g, '').replace(/\u200b/g, '');
  const trimmed = cleaned.trim();
  if (typeof maxLen === 'number' && maxLen > 0 && trimmed.length > maxLen) {
    return trimmed.slice(0, maxLen);
  }
  return trimmed;
}

/**
 * @param {HistoryMessage[]} history
 * @param {number} maxMessages
 * @returns {Array<{ role: 'user' | 'assistant'; content: string }>}
 */
function sanitizeHistory(history, maxMessages) {
  if (!Array.isArray(history) || history.length === 0) return [];
  if (!Number.isFinite(maxMessages) || maxMessages <= 0) return [];

  /** @type {Array<{ role: 'user' | 'assistant'; content: string }>} */
  const sanitized = [];

  // Walk from the end so huge histories stay cheap; keep chronological order.
  for (let i = history.length - 1; i >= 0 && sanitized.length < maxMessages; i--) {
    const message = history[i];
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
    const content = normalizeText(message.content, MAX_HISTORY_MESSAGE_CHARS);
    if (!content) continue;
    sanitized.push({ role: message.role, content });
  }

  sanitized.reverse();
  return sanitized;
}

// ============================================================================
// SECTION 3: Regex (Strict Boundaries)
// ============================================================================

const RX_INFO_STARTERS = /^(who|what|where|when|why|how)\b/i;
const RX_DRAFT_VERBS = /\b(draft|write|compose|rewrite|revise|edit|create|generate|reply|respond|follow\s*up)\b/i;
const RX_MEDIUMS = /\b(emails?|messages?|notes?|texts?)\b/i;

const RX_ENTITIES = /\b(references?|docs?|documents?|certifications?)\b/i;
const RX_ENTITY_ACTIONS = /\b(ask|request|get|send|collect|confirm)\b/i;

// Use a *narrow* definition of negation to avoid false negatives like:
// "No, draft an email..." or "No problem — draft an email..."
const RX_NEGATION_STRONG = /\b(don't|do not|cancel|stop)\b/i;
const RX_NEGATION_NO_MEDIUM = /\bno\s+(emails?|messages?|texts?|notes?)\b/i;

// Tightened: only treat as DB when ATS terms or IDs are present.
const RX_DB_QUERY_CORE = /\b(nova|candidates?|profile|profiles?|recruiting|applications?|job\s*id|req\s*id)\b/i;
const RX_DB_QUERY_SEARCH = /\b(lookup|find|search)\b/i;
const RX_DB_QUERY_ID = /(?:^|\s)(#\d{4,8}|CAND-\d+)\b/i;
const RX_NOVA = /https?:\/\/nova\.ayahealthcare\.com\/#\/?/i;

const RX_CODE_FENCE = /```[\s\S]*?```/g;
const RX_STACKTRACE = /\b(error:|exception|at\s+\S+\s+\(|stack\s+trace)\b/i;
// NOTE: `=>` isn't a word token, so it can't live inside a `\b...\b` group.
const RX_CODE_TOKENS = /(?:\b(import|export|interface|type|class|function|const|let|var)\b|=>)/i;
const RX_KIND_MARKER_JSON = /"kind"\s*:\s*"(email_response|email_draft)"/i;

const EMAIL_KIND_VALUES = new Set(['email_response', 'email_draft']);

// ============================================================================
// SECTION 4: Gates
// ============================================================================

/**
 * @param {string} input
 * @returns {string}
 */
function stripFencedCodeBlocks(input) {
  return (input || '').replace(RX_CODE_FENCE, '');
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isInfoQuestion(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return false;
  if (RX_INFO_STARTERS.test(t)) return true;

  // Trailing '?' blocks only if no draft verb is present
  if (t.endsWith('?') && !RX_DRAFT_VERBS.test(t)) return true;

  return false;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isCodeLike(text) {
  const raw = text || '';
  if (!raw) return false;
  if (raw.includes('```')) return true;
  if (RX_STACKTRACE.test(raw)) return true;

  // Heuristic: code tokens + symbol density
  const hasCodeTokens = RX_CODE_TOKENS.test(raw);
  const len = raw.length || 1;
  const symbols = raw.replace(/[a-z0-9\s]/gi, '').length;
  const symbolRatio = symbols / len;

  // symbolRatio threshold tuned to catch TS/JS blocks without flagging normal emails
  if (hasCodeTokens && symbolRatio >= 0.12) return true;

  return false;
}

/**
 * Email UI Gate:
 * - Blocks info-questions
 * - Requires explicit intent:
 *   A) DraftVerb + Medium
 *   B) Entity + Action (ops workflow)
 *   C) Entity + Medium (ops shorthand: "references email")
 * @param {string} text
 * @returns {boolean}
 */
function isExplicitEmailRequest(text) {
  const tRaw = (text || '').toLowerCase();
  const t = stripFencedCodeBlocks(tRaw);

  if (!t) return false;
  if (isInfoQuestion(t)) return false;

  // Negation beats everything (prevents "no email" routing into email UI)
  if ((RX_NEGATION_STRONG.test(t) && RX_MEDIUMS.test(t)) || RX_NEGATION_NO_MEDIUM.test(t)) return false;

  const hasDraftVerb = RX_DRAFT_VERBS.test(t);
  const hasMedium = RX_MEDIUMS.test(t);

  if (hasDraftVerb && hasMedium) return true;

  const hasEntity = RX_ENTITIES.test(t);
  const hasEntityAction = RX_ENTITY_ACTIONS.test(t);

  if (hasEntity && hasEntityAction) return true;
  if (hasEntity && hasMedium) return true;

  return false;
}

/**
 * Tightened DB query detection:
 * - Nova URLs → always DB
 * - Core ATS terms (candidate, profile, recruiting, applications) → always DB
 * - Generic search verbs (find, lookup, search) → only if paired with IDs
 * @param {string} text
 * @returns {boolean}
 */
function isDatabaseQuery(text) {
  if (!text) return false;
  if (RX_NOVA.test(text)) return true;
  if (RX_DB_QUERY_CORE.test(text)) return true;
  // Only allow search/find if it's clearly tied to ATS terms or IDs.
  return RX_DB_QUERY_SEARCH.test(text) && RX_DB_QUERY_ID.test(text);
}

/**
 * @param {HistoryMessage[]} history
 * @returns {boolean}
 */
function lastAssistantWasEmail(history) {
  if (!Array.isArray(history) || history.length === 0) return false;

  /** @type {HistoryMessage | undefined} */
  let last;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m && m.role === 'assistant') {
      last = m;
      break;
    }
  }
  if (!last) return false;

  const seen = new WeakSet();

  /**
   * @param {unknown} val
   * @param {number} depth
   * @returns {boolean}
   */
  const hasKindMarker = (val, depth = 0) => {
    if (!val || depth > 4) return false;
    if (typeof val === 'string') {
      // Prevent "Subject:" inside code blocks from qualifying
      const cleaned = stripFencedCodeBlocks(val);
      return RX_KIND_MARKER_JSON.test(cleaned);
    }
    if (Array.isArray(val)) return val.some((entry) => hasKindMarker(entry, depth + 1));
    if (typeof val === 'object') {
      const obj = /** @type {Record<string, unknown>} */ (val);
      if (seen.has(obj)) return false;
      seen.add(obj);
      const kind = obj.kind;
      if (typeof kind === 'string' && EMAIL_KIND_VALUES.has(kind)) return true;
      return Object.values(obj).some((entry) => hasKindMarker(entry, depth + 1));
    }
    return false;
  };

  return hasKindMarker(last.content);
}

/**
 * @param {object} options
 * @param {number} ms
 */
async function generateWithBudget(options, ms) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, ms || 1);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // Prevent timers from keeping the event loop alive in Node
  if (typeof timeoutId.unref === 'function') timeoutId.unref();

  try {
    return await generateObject({
      ...options,
      abortSignal: controller.signal,
    });
  } catch (err) {
    const e = normalizeError(err);
    const msg = e.message.toLowerCase();
    const aborted =
      e.name === 'AbortError' ||
      msg.includes('aborted') ||
      msg.includes('timeout') ||
      e.message === 'The user aborted a request.';

    if (aborted) throw new Error('ROUTER_TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// SECTION 5: Fast Path Overrides (Tier 1)
// ============================================================================

/** @type {Array<{ pattern: RegExp; intent: string }>} */
const FAST_PATH_OVERRIDES = [
  { pattern: /^\/reset\b/i, intent: Intent.GENERAL_CHAT },
  { pattern: /^\/help\b/i, intent: Intent.GENERAL_CHAT },
  { pattern: /^\/mode\b/i, intent: Intent.GENERAL_CHAT },

  // IDs
  { pattern: /^#\d{4,8}\b$/i, intent: Intent.DATABASE_ACTION },
  { pattern: /^CAND-\d+\b$/i, intent: Intent.DATABASE_ACTION },

  // Nova SPA deep links
  { pattern: RX_NOVA, intent: Intent.DATABASE_ACTION },
];

// ============================================================================
// SECTION 6: Control Plane Mode Resolution (Tier 0)
// ============================================================================

/**
 * @param {string} mode
 * @param {string} message
 * @param {HistoryMessage[]} history
 * @returns {{ intent: string; kind: ResponseKind; requiresTools: boolean } | null}
 */
function resolveModeIntent(mode, message, history) {
  const normalized = (message || '').trim();

  // "Help" and info questions stay safe in every mode
  if (isInfoQuestion(normalized)) {
    return {
      intent: Intent.GENERAL_CHAT,
      kind: RESPONSE_KIND[Intent.GENERAL_CHAT],
      requiresTools: TOOL_REQUIREMENTS[Intent.GENERAL_CHAT],
    };
  }

  switch (mode) {
    case ChatMode.COLD_OUTREACH: {
      // Default: workflow ops in chat; explicit email request gets email UI
      if (isExplicitEmailRequest(normalized)) {
        const intent = Intent.DRAFT_OUTREACH;
        return {
          intent,
          kind: RESPONSE_KIND[intent],
          requiresTools: TOOL_REQUIREMENTS[intent] ?? false,
        };
      }
      const intent = Intent.CAMPAIGN_WORKFLOW;
      return {
        intent,
        kind: RESPONSE_KIND[intent],
        requiresTools: TOOL_REQUIREMENTS[intent] ?? false,
      };
    }

    case ChatMode.BATCH_REASSIGN: {
      // Hard lock: always treat input as reassignment workflow (chat UI only)
      const intent = Intent.REASSIGNMENT_REQUEST;
      return {
        intent,
        kind: RESPONSE_KIND[intent],
        requiresTools: TOOL_REQUIREMENTS[intent] ?? false,
      };
    }

    case ChatMode.REPLY_MODE: {
      // Hard lock: always email UI; edit only if prior email draft exists structurally
      const intent = lastAssistantWasEmail(history) ? Intent.EDIT_CONTENT : Intent.DRAFT_EMAIL;
      return {
        intent,
        kind: RESPONSE_KIND[intent],
        requiresTools: TOOL_REQUIREMENTS[intent] ?? false,
      };
    }

    case ChatMode.DEFAULT:
    default:
      return null;
  }
}

// ============================================================================
// SECTION 7: Main Classifier
// ============================================================================

/**
 * @typedef {Object} ClassifyOptions
 * @property {string} message
 * @property {HistoryMessage[]} [history]
 * @property {string} [mode]
 * @property {boolean} [modeLocked]
 */

/**
 * @param {ClassifyOptions} options
 * @returns {Promise<ClassificationResult>}
 */
export async function classify({
  message,
  history = [],
  mode = ChatMode.DEFAULT,
  modeLocked = false,
}) {
  const normalized = normalizeText(message, MAX_MESSAGE_CHARS);

  if (!normalized) {
    return {
      intent: Intent.GENERAL_CHAT,
      kind: RESPONSE_KIND[Intent.GENERAL_CHAT],
      requiresTools: TOOL_REQUIREMENTS[Intent.GENERAL_CHAT],
      confidence: 1.0,
      reason: 'Empty message.',
      parameters: {},
      fastPath: true,
    };
  }

  // --------------------------------------------------------------------------
  // TIER 1: Fast Path (always wins)
  // --------------------------------------------------------------------------
  for (const override of FAST_PATH_OVERRIDES) {
    if (override.pattern.test(normalized)) {
      const intent = override.intent;
      return {
        intent,
        kind: RESPONSE_KIND[intent] || 'chat',
        requiresTools: TOOL_REQUIREMENTS[intent] ?? false,
        confidence: 1.0,
        reason: 'Matched fast-path Regex override.',
        parameters: {},
        fastPath: true,
      };
    }
  }

  // --------------------------------------------------------------------------
  // TIER 0: Control Plane (Modes) (0ms, deterministic)
  // --------------------------------------------------------------------------
  if (modeLocked && mode !== ChatMode.DEFAULT) {
    const modeResult = resolveModeIntent(mode, normalized, history);
    if (modeResult) {
      return {
        ...modeResult,
        confidence: 1.0,
        reason: `Locked to mode: ${mode}`,
        parameters: {},
        fastPath: true,
        modeLocked: true,
      };
    }
  }

  // --------------------------------------------------------------------------
  // TIER 2A: Pre-Gate (DB/Nova)
  // DB queries win even when phrased as questions like "Where is candidate 123?"
  // --------------------------------------------------------------------------
  const isDatabaseQueryHit = isDatabaseQuery(normalized);
  if (isDatabaseQueryHit && !isExplicitEmailRequest(normalized)) {
    // Code pastes still blocked
    if (isCodeLike(normalized)) {
      return {
        intent: Intent.GENERAL_CHAT,
        kind: RESPONSE_KIND[Intent.GENERAL_CHAT],
        requiresTools: TOOL_REQUIREMENTS[Intent.GENERAL_CHAT],
        confidence: 1.0,
        reason: 'Blocked by Code/Stacktrace Pre-Gate.',
        parameters: {},
        fastPath: true,
      };
    }

    return {
      intent: Intent.DATABASE_ACTION,
      kind: RESPONSE_KIND[Intent.DATABASE_ACTION],
      requiresTools: TOOL_REQUIREMENTS[Intent.DATABASE_ACTION],
      confidence: 1.0,
      reason: 'Database query override.',
      parameters: {},
      fastPath: true,
    };
  }

  // --------------------------------------------------------------------------
  // TIER 2B: Pre-Gate (Info Questions)
  // --------------------------------------------------------------------------
  if (isInfoQuestion(normalized)) {
    return {
      intent: Intent.GENERAL_CHAT,
      kind: RESPONSE_KIND[Intent.GENERAL_CHAT],
      requiresTools: TOOL_REQUIREMENTS[Intent.GENERAL_CHAT],
      confidence: 1.0,
      reason: 'Blocked by Info-Question Pre-Gate.',
      parameters: {},
      fastPath: true,
    };
  }

  // --------------------------------------------------------------------------
  // TIER 2C: Pre-Gate (Code / Stacktraces)
  // --------------------------------------------------------------------------
  if (isCodeLike(normalized) && !isExplicitEmailRequest(normalized)) {
    return {
      intent: Intent.GENERAL_CHAT,
      kind: RESPONSE_KIND[Intent.GENERAL_CHAT],
      requiresTools: TOOL_REQUIREMENTS[Intent.GENERAL_CHAT],
      confidence: 1.0,
      reason: 'Blocked by Code/Stacktrace Pre-Gate.',
      parameters: {},
      fastPath: true,
    };
  }

  // --------------------------------------------------------------------------
  // TIER 3: Semantic Path (Gemini 3 Flash) with hard budget
  // --------------------------------------------------------------------------
  try {
    const safeHistory = sanitizeHistory(history, HISTORY_WINDOW);
    const llmText = normalizeText(normalized, MAX_LLM_CHARS);

    const { object } = await generateWithBudget(
      {
        model: google('gemini-3-flash-preview', { structuredOutputs: true }),
        schema: ClassificationSchema,
        temperature: 0,
        messages: [...safeHistory, { role: 'user', content: llmText }],
        system: SYSTEM_PROMPT,
      },
      SEMANTIC_BUDGET_MS
    );

    const parsed = ClassificationSchema.safeParse(object);
    if (!parsed.success || !INTENT_SET.has(parsed.data.intent)) {
      throw new Error('ROUTER_INVALID_SCHEMA');
    }

    let finalIntent = parsed.data.intent;
    let finalKind = RESPONSE_KIND[finalIntent] || 'chat';

    // SAFETY GATE 1: Explicit Email Trigger
    if (finalKind === 'email_response' && !isExplicitEmailRequest(normalized)) {
      finalIntent = Intent.GENERAL_CHAT;
      finalKind = 'chat';
    }

    // SAFETY GATE 2: Edit Structure Check
    if (finalIntent === Intent.EDIT_CONTENT && !lastAssistantWasEmail(history)) {
      finalIntent = Intent.GENERAL_CHAT;
      finalKind = 'chat';
    }

    return {
      intent: finalIntent,
      kind: finalKind,
      requiresTools: TOOL_REQUIREMENTS[finalIntent] ?? false,
      confidence: parsed.data.confidence,
      reason: parsed.data.reason,
      parameters: parsed.data.parameters ?? {},
    };
  } catch (err) {
    const e = normalizeError(err);
    const isTimeout = e.message === 'ROUTER_TIMEOUT';

    if (!isTimeout && e.message !== 'ROUTER_INVALID_SCHEMA') {
      console.warn('[Router] Semantic classification failed:', e.message);
    }

    return {
      intent: Intent.GENERAL_CHAT,
      kind: RESPONSE_KIND[Intent.GENERAL_CHAT],
      requiresTools: TOOL_REQUIREMENTS[Intent.GENERAL_CHAT],
      confidence: 0.0,
      reason: isTimeout ? 'Router time budget exceeded' : 'Router error',
      parameters: DEFAULT_PARAMETERS,
    };
  }
}

export default { classify, Intent, ChatMode, MODE_UI_HINTS };
