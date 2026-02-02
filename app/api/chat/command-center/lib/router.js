/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * INTENT ROUTER — Classification Engine
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Classifies user intent to route requests to optimal processing paths:
 * - Buffered path: Quality-critical content (drafts, edits)
 * - Streaming path: Latency-sensitive interactions (chat, search)
 * 
 * @module app/api/chat/command-center/lib/router
 */

/**
 * Intent enumeration
 * Maps to processing strategies and tool requirements
 */
export const Intent = Object.freeze({
  // Buffered processing (quality-first)
  DRAFT_OUTREACH: 'DRAFT_OUTREACH',
  DRAFT_EMAIL: 'DRAFT_EMAIL', // Deterministic template-based email drafting
  OFFER_DETAILS: 'OFFER_DETAILS',
  EDIT_CONTENT: 'EDIT_CONTENT',

  // Specialized recruiter workflows (buffered)
  LICENSING_REQUEST: 'LICENSING_REQUEST',
  REASSIGNMENT_REQUEST: 'REASSIGNMENT_REQUEST',

  // Streaming processing (latency-first)
  GENERAL_CHAT: 'GENERAL_CHAT',
  SEARCH_QUERY: 'SEARCH_QUERY',

  // Tool-intensive operations
  DATABASE_ACTION: 'DATABASE_ACTION',
  CAMPAIGN_WORKFLOW: 'CAMPAIGN_WORKFLOW',

  // Fallback
  UNKNOWN: 'UNKNOWN',
});

/**
 * Questions about content should NOT trigger drafting
 */
const QUESTION_INDICATORS = /^(what|how|why|show|describe|tell|explain|analyze|summarize|can you|could you|please)\b/i;

/**
 * Intent patterns for classification
 * Ordered by specificity (most specific first)
 */
const INTENT_PATTERNS = [
  {
    // LICENSING_REQUEST: Must come early (very specific patterns)
    intent: Intent.LICENSING_REQUEST,
    patterns: [
      /\b(licensing|license)\s*(request|info|information)\b/i,
      /\b(request|need|get)\b.*\blicensing\b/i,
      /\blicensing\b.*\b(specialty|state)\b/i,
      /\bcan\s*i\s*(have|get)\s*licensing\b/i,
    ],
    requiresTools: false, // Template-based, no tools needed
  },
  {
    // REASSIGNMENT_REQUEST: Any mention of "reassign" or "reassignment" → this template
    intent: Intent.REASSIGNMENT_REQUEST,
    patterns: [
      /\breassign/i, // Catches: reassign, reassignment, reassigning, etc.
    ],
    requiresTools: true,
  },
  {
    // OFFER_DETAILS must come before DRAFT_OUTREACH and DRAFT_EMAIL (more specific)
    // These require LLM generation to analyze complex offer data from images/context
    intent: Intent.OFFER_DETAILS,
    patterns: [
      /\b(offer)\s*(details|letter|email|breakdown)\b/i, // "offer email", "offer details"
      /\b(draft|write|create)\b.*\b(offer)\b.*\b(email|letter|summary)?\b/i, // "draft offer email"
      /\b(congratulations|congrats)\b.*\b(offer|position)\b/i,
      /\b(offer)\b.*\b(received|accepted|got the|review|compare)\b/i,
      /\b(compare|review|go over|going over)\b.*\b(offer|offers)\b/i, // "going over the two offers"
      /\b(two|multiple|both)\s*(offer|offers)\b/i, // "the two offers"
    ],
    requiresTools: true,
  },
  {
    // DRAFT_EMAIL: Deterministic template routing (MUST come before DRAFT_OUTREACH)
    // Routes to specific templates: reference_consent, doc_request, assignment_interest
    intent: Intent.DRAFT_EMAIL,
    patterns: [
      // Reference consent patterns
      /\breference/i,
      /\b(ok|okay|yes)?\s*(to)?\s*reach\s*out\s*(to)?\s*reference/i,
      /\b(confirm|check)\s*(with)?\s*reference/i,
      /\breferences?\s*needed/i,
      // Doc request patterns
      /\b(cert|certification|certs|document|documents|docs)\b.*\b(need|send|submit|missing)/i,
      /\b(bls|acls|pals|nb|rn license)\b.*\b(send|need|submit)/i,
      /\b(need|require|missing).*\b(document|cert|license)/i,
      /\bsubmission\b.*\b(need|require)/i,
      // Interview availability
      /\b(interview)\s*(time|availability|schedule)/i,
    ],
    requiresTools: true, // Needs resolve_candidate for Nova links
  },
  {
    intent: Intent.DRAFT_OUTREACH,
    patterns: [
      /\b(draft|write|compose|create)\b.*\b(email|message|outreach|letter|proposal)\b/i,
      /\b(email|message)\b.*\b(template|draft)\b/i,
      /\bgenerate\b.*\b(copy|content|text)\b/i,
      // Healthcare staffing specific patterns
      /\bpay\s*package\b.*\b(outreach|email)\b/i,
      /\b(outreach|email)\b.*\bpay\s*package\b/i,
      // Image-based drafting
      /\b(draft|write|compose|create)\b.*\b(using|from|with)\b.*\b(attached|screenshot|image)\b/i,
      /\b(attached|screenshot|image)\b.*\b(draft|write|email|outreach)\b/i,
    ],
    requiresTools: true,
  },
  {
    intent: Intent.EDIT_CONTENT,
    patterns: [
      /\b(edit|revise|rewrite|improve|fix|update)\b.*\b(text|content|draft|copy)\b/i,
      /\b(make|change)\b.*\b(shorter|longer|formal|casual|better)\b/i,
      /\bpolish\b/i,
    ],
    requiresTools: false,
  },
  {
    intent: Intent.DATABASE_ACTION,
    patterns: [
      /\b(find|search|lookup|get|fetch|query)\b.*\b(contact|lead|candidate|record|data)\b/i,
      /\b(add|create|insert|save|store)\b.*\b(contact|lead|candidate|record)\b/i,
      /\b(update|modify|change)\b.*\b(contact|lead|candidate|record|status)\b/i,
      /\b(delete|remove)\b.*\b(contact|lead|candidate|record)\b/i,
      // Nova/CRM specific lookups - simplified patterns
      /\bnova\b/i, // Any mention of "nova" triggers database lookup
      /\b(link|url|profile)\b.*\bto\b/i, // "link to [name]", "profile to [name]"
      /\bcan\s*i\s*(have|get)\b/i, // "can i have/get" + anything = likely a lookup request
    ],
    requiresTools: true,
  },
  {
    intent: Intent.CAMPAIGN_WORKFLOW,
    patterns: [
      /\b(campaign|sequence|workflow|automation)\b/i,
      /\b(schedule|queue|send)\b.*\b(email|message|outreach)\b/i,
      /\b(follow[- ]?up|nurture)\b/i,
    ],
    requiresTools: true,
  },
  {
    intent: Intent.SEARCH_QUERY,
    patterns: [
      /\b(search|find|look\s?up|google)\b/i,
      /\bwhat\s+(is|are|was|were)\b/i,
      /\bhow\s+(to|do|does|did)\b/i,
      /\bwho\s+(is|are|was|were)\b/i,
    ],
    requiresTools: false,
  },
];

