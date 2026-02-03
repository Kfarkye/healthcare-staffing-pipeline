/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTENT ROUTER — Hybrid Classification Engine (Gemini 3 Flash Preview)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ELITE ARCHITECTURE:
 * 1. TIER 1 (Fast Path): Regex for system commands & deep links (<1ms).
 * 2. TIER 2 (Semantic): Gemini 3 Flash with strict time budgeting (1000ms).
 * 3. SAFETY GATES: "2-Token Rule" + "Smart Question Filter" to prevent UI hallucinations.
 * 
 * @module app/api/chat/command-center/lib/router
 */

import { z } from 'zod';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Definitions & Contracts
// ═══════════════════════════════════════════════════════════════════════════════

export const Intent = Object.freeze({
  DRAFT_OUTREACH: 'DRAFT_OUTREACH',       // Creative writing
  DRAFT_EMAIL: 'DRAFT_EMAIL',             // Strict Templates (Ref consent, docs)
  OFFER_DETAILS: 'OFFER_DETAILS',         // Offer analysis
  EDIT_CONTENT: 'EDIT_CONTENT',           // Revisions
  LICENSING_REQUEST: 'LICENSING_REQUEST', // License lookups
  REASSIGNMENT_REQUEST: 'REASSIGNMENT_REQUEST',
  DATABASE_ACTION: 'DATABASE_ACTION',     // CRM/Nova lookups
  CAMPAIGN_WORKFLOW: 'CAMPAIGN_WORKFLOW',
  SEARCH_QUERY: 'SEARCH_QUERY',           // General knowledge
  GENERAL_CHAT: 'GENERAL_CHAT',           // Fallback/Chit-chat
  UNKNOWN: 'UNKNOWN',
});

/**
 * Tools required for specific intents.
 * NOTE: Email drafts default to FALSE to prevent unnecessary latency.
 * Tools are only invoked if Candidate ID is missing downstream.
 */
