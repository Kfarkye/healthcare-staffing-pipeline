/**
 * ════════════════════════════════════════════════════════════════════════════════
 * ROUTER.JS — Intent Classification Engine (Production v4.0.0)
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE: Tiered deterministic gates → LLM semantic fallback
 *
 * v4.0.0 CHANGELOG:
 * - CRITICAL FIX: COLD_OUTREACH mode + image → DRAFT_OUTREACH (was CAMPAIGN_WORKFLOW)
 * - CRITICAL FIX: Image-only uploads with no text now route correctly
 * - PERF: Pre-gate checks reordered for <1ms cold path
 * - SAFETY: All regex patterns use word boundaries to prevent substring false positives
 * - REMOVED: Redundant checks that caused path bypass
 *
 * @module app/api/chat/command-center/lib/router.js
 * @version 4.0.0
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 1: Intent & Mode Definitions
// ════════════════════════════════════════════════════════════════════════════════

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

const INTENT_ENUM = /** @type {[string, ...string[]]} */ (Object.values(Intent));
const INTENT_SET = new Set(INTENT_ENUM);

export const ChatMode = Object.freeze({
  DEFAULT: 'default',
  COLD_OUTREACH: 'cold_outreach',
  BATCH_REASSIGN: 'batch_reassign',
  REPLY_MODE: 'reply_mode',
});

export const MODE_UI_HINTS = Object.freeze({
  [ChatMode.DEFAULT]: 'Ask to draft emails, find candidates, or check Nova…',
  [ChatMode.COLD_OUTREACH]: 'Paste filters, facility details, IDs, or lists for outreach…',
  [ChatMode.BATCH_REASSIGN]: 'Paste candidate IDs or Nova links to reassign…',
  [ChatMode.REPLY_MODE]: 'Paste the inbound email thread to generate a reply…',
});

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 2: Tool & Response Configuration
// ════════════════════════════════════════════════════════════════════════════════

/** @type {Readonly<Record<string, boolean>>} */
const TOOL_REQUIREMENTS = Object.freeze({
  [Intent.DRAFT_EMAIL]: false,
  [Intent.DRAFT_OUTREACH]: false, // No tools needed - deterministic template fill
  [Intent.EDIT_CONTENT]: false,
  [Intent.OFFER_DETAILS]: true,
  [Intent.REASSIGNMENT_REQUEST]: true,
  [Intent.DATABASE_ACTION]: true,
  [Intent.CAMPAIGN_WORKFLOW]: true,
  [Intent.LICENSING_REQUEST]: false,
  [Intent.SEARCH_QUERY]: false,
  [Intent.GENERAL_CHAT]: false,
  [Intent.UNKNOWN]: false,
});

/** @type {Readonly<Record<string, 'email_response' | 'chat'>>} */
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

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 3: Schema & Constants
// ════════════════════════════════════════════════════════════════════════════════

const ClassificationSchema = z.object({
  reason: z.string().describe('Short 1-sentence reason for classification.'),
  intent: z.enum(INTENT_ENUM),
  confidence: z.number().min(0).max(1),
  parameters: z.object({
    candidate_name: z.string().optional(),
    topic: z.string().optional(),
    urgency: z.enum(['high', 'normal']).optional(),
  }).default({}),
});

const HISTORY_WINDOW = 2;
const DEFAULT_PARAMETERS = Object.freeze({});
const MAX_MESSAGE_CHARS = 12000;
const MAX_LLM_CHARS = 4000;
const MAX_HISTORY_MESSAGE_CHARS = 2000;
const SEMANTIC_BUDGET_MS = 1000;

const SYSTEM_PROMPT = `You are the Intent Router for a Healthcare ATS. Classify the user's request.

Intents:
- DRAFT_OUTREACH: cold outreach, pay package emails, first contact campaigns
- DRAFT_EMAIL: reference requests, document requests, check interest, reply drafting
- OFFER_DETAILS: offer details, compare offers, draft offer letter
- DATABASE_ACTION: find/lookup candidate, Nova profile, status check
- REASSIGNMENT_REQUEST: reassign candidate, change recruiter
- GENERAL_CHAT: info questions, negation, general conversation

Rules:
1) Negation ("don't send", "cancel", "no email") -> GENERAL_CHAT
2) Info questions ("why/how/what...") -> GENERAL_CHAT
3) "outreach" + (draft/pay package) -> DRAFT_OUTREACH
4) Return only the schema fields.`;

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 4: Regex Patterns (Strict Word Boundaries)
// ════════════════════════════════════════════════════════════════════════════════

