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
  EDIT_CONTENT: 'EDIT_CONTENT',

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
 * Intent patterns for classification
 * Ordered by specificity (most specific first)
 */
const INTENT_PATTERNS = [
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

  // Check each intent pattern
  for (const { intent, patterns, requiresTools } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedMessage)) {
        return {
          intent,
          requiresTools,
          confidence: 0.85,
          matchedPattern: pattern.source,
        };
      }
    }
  }

  // Context-aware classification from history
  const historyContext = analyzeHistoryContext(history);
  if (historyContext.intent !== Intent.UNKNOWN) {
    return {
      ...historyContext,
      confidence: 0.7,
      fromHistory: true,
    };
  }

  // Default to general chat
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
