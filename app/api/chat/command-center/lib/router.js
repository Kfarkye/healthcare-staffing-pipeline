/**
 * ============================================================================
 * INTENT ROUTER — Hybrid Classification Engine (Gemini 3 Flash Preview)
 * ============================================================================
 *
 * ARCHITECTURE:
 * - Tier 1: Fast-path regex overrides (<1ms) - Handles commands & deep links
 * - Tier 2: Pre-gate info questions (<1ms) - Blocks "Why/How" from hitting LLM
 * - Tier 3: Semantic route (Gemini 3 Flash) with 1000ms hard abort budget
 * - Safety Gates: 
 *    1. 2-Token Draft Rule (Verb + Medium)
 *    2. Smart Question Filter (Blocks info Qs, allows draft requests)
 *    3. Structure Gate (Edits require prior JSON history)
 *
 * @module app/api/chat/command-center/lib/router
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';

// ============================================================================
// SECTION 1: Definitions & Contracts
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

/**
 * Tool Gating Configuration.
 * - TRUE: Forces the route to check for missing candidate context.
 * - FALSE: Skips tool execution for speed.
 * @type {Readonly<Record<string, boolean>>}
 */
const TOOL_REQUIREMENTS = Object.freeze({
  [Intent.DRAFT_EMAIL]: true,      // Fetch context to prevent "blank" templates
  [Intent.DRAFT_OUTREACH]: true,   // Fetch context for personalization
  [Intent.OFFER_DETAILS]: true,
  [Intent.REASSIGNMENT_REQUEST]: true,
  [Intent.DATABASE_ACTION]: true,
  [Intent.CAMPAIGN_WORKFLOW]: true,
  [Intent.LICENSING_REQUEST]: false,
  [Intent.EDIT_CONTENT]: false,
  [Intent.GENERAL_CHAT]: false,
  [Intent.SEARCH_QUERY]: false,
  [Intent.UNKNOWN]: false,
});

/**
 * @typedef {'email_response' | 'chat'} ResponseKind
 */

/**
 * UI Response Mapping.
 * - 'email_response': Renders the Interactive Email Card.
 * - 'chat': Renders standard streaming text.
 * @type {Readonly<Record<string, ResponseKind>>}
 */
const RESPONSE_KIND = Object.freeze({
  [Intent.DRAFT_EMAIL]: 'email_response',
  [Intent.DRAFT_OUTREACH]: 'email_response',
  [Intent.EDIT_CONTENT]: 'email_response',
  // All others default to chat to prevent UI hallucinations
  [Intent.OFFER_DETAILS]: 'chat',
  [Intent.DATABASE_ACTION]: 'chat',
  [Intent.GENERAL_CHAT]: 'chat',
  [Intent.SEARCH_QUERY]: 'chat',
  [Intent.UNKNOWN]: 'chat',
  [Intent.LICENSING_REQUEST]: 'chat',
  [Intent.REASSIGNMENT_REQUEST]: 'chat',
  [Intent.CAMPAIGN_WORKFLOW]: 'chat',
});

// ============================================================================
// SECTION 2: Schema Contract
// ============================================================================

const ClassificationSchema = z.object({
  reason: z.string().describe('Short 1-sentence reason for classification.'),
  intent: z.enum([
    'DRAFT_OUTREACH',
    'DRAFT_EMAIL',
    'OFFER_DETAILS',
    'EDIT_CONTENT',
    'LICENSING_REQUEST',
    'REASSIGNMENT_REQUEST',
    'DATABASE_ACTION',
    'CAMPAIGN_WORKFLOW',
    'SEARCH_QUERY',
    'GENERAL_CHAT',
    'UNKNOWN',
  ]),
  confidence: z.number().min(0).max(1),
  parameters: z.object({
    candidate_name: z.string().optional(),
    topic: z.string().optional(),
    urgency: z.enum(['high', 'normal']).optional(),
  }),
});

/**
 * @typedef {{ role: 'user' | 'assistant' | string; content: any }} HistoryMessage
 */

// ============================================================================
// SECTION 3: Performance Constants (Hoisted Regex)
// ============================================================================

const RX_INFO_STARTERS = /^(who|what|where|when|why|how)\b/i;
const RX_DRAFT_VERBS = /\b(draft|write|compose|rewrite|edit|create|generate)\b/i;
const RX_MEDIUMS = /\b(emails?|messages?|notes?|texts?)\b/i;
const RX_ENTITIES = /\b(references?|docs?|documents?|certifications?)\b/i;
const RX_ACTIONS = /\b(ask|request|get|send|collect|confirm)\b/i;
// Added 'status' and 'app' to ensure status checks don't get blocked by question gate
const RX_DB_QUERY = /\b(nova|candidate|lookup|find|search|profile|status|app)\b/i;
const RX_CODE_BLOCK = /```[\s\S]*?```/g;
const RX_KIND_MARKER = /"kind"\s*:\s*"(email_response|email_draft)"/;
const RX_KIND_ATTR = /\bkind\s*=\s*"(email_response|email_draft)"/;