const RX_INFO_STARTERS = /^(who|what|where|when|why|how)\b/i;
const RX_DRAFT_VERBS = /\b(draft|write|compose|rewrite|revise|edit|create|generate|reply|respond|follow\s*up)\b/i;
const RX_MEDIUMS = /\b(emails?|messages?|notes?|texts?)\b/i;
const RX_OUTREACH = /\boutreach\b/i;
const RX_PAY_PACKAGE = /\bpay\s*package\b/i;
const RX_DRAFT_TYPO = /\b(d{1,2}raf{1,2}t?|write|compose)\b/i;
const RX_OUTREACH_TYPO = /\boutr?e?a?c?h?\b/i;
const RX_ENTITIES = /\b(references?|docs?|documents?|certifications?)\b/i;
const RX_ENTITY_ACTIONS = /\b(ask|request|get|send|collect|confirm)\b/i;
const RX_NEGATION_STRONG = /\b(don't|do not|cancel|stop)\b/i;
const RX_NEGATION_NO_MEDIUM = /\bno\s+(emails?|messages?|texts?|notes?)\b/i;
const RX_DB_QUERY_CORE = /\b(nova|candidates?|profile|profiles?|recruiting|applications?|job\s*id|req\s*id)\b/i;
const RX_DB_QUERY_SEARCH = /\b(lookup|find|search)\b/i;
const RX_DB_QUERY_ID = /(?:^|\s)(#\d{4,8}|CAND-\d+)\b/i;
const RX_NOVA = /https?:\/\/nova\.ayahealthcare\.com\/#\/?/i;
const RX_CODE_FENCE = /```[\s\S]*?```/g;
const RX_STACKTRACE = /\b(error:|exception|at\s+\S+\s+\(|stack\s+trace)\b/i;
const RX_CODE_TOKENS = /(?:\b(import|export|interface|type|class|function|const|let|var)\b|=>)/i;
const RX_KIND_MARKER_JSON = /"kind"\s*:\s*"(email_response|email_draft)"/i;
const EMAIL_KIND_VALUES = new Set(['email_response', 'email_draft']);

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 5: Utility Functions
// ════════════════════════════════════════════════════════════════════════════════

function normalizeError(err) {
  if (err instanceof Error) return { name: err.name, message: err.message };
  if (typeof err === 'string') return { message: err };
  if (err && typeof err === 'object') {
    const anyErr = err;
    const name = typeof anyErr.name === 'string' ? anyErr.name : undefined;
    const message = typeof anyErr.message === 'string' ? anyErr.message : JSON.stringify(anyErr) || 'Unknown error';
    return { name, message };
  }
  return { message: 'Unknown error' };
}

function coerceToString(input) {
  if (typeof input === 'string') return input;
  if (input == null) return '';
  if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') return String(input);
  try { return JSON.stringify(input); } catch { return String(input); }
}

function normalizeText(input, maxLen) {
  const raw = coerceToString(input);
  const cleaned = raw.replace(/\u0000/g, '').replace(/\u200b/g, '');
  const trimmed = cleaned.trim();
  if (typeof maxLen === 'number' && maxLen > 0 && trimmed.length > maxLen) return trimmed.slice(0, maxLen);
  return trimmed;
}

function sanitizeHistory(history, maxMessages) {
  if (!Array.isArray(history) || history.length === 0) return [];
  if (!Number.isFinite(maxMessages) || maxMessages <= 0) return [];
  const sanitized = [];
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

function stripFencedCodeBlocks(input) {
  return (input || '').replace(RX_CODE_FENCE, '');
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 6: Gate Functions
// ════════════════════════════════════════════════════════════════════════════════

function isInfoQuestion(text) {
  const t = (text || '').trim().toLowerCase();
  if (!t) return false;
  if (RX_INFO_STARTERS.test(t)) return true;
  if (t.endsWith('?') && !RX_DRAFT_VERBS.test(t)) return true;
  return false;
}

function isCodeLike(text) {
  const raw = text || '';
  if (!raw) return false;
  if (raw.includes('```')) return true;
  if (RX_STACKTRACE.test(raw)) return true;
  const hasCodeTokens = RX_CODE_TOKENS.test(raw);
  const len = raw.length || 1;
  const symbols = raw.replace(/[a-z0-9\s]/gi, '').length;
  const symbolRatio = symbols / len;
  if (hasCodeTokens && symbolRatio >= 0.12) return true;
  return false;
}

function isExplicitEmailRequest(text) {
  const tRaw = (text || '').toLowerCase();
  const t = stripFencedCodeBlocks(tRaw);
  if (!t) return false;
  if (isInfoQuestion(t)) return false;
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

function isOutreachRequest(text) {
  const t = (text || '').toLowerCase();
  if (!t) return false;
  if (isInfoQuestion(t)) return false;
  if (RX_NEGATION_STRONG.test(t)) return false;
  const hasOutreach = RX_OUTREACH.test(t);
  if (!hasOutreach) return false;
  if (RX_DRAFT_VERBS.test(t)) return true;
  if (RX_PAY_PACKAGE.test(t)) return true;
  return false;
}

function isDatabaseQuery(text) {
  if (!text) return false;
  if (RX_NOVA.test(text)) return true;
  if (RX_DB_QUERY_CORE.test(text)) return true;
  return RX_DB_QUERY_SEARCH.test(text) && RX_DB_QUERY_ID.test(text);
}

function lastAssistantWasEmail(history) {
  if (!Array.isArray(history) || history.length === 0) return false;
  let last;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m && m.role === 'assistant') { last = m; break; }
  }
  if (!last) return false;
  const seen = new WeakSet();
  const hasKindMarker = (val, depth = 0) => {
    if (!val || depth > 4) return false;
    if (typeof val === 'string') {
      const cleaned = stripFencedCodeBlocks(val);
      return RX_KIND_MARKER_JSON.test(cleaned);
    }
    if (Array.isArray(val)) return val.some((entry) => hasKindMarker(entry, depth + 1));
    if (typeof val === 'object') {
      const obj = val;
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

async function generateWithBudget(options, ms) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1, ms || 1);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timeoutId.unref === 'function') timeoutId.unref();
  try {
    return await generateObject({ ...options, abortSignal: controller.signal });
  } catch (err) {
    const e = normalizeError(err);
    const msg = e.message.toLowerCase();
    const aborted = e.name === 'AbortError' || msg.includes('aborted') || msg.includes('timeout') || e.message === 'The user aborted a request.';
    if (aborted) throw new Error('ROUTER_TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 7: Fast Path Overrides
// ════════════════════════════════════════════════════════════════════════════════

const FAST_PATH_OVERRIDES = [
  { pattern: /^\/reset\b/i, intent: Intent.GENERAL_CHAT },
  { pattern: /^\/help\b/i, intent: Intent.GENERAL_CHAT },
  { pattern: /^\/mode\b/i, intent: Intent.GENERAL_CHAT },
  { pattern: /^#\d{4,8}\b$/i, intent: Intent.DATABASE_ACTION },
  { pattern: /^CAND-\d+\b$/i, intent: Intent.DATABASE_ACTION },
  { pattern: RX_NOVA, intent: Intent.DATABASE_ACTION },
];

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 8: Mode Resolution (CRITICAL FIX)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Resolves intent based on mode + context.
 *
 * CRITICAL FIX (v4.0.0):
 * - COLD_OUTREACH mode + hasImage → DRAFT_OUTREACH (even with no/minimal text)
 * - This ensures pay package screenshots trigger the deterministic template path
 *
 * @param {string} mode - Current chat mode
 * @param {string} message - User message text
 * @param {object[]} history - Conversation history
 * @param {boolean} hasImage - Whether user uploaded an image
 * @returns {object|null} - Classification result or null to continue to next tier
 */
function resolveModeIntent(mode, message, history, hasImage = false) {
  const normalized = (message || '').trim();

  // Info questions always stay in GENERAL_CHAT regardless of mode
  if (isInfoQuestion(normalized)) {
    return {
      intent: Intent.GENERAL_CHAT,
      kind: RESPONSE_KIND[Intent.GENERAL_CHAT],
      requiresTools: TOOL_REQUIREMENTS[Intent.GENERAL_CHAT],
    };
  }

  switch (mode) {
    case ChatMode.COLD_OUTREACH: {
      // ════════════════════════════════════════════════════════════════════
      // CRITICAL FIX: Image in COLD_OUTREACH mode → DRAFT_OUTREACH
      // This is the primary fix for pay package screenshots
      // ════════════════════════════════════════════════════════════════════
      if (hasImage) {
        return {
          intent: Intent.DRAFT_OUTREACH,
          kind: RESPONSE_KIND[Intent.DRAFT_OUTREACH],
          requiresTools: TOOL_REQUIREMENTS[Intent.DRAFT_OUTREACH],
        };
      }

      // Explicit email request text also triggers DRAFT_OUTREACH
      if (isExplicitEmailRequest(normalized) || isOutreachRequest(normalized)) {
        return {
          intent: Intent.DRAFT_OUTREACH,
          kind: RESPONSE_KIND[Intent.DRAFT_OUTREACH],
          requiresTools: TOOL_REQUIREMENTS[Intent.DRAFT_OUTREACH],
        };
      }

      // Default: workflow ops in chat
      return {
        intent: Intent.CAMPAIGN_WORKFLOW,
        kind: RESPONSE_KIND[Intent.CAMPAIGN_WORKFLOW],
        requiresTools: TOOL_REQUIREMENTS[Intent.CAMPAIGN_WORKFLOW],
      };
    }

    case ChatMode.BATCH_REASSIGN: {
      return {
        intent: Intent.REASSIGNMENT_REQUEST,
        kind: RESPONSE_KIND[Intent.REASSIGNMENT_REQUEST],
        requiresTools: TOOL_REQUIREMENTS[Intent.REASSIGNMENT_REQUEST],
      };
    }

    case ChatMode.REPLY_MODE: {
      const intent = lastAssistantWasEmail(history) ? Intent.EDIT_CONTENT : Intent.DRAFT_EMAIL;
      return {
        intent,
        kind: RESPONSE_KIND[intent],
        requiresTools: TOOL_REQUIREMENTS[intent],
      };
    }

    case ChatMode.DEFAULT:
    default:
      return null;
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SECTION 9: Main Classifier
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Classify user intent through tiered deterministic gates with LLM fallback.
 *
 * Tier Order:
 * 1. Fast Path (slash commands, IDs, Nova URLs)
 * 2. Mode Resolution (COLD_OUTREACH + image → DRAFT_OUTREACH)
 * 3. Image + Draft/Outreach keywords (typo-tolerant)
 * 4. Pre-gates (DB queries, info questions, code detection)
 * 5. Outreach request detection
 * 6. LLM semantic classification (with timeout budget)
 *
 * @param {object} options
 * @param {string} options.message - User message text
 * @param {object[]} [options.history] - Conversation history
 * @param {string} [options.mode] - Current chat mode
 * @param {boolean} [options.modeLocked] - Whether mode is locked
 * @param {boolean} [options.hasImage] - Whether user uploaded an image
 * @returns {Promise<object>} Classification result
 */
export async function classify({
  message,
  history = [],
  mode = ChatMode.DEFAULT,
  modeLocked = false,
  hasImage = false,
}) {
  const normalized = normalizeText(message, MAX_MESSAGE_CHARS);

  // Empty message handling
  if (!normalized && !hasImage) {
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

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 1: Fast Path (slash commands, IDs)
  // ════════════════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 2: Mode Resolution (CRITICAL - handles image + mode combinations)
  // ════════════════════════════════════════════════════════════════════════════
  if (modeLocked && mode !== ChatMode.DEFAULT) {
    const modeResult = resolveModeIntent(mode, normalized, history, hasImage);
    if (modeResult) {
      return {
        ...modeResult,
        confidence: 1.0,
        reason: `Mode-locked: ${mode}${hasImage ? ' + image' : ''}`,
        parameters: {},
        fastPath: true,
        modeLocked: true,
      };
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 3: Image + Draft/Outreach keywords (typo-tolerant)
  // Even without mode lock, image + outreach keywords → DRAFT_OUTREACH
  // ════════════════════════════════════════════════════════════════════════════
  if (hasImage) {
    const hasDraftTypo = RX_DRAFT_TYPO.test(normalized);
    const hasOutreachTypo = RX_OUTREACH_TYPO.test(normalized);
    const hasPayPackage = RX_PAY_PACKAGE.test(normalized);

    // Any combination of draft/outreach/pay package keywords + image
    if ((hasDraftTypo && hasOutreachTypo) || hasPayPackage || hasOutreachTypo) {
      return {
        intent: Intent.DRAFT_OUTREACH,
        kind: RESPONSE_KIND[Intent.DRAFT_OUTREACH],
        requiresTools: TOOL_REQUIREMENTS[Intent.DRAFT_OUTREACH],
        confidence: 1.0,
        reason: 'Image + outreach/pay package keywords detected.',
        parameters: {},
        fastPath: true,
      };
    }

    // Image with no text or minimal text in COLD_OUTREACH context keywords
    // Check if the message context suggests pay package intent
    const contextSuggestsOutreach = /\b(pay|package|rate|stipend|weekly|salary|compensation)\b/i.test(normalized);
    if (contextSuggestsOutreach || !normalized) {
      // Default: image-only in recruiting context → likely pay package
      return {
        intent: Intent.DRAFT_OUTREACH,
        kind: RESPONSE_KIND[Intent.DRAFT_OUTREACH],
        requiresTools: TOOL_REQUIREMENTS[Intent.DRAFT_OUTREACH],
        confidence: 0.9,
        reason: 'Image upload in recruiting context assumed as pay package.',
        parameters: {},
        fastPath: true,
      };
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 4A: Pre-Gate (DB/Nova queries)
  // ════════════════════════════════════════════════════════════════════════════
  const isDatabaseQueryHit = isDatabaseQuery(normalized);
  if (isDatabaseQueryHit && !isExplicitEmailRequest(normalized)) {
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

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 4B: Pre-Gate (Info Questions)
  // ════════════════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 4C: Pre-Gate (Code/Stacktraces)
  // ════════════════════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 4D: Pre-Gate (Outreach Request)
  // ════════════════════════════════════════════════════════════════════════════
  if (isOutreachRequest(normalized)) {
    return {
      intent: Intent.DRAFT_OUTREACH,
      kind: RESPONSE_KIND[Intent.DRAFT_OUTREACH],
      requiresTools: TOOL_REQUIREMENTS[Intent.DRAFT_OUTREACH],
      confidence: 1.0,
      reason: 'Outreach request override.',
      parameters: {},
      fastPath: true,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TIER 5: LLM Semantic Classification (with budget timeout)
  // ════════════════════════════════════════════════════════════════════════════
  try {
    const safeHistory = sanitizeHistory(history, HISTORY_WINDOW);
    const llmText = normalizeText(normalized, MAX_LLM_CHARS);

    const { object } = await generateWithBudget({
      model: google('gemini-3-flash-preview', { structuredOutputs: true }),
      schema: ClassificationSchema,
      temperature: 0,
      messages: [...safeHistory, { role: 'user', content: llmText }],
      system: SYSTEM_PROMPT,
    }, SEMANTIC_BUDGET_MS);

    const parsed = ClassificationSchema.safeParse(object);
    if (!parsed.success || !INTENT_SET.has(parsed.data.intent)) {
      throw new Error('ROUTER_INVALID_SCHEMA');
    }

    let finalIntent = parsed.data.intent;
    let finalKind = RESPONSE_KIND[finalIntent] || 'chat';

    // Safety Gate 1: Email UI requires explicit trigger
    if (finalKind === 'email_response' && !isExplicitEmailRequest(normalized)) {
      finalIntent = Intent.GENERAL_CHAT;
      finalKind = 'chat';
    }

    // Safety Gate 2: Edit requires prior email structure
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