const TOOL_REQUIREMENTS = Object.freeze({
  [Intent.DRAFT_EMAIL]: false,        // Optimization: Don't fetch unless needed
  [Intent.DRAFT_OUTREACH]: false,
  [Intent.OFFER_DETAILS]: true,       // Needs offer data
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
 * Response Kind Configuration
 * Maps intents to top-level response types for the UI.
 * 'email_response' triggers the Card UI. 'chat' triggers standard text.
 */
const RESPONSE_KIND = Object.freeze({
  [Intent.DRAFT_EMAIL]: 'email_response',
  [Intent.DRAFT_OUTREACH]: 'email_response',
  [Intent.EDIT_CONTENT]: 'email_response',
  // All others default to 'chat' to prevent hallucinated draft cards
  [Intent.OFFER_DETAILS]: 'chat',
  [Intent.DATABASE_ACTION]: 'chat',
  [Intent.GENERAL_CHAT]: 'chat',
  [Intent.SEARCH_QUERY]: 'chat',
  [Intent.UNKNOWN]: 'chat',
  [Intent.LICENSING_REQUEST]: 'chat',
  [Intent.REASSIGNMENT_REQUEST]: 'chat',
  [Intent.CAMPAIGN_WORKFLOW]: 'chat',
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Schemas
// ═══════════════════════════════════════════════════════════════════════════════

const ClassificationSchema = z.object({
  // Internal reasoning only - do not expose to user
  reason: z.string().describe("Short 1-sentence reason for classification."),
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
    'UNKNOWN'
  ]),
  confidence: z.number().min(0).max(1),
  parameters: z.object({
    candidate_name: z.string().optional(),
    topic: z.string().optional(),
    urgency: z.enum(['high', 'normal']).optional(),
  }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Logic Gates & Helpers (The Elite Fix)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Smart Question Filter.
 * Blocks "Information" questions (Who/What/Why) from triggering drafts.
 * ALLOWS "Action" questions ("Can you draft this?") to pass.
 * @param {string} text
 * @returns {boolean}
 */
function isQuestion(text) {
  const t = (text || '').trim().toLowerCase();

  // 1. Info-question starters -> ALWAYS BLOCK
  // "Why references needed", "How to find candidate"
  if (/^(who|what|where|when|why|how)\b/.test(t)) return true;

  // 2. Trailing '?' check
  // Block ONLY if the sentence lacks drafting verbs.
  // ALLOWS: "Draft an email to Josh?" (contains 'draft')
  // BLOCKS: "Is this correct?" (no draft verb)
  if (t.endsWith('?') && !/\b(draft|write|compose|rewrite|edit|create|generate)\b/.test(t)) {
    return true;
  }

  return false;
}

/**
 * Checks if a string contains explicit email drafting intent.
 * USES 2-TOKEN RULE: Must have (Action + Medium) OR (Specific Noun + Medium).
 * @param {string} text
 * @returns {boolean}
 */
function isExplicitEmailRequest(text) {
  const t = (text || '').toLowerCase();

  // 1. Question Gate: If it's an info question, force Chat.
  if (isQuestion(t)) {
    return false;
  }

  // Regex Definitions (Using \b boundaries to prevent "context" matching "text")
  const draftVerbRegex = /\b(draft|write|compose|create|generate|rewrite|edit)\b/;
  const mediumRegex = /\b(emails?|messages?|notes?|texts?)\b/; // Handles plurals
  const entityRegex = /\b(references?|docs?|documents?|certifications?)\b/;
  const actionRegex = /\b(ask|request|get|send|collect|confirm)\b/;

  const hasDraftVerb = draftVerbRegex.test(t);
  const hasMedium = mediumRegex.test(t);

  // Rule A: Standard "Draft + Medium" ("Draft email", "Write message")
  if (hasDraftVerb && hasMedium) return true;

  // Rule B: Template Request (Action + Entity)
  // "Ask for references", "Request docs", "Confirm certs"
  const isTemplateRequest = entityRegex.test(t) && actionRegex.test(t);
  if (isTemplateRequest) return true;

  // Rule C: Requirement + Medium (Ops shorthand)
  // "References email", "Docs message"
  const requirementWithoutVerb = entityRegex.test(t) && hasMedium;
  if (requirementWithoutVerb) return true;

  return false;
}

/**
 * Checks if the last assistant message was an email draft.
 * STRICT CHECK: Only trusts structured JSON markers.
 * @param {any[]} history
 * @returns {boolean}
 */
function lastAssistantWasEmail(history) {
  if (!history || history.length === 0) return false;

  const last = [...history].reverse().find(m => m.role === 'assistant');
  if (!last) return false;

  const content = typeof last.content === 'string'
    ? last.content
    : JSON.stringify(last.content);

  // Only trust explicit internal markers (prevents "Subject:" in code blocks from triggering)
  return (
    content.includes('"kind":"email_draft"') ||
    content.includes('"kind":"email_response"')
  );
}

/**
 * Executes an LLM call with a hard AbortController timeout.
 * Prevents 504s by killing the upstream request immediately.
 * @param {object} options
 * @param {number} ms
 */
async function generateWithBudget(options, ms) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  try {
    return await generateObject({
      ...options,
      abortSignal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('ROUTER_TIMEOUT');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Fast Path (Tier 1)
// ═══════════════════════════════════════════════════════════════════════════════

const FAST_PATH_OVERRIDES = [
  // System Commands
  { pattern: /^\/reset/i, intent: Intent.GENERAL_CHAT },
  { pattern: /^\/help/i, intent: Intent.GENERAL_CHAT },

  // Entity IDs -> Database Action
  { pattern: /^#\d{4,6}$/, intent: Intent.DATABASE_ACTION },
  { pattern: /^CAND-\d+$/i, intent: Intent.DATABASE_ACTION },

  // Nova URLs -> Database Action
  // Correctly handles Hash Router paths: nova.ayahealthcare.com/#/recruiting/...
  { pattern: /^https:\/\/nova\.ayahealthcare\.com\/#/i, intent: Intent.DATABASE_ACTION },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Main Classifier
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Classifies user intent using a hybrid approach:
 * 1. Fast path regex for system commands
 * 2. LLM semantic classification with safety gates
 * 
 * @param {{ message: string, history?: any[] }} params
 * @returns {Promise<{ intent: string, kind: string, requiresTools: boolean, confidence: number, reason: string, parameters: object }>}
 */
export async function classify({ message, history = [] }) {
  const normalized = (message ?? '').trim();

  // 1. FAST PATH: Regex Overrides (<1ms)
  for (const override of FAST_PATH_OVERRIDES) {
    if (override.pattern.test(normalized)) {
      return {
        intent: override.intent,
        kind: RESPONSE_KIND[override.intent] || 'chat',
        requiresTools: TOOL_REQUIREMENTS[override.intent] ?? false,
        confidence: 1.0,
        reason: "Matched fast-path Regex override.",
        parameters: {},
        fastPath: true
      };
    }
  }

  // 2. SEMANTIC PATH: Gemini 3 Flash (~200ms) with 1s Timeout
  try {
    const { object } = await generateWithBudget({
      model: google('gemini-3-flash-preview', { structuredOutputs: true }),
      schema: ClassificationSchema,
      temperature: 0,
      // INJECTION HYGIENE: User content in messages, not system prompt
      messages: [
        ...history.slice(-2), // Minimal context
        { role: 'user', content: normalized }
      ],
      system: `
        You are the Intent Router for a Healthcare ATS. Classify the user's request.

        RULES:
        1. **Negation**: "Don't send", "Cancel", "No email" -> GENERAL_CHAT.
        2. **Questions**: "How do I...", "Why is..." -> GENERAL_CHAT.
        3. **DRAFT_EMAIL**: STRICTLY for "Ask for references", "Request docs", "Check interest".
        4. **OFFER_DETAILS**: "Offer details", "Compare offers", "Draft offer letter".
        5. **DATABASE_ACTION**: "Find [name]", "Lookup [name]", "Nova profile".
      `,
    }, 1000); // 1.0s hard budget

    // ═══════════════════════════════════════════════════════════════════════
    // SECTION 6: Safety Gates (Critical for Production)
    // ═══════════════════════════════════════════════════════════════════════

    let finalIntent = object.intent;
    let finalKind = RESPONSE_KIND[finalIntent] || 'chat';

    // GATE 1: Explicit Email Trigger (2-Token Rule + Question Filter)
    // If router says "Email" but user didn't use (Verb+Medium) or (Noun+Medium), force to Chat.
    if (finalKind === 'email_response' && !isExplicitEmailRequest(normalized)) {
      finalIntent = Intent.GENERAL_CHAT;
      finalKind = 'chat';
    }

    // GATE 2: Contextual Edits (Structure Rule)
    // If router says "Edit" but we have no draft JSON in history, force to Chat.
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

  } catch (error) {
    // 3. FALLBACK: Fail Open to General Chat
    // Prevents 504s and crashes.
    const isTimeout = error.message === 'ROUTER_TIMEOUT';
    if (!isTimeout) {
      console.warn("[Router] Semantic classification failed:", error);
    }

    return {
      intent: Intent.GENERAL_CHAT,
      kind: 'chat',
      requiresTools: false,
      confidence: 0.0,
      reason: isTimeout ? "Router time budget exceeded" : "Router error",
      parameters: {}
    };
  }
}

export default { classify, Intent };