// ============================================================================
// SECTION 4: Error Normalization (TS Strict Safe)
// ============================================================================

/**
 * @typedef {{ name?: string; message: string }} NormalizedError
 */

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
        : JSON.stringify(anyErr);
    return { name, message };
  }
  return { message: 'Unknown error' };
}

// ============================================================================
// SECTION 5: Gates & Helpers
// ============================================================================

/**
 * Smart Question Filter:
 * - Blocks "info questions" (Why/How) from triggering drafts.
 * - Allows "action questions" (Can you draft...?) to pass.
 * @param {string} text
 * @returns {boolean}
 */
function isInfoQuestion(text) {
  const t = (text || '').trim().toLowerCase();

  // 1. Leading info interrogatives -> ALWAYS BLOCK
  if (RX_INFO_STARTERS.test(t)) return true;

  // 2. Trailing "?" check
  // Block ONLY if the sentence lacks drafting verbs.
  // ALLOWS: "Draft an email to Josh?"
  // BLOCKS: "Is this correct?"
  if (t.endsWith('?') && !RX_DRAFT_VERBS.test(t)) {
    return true;
  }

  return false;
}

/**
 * 2-Token Draft Gate (Strict Boundaries):
 * Prevents random phrases from hallucinating email cards.
 * Must have: (Verb + Medium) OR (Entity + Action) OR (Ops Shorthand).
 * @param {string} text
 * @returns {boolean}
 */
function isExplicitEmailRequest(text) {
  const t = (text || '').toLowerCase();

  // 1. Question Pre-check
  if (isInfoQuestion(t)) return false;

  const hasDraftVerb = RX_DRAFT_VERBS.test(t);
  const hasMedium = RX_MEDIUMS.test(t);

  // Rule A: Standard "Draft + Medium"
  if (hasDraftVerb && hasMedium) return true;

  // Rule B: Template Request (Action + Entity)
  const isTemplateRequest = RX_ENTITIES.test(t) && RX_ACTIONS.test(t);
  if (isTemplateRequest) return true;

  // Rule C: Ops Shorthand (Entity + Medium) -> e.g., "references email"
  const opsShorthand = RX_ENTITIES.test(t) && hasMedium;
  if (opsShorthand) return true;

  return false;
}

/**
 * Removes fenced code blocks (```...```) to prevent false positives.
 * e.g., A code block containing a "Subject:" line should not trigger Edit mode.
 * @param {string} input
 * @returns {string}
 */
function stripFencedCodeBlocks(input) {
  return input.replace(RX_CODE_BLOCK, '');
}

/**
 * Recursively scans history for structured "Email Draft" markers.
 * Used to validate EDIT_CONTENT intent.
 * @param {HistoryMessage[]} history
 * @returns {boolean}
 */
function lastAssistantWasEmail(history) {
  if (!Array.isArray(history) || history.length === 0) return false;

  const last = [...history].reverse().find((m) => m && m.role === 'assistant');
  if (!last) return false;

  /**
   * Helper: recursively scan for kind markers
   * @param {any} val
   * @returns {boolean}
   */
  const hasKindMarker = (val) => {
    if (!val) return false;

    if (typeof val === 'string') {
      const cleaned = stripFencedCodeBlocks(val);
      // Only trust explicit structured markers, not plain text
      return RX_KIND_MARKER.test(cleaned) || RX_KIND_ATTR.test(cleaned);
    }

    if (Array.isArray(val)) {
      for (const item of val) {
        if (hasKindMarker(item)) return true;
      }
      return false;
    }

    if (typeof val === 'object') {
      const anyVal = /** @type {any} */ (val);
      if (typeof anyVal.kind === 'string' && (anyVal.kind === 'email_response' || anyVal.kind === 'email_draft')) {
        return true;
      }
      for (const k of Object.keys(anyVal)) {
        if (hasKindMarker(anyVal[k])) return true;
      }
      return false;
    }

    return false;
  };

  return hasKindMarker(last.content);
}

/**
 * Hard-budgeted LLM call using AbortController.
 * Kills the request server-side if it exceeds the budget, preventing 504s.
 * @param {object} options
 * @param {number} ms
 */