/**
 * Classifies user intent based on message content and history
 * 
 * @param {Object} params - Classification parameters
 * @param {string} params.message - Current user message
 * @param {Array} params.history - Conversation history
 * @returns {Object} - Classification result with intent and tool requirements
 */
export function classify({ message, history = [] }) {
  // Normalize input
  const normalizedMessage = (message ?? '').toLowerCase().trim();

  // Empty or very short messages default to general chat
  if (normalizedMessage.length < 3) {
    return {
      intent: Intent.GENERAL_CHAT,
      requiresTools: false,
      confidence: 0.9,
    };
  }

  // 1. Check specific intent patterns
  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedMessage)) {
        return {
          intent,
          requiresTools: true,
          confidence: 0.85,
          matchedPattern: pattern.source,
        };
      }
    }
  }

  // 2. Fallback: If it's a question or requests a "link/profile", treat as potential DATABASE_ACTION
  if (QUESTION_INDICATORS.test(normalizedMessage) || /\b(link|profile|nova)\b/i.test(normalizedMessage)) {
    return {
      intent: Intent.DATABASE_ACTION,
      requiresTools: true,
      confidence: 0.8,
    };
  }

  // 3. Context-aware classification from history
  const historyContext = analyzeHistoryContext(history);
  if (historyContext.intent !== Intent.UNKNOWN) {
    return {
      ...historyContext,
      confidence: 0.7,
      fromHistory: true,
    };
  }

  // 4. Default to general chat
  return {
    intent: Intent.GENERAL_CHAT,
    requiresTools: false,
    confidence: 0.5,
  };
}

/**
 * Analyzes conversation history for context clues
 * 
 * @param {Array} history - Conversation history
 * @returns {Object} - Context analysis result
 */
function analyzeHistoryContext(history) {
  if (!Array.isArray(history) || history.length < 2) {
    return { intent: Intent.UNKNOWN, requiresTools: false };
  }

  // Look at recent assistant messages for context
  const recentAssistant = history
    .filter((m) => m.role === 'assistant')
    .slice(-2);

  for (const msg of recentAssistant) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : msg.content?.find((p) => p.type === 'text')?.text ?? '';

    // If assistant recently drafted something, user might be editing
    if (/here'?s?\s+(a\s+)?draft/i.test(content)) {
      return { intent: Intent.EDIT_CONTENT, requiresTools: false };
    }

    // If assistant mentioned database operations
    if (/found\s+\d+\s+(contact|lead|record)/i.test(content)) {
      return { intent: Intent.DATABASE_ACTION, requiresTools: true };
    }
  }

  return { intent: Intent.UNKNOWN, requiresTools: false };
}

export default { classify, Intent };