async function generateWithBudget(options, ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  try {
    return await generateObject({
      ...options,
      abortSignal: controller.signal,
    });
  } catch (err) {
    const e = normalizeError(err);
    if (e.name === 'AbortError') throw new Error('ROUTER_TIMEOUT');
    // Some SDKs surface abort as a message string
    if (e.message.toLowerCase().includes('aborted')) throw new Error('ROUTER_TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// SECTION 6: Fast Path Overrides
// ============================================================================

/** @type {Array<{ pattern: RegExp; intent: string }>} */
const FAST_PATH_OVERRIDES = [
  // System commands
  { pattern: /^\/reset\b/i, intent: Intent.GENERAL_CHAT },
  { pattern: /^\/help\b/i, intent: Intent.GENERAL_CHAT },

  // Entity IDs -> Database Action
  { pattern: /^#\d{4,6}\b$/, intent: Intent.DATABASE_ACTION },
  { pattern: /^CAND-\d+\b$/i, intent: Intent.DATABASE_ACTION },

  // Nova SPA Deep Links (un-anchored to match embedded links)
  // Matches "Check this https://nova.ayahealthcare.com/#/..."
  { pattern: /https:\/\/nova\.ayahealthcare\.com\/#\/?/i, intent: Intent.DATABASE_ACTION },
];

// ============================================================================
// SECTION 7: Main Classifier
// ============================================================================

/**
 * Classifies user intent using a hybrid approach:
 * 1. Fast path regex for system commands
 * 2. Pre-gate info questions
 * 3. LLM semantic classification with safety gates
 *
 * @param {{ message: string, history?: HistoryMessage[] }} params
 * @returns {Promise<{ intent: string, kind: string, requiresTools: boolean, confidence: number, reason: string, parameters: object, fastPath?: boolean }>}
 */
export async function classify({
  message,
  history = [],
}) {
  const normalized = (message ?? '').trim();

  // 1. TIER 1: Fast-Path (<1ms)
  for (const override of FAST_PATH_OVERRIDES) {
    if (override.pattern.test(normalized)) {
      return {
        intent: override.intent,
        kind: RESPONSE_KIND[override.intent] || 'chat',
        requiresTools: TOOL_REQUIREMENTS[override.intent] ?? false,
        confidence: 1.0,
        reason: 'Matched fast-path Regex override.',
        parameters: {},
        fastPath: true,
      };
    }
  }

  // 2. TIER 2: Pre-Gate Info Questions (<1ms)
  // Optimization: Skip expensive LLM calls for obvious info questions
  // UNLESS it looks like a database query (e.g. "What is the status of...")
  const isDatabaseQuery = RX_DB_QUERY.test(normalized);
  if (isInfoQuestion(normalized) && !isDatabaseQuery) {
    return {
      intent: Intent.GENERAL_CHAT,
      kind: 'chat',
      requiresTools: false,
      confidence: 1.0,
      reason: 'Blocked by Info-Question Pre-Gate.',
      parameters: {},
      fastPath: true,
    };
  }

  // 3. TIER 3: Semantic Path (Gemini 3 Flash) with 1000ms Budget
  try {
    const { object } = await generateWithBudget(
      {
        model: google('gemini-3-flash-preview', { structuredOutputs: true }),
        schema: ClassificationSchema,
        temperature: 0,
        messages: [...history.slice(-2), { role: 'user', content: normalized }],
        system: `
You are the Intent Router for a Healthcare ATS. Classify the user's request.

RULES:
1) Negation ("don't send", "cancel", "no email") -> GENERAL_CHAT
2) Info questions ("why/how/what...") -> GENERAL_CHAT
3) DRAFT_EMAIL only for: ask for references, request docs, check interest
4) OFFER_DETAILS: offer details, compare offers, draft offer letter
5) DATABASE_ACTION: find/lookup candidate, Nova profile
`,
      },
      1000 // 1.0s hard timeout
    );

    let finalIntent = object.intent;
    let finalKind = RESPONSE_KIND[finalIntent] || 'chat';

    // Gate 1: Explicit Email Trigger (2-Token Rule)
    // Prevents hallucinated email cards on random prompts
    if (finalKind === 'email_response' && !isExplicitEmailRequest(normalized)) {
      finalIntent = Intent.GENERAL_CHAT;
      finalKind = 'chat';
    }

    // Gate 2: Edit Structure Check
    // Prevents "Edit" intent if no draft exists in history
    if (finalIntent === Intent.EDIT_CONTENT && !lastAssistantWasEmail(history)) {
      finalIntent = Intent.GENERAL_CHAT;
      finalKind = 'chat';
    }

    return {
      intent: finalIntent,
      kind: finalKind,
      requiresTools: TOOL_REQUIREMENTS[finalIntent] ?? false,
      confidence: object.confidence,
      reason: object.reason,
      parameters: object.parameters,
    };
  } catch (err) {
    const e = normalizeError(err);
    const isTimeout = e.message === 'ROUTER_TIMEOUT';

    if (!isTimeout) {
      // Log errors but do not crash the route
      console.warn('[Router] Semantic classification failed:', e.message);
    }

    return {
      intent: Intent.GENERAL_CHAT,
      kind: 'chat',
      requiresTools: false,
      confidence: 0.0,
      reason: isTimeout ? 'Router time budget exceeded' : 'Router error',
      parameters: {},
    };
  }
}

export default { classify, Intent };
