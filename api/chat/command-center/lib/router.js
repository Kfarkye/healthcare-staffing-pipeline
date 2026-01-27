/**
 * Router - Intent Classification System
 * 
 * Purpose: Analyze the user's message and determine which specialized agent
 * should handle the request. This prevents the "jack of all trades, master of none"
 * problem where a single prompt tries to do everything poorly.
 * 
 * Architecture:
 * - Keyword-based classification with confidence scoring
 * - Context-aware (considers attachments, conversation history)
 * - Explicit mode detection prevents AI from guessing wrong
 * 
 * @module lib/router
 */

/**
 * Intent Types - The possible modes the system can operate in
 * @readonly
 * @enum {string}
 */
export const Intent = Object.freeze({
    /** User wants to modify/polish existing text they provided */
    EDIT_CONTENT: 'EDIT_CONTENT',

    /** User wants AI to write new outreach (email, text, message) */
    DRAFT_OUTREACH: 'DRAFT_OUTREACH',

    /** User wants to update database (save, update status, add prospect) */
    DATABASE_ACTION: 'DATABASE_ACTION',

    /** User wants to search/lookup information */
    SEARCH_QUERY: 'SEARCH_QUERY',

    /** User wants to run a campaign workflow */
    CAMPAIGN_WORKFLOW: 'CAMPAIGN_WORKFLOW',

    /** General conversation, questions, or unclear intent */
    GENERAL: 'GENERAL',
});

/**
 * Keyword patterns for each intent type
 * Ordered by specificity (most specific first)
 */
const INTENT_PATTERNS = {
    [Intent.EDIT_CONTENT]: {
        // User is asking to modify text they just provided
        keywords: [
            /\bclean\s*(this\s*)?(up|it)\b/i,
            /\bfix\s*(this|it|my|the)\b/i,
            /\bpolish\s*(this|it|my|the)?\b/i,
            /\bshorten\s*(this|it|my|the)?\b/i,
            /\bedit\s*(this|it|my|the)?\b/i,
            /\brewrite\s*(this|it|my|the)?\b/i,
            /\bmake\s*(this|it)\s*(better|shorter|cleaner|punchier)/i,
            /\bimprove\s*(this|it|my|the)?\b/i,
            /\btighten\s*(this|it|up)?\b/i,
        ],
        // Boost confidence if user's message contains a quote or long text
        contextBoost: (message) => {
            const hasQuotedText = /["'`].*["'`]/s.test(message);
            const hasLongText = message.length > 150;
            return hasQuotedText || hasLongText ? 0.2 : 0;
        },
        weight: 1.0,
    },

    [Intent.DRAFT_OUTREACH]: {
        keywords: [
            /\bdraft\s*(a|an|me)?\s*(text|email|message|intro|outreach)\b/i,
            /\bwrite\s*(a|an|me)?\s*(text|email|message|intro|outreach)\b/i,
            /\bsend\s*(a|an)?\s*(text|email|message)\b/i,
            /\bcreate\s*(a|an)?\s*(text|email|message|outreach)\b/i,
            /\bcompose\s*(a|an)?\s*(text|email|message)\b/i,
            /\bintro\s*(text|message|email)\b/i,
            /\bfollow\s*up\s*(text|message|email)\b/i,
            /\bpay\s*package\s*(outreach|interest)\b/i,
            /\bcold\s*(outreach|email|text)\b/i,
        ],
        contextBoost: (message, hasAttachment) => hasAttachment ? 0.15 : 0,
        weight: 0.95,
    },

    [Intent.CAMPAIGN_WORKFLOW]: {
        keywords: [
            /\bcampaign\b/i,
            /\bblast\s*(email|text)?\b/i,
            /\bbulk\s*(email|send|outreach)\b/i,
            /\badd\s*recipients\b/i,
            /\bgenerate\s*(emails|blast)\b/i,
            /\bsend\s*campaign\b/i,
        ],
        contextBoost: () => 0,
        weight: 0.9,
    },

    [Intent.DATABASE_ACTION]: {
        keywords: [
            /\bsave\s*(as|this|her|him|them|it)?\b/i,
            /\bupdate\s*(status|specialty|this|her|him)\b/i,
            /\bmove\s*(to|status)\b/i,
            /\badd\s*(prospect|candidate|to\s*pipeline)\b/i,
            /\bchange\s*(status|specialty|to)\b/i,
            /\bset\s*(status|specialty|as)\b/i,
            /\bmark\s*(as|sent)\b/i,
        ],
        contextBoost: () => 0,
        weight: 0.85,
    },

    [Intent.SEARCH_QUERY]: {
        keywords: [
            /\bfind\s*(candidate|prospect|me|a)?\b/i,
            /\bsearch\s*(for|candidate|prospect)?\b/i,
            /\blook\s*up\b/i,
            /\bwho\s*(is|are)\b/i,
            /\bshow\s*(me|the)?\b/i,
            /\bget\s*(details|info|status)\b/i,
            /\bpull\s*(up)?\b/i,
            /\bpipeline\s*(brief|status|report)\b/i,
        ],
        contextBoost: () => 0,
        weight: 0.8,
    },
};

/**
 * Classification result with confidence scoring
 * @typedef {Object} ClassificationResult
 * @property {Intent} intent - The detected intent
 * @property {number} confidence - Confidence score (0-1)
 * @property {string[]} matchedPatterns - Which patterns triggered the match
 * @property {boolean} requiresTools - Whether this intent needs database tools
 */

/**
 * Classify the user's intent based on their message and context
 * 
 * @param {Object} options - Classification options
 * @param {string} options.message - The user's last message
 * @param {boolean} [options.hasAttachment=false] - Whether the message includes attachments
 * @param {Array} [options.history=[]] - Recent conversation history for context
 * @returns {ClassificationResult} The classification result
 */
export function classify({ message, hasAttachment = false, history = [] }) {
    if (!message || typeof message !== 'string') {
        return {
            intent: Intent.GENERAL,
            confidence: 0.5,
            matchedPatterns: [],
            requiresTools: false,
        };
    }

    const normalizedMessage = message.trim().toLowerCase();
    const scores = new Map();
    const matches = new Map();

    // Score each intent based on pattern matches
    for (const [intent, config] of Object.entries(INTENT_PATTERNS)) {
        let score = 0;
        const matchedPatterns = [];

        for (const pattern of config.keywords) {
            if (pattern.test(message)) {
                score += config.weight;
                matchedPatterns.push(pattern.source);
            }
        }

        // Apply context boost
        if (config.contextBoost) {
            score += config.contextBoost(message, hasAttachment);
        }

        if (score > 0) {
            scores.set(intent, score);
            matches.set(intent, matchedPatterns);
        }
    }

    // Find the highest scoring intent
    let bestIntent = Intent.GENERAL;
    let bestScore = 0;
    let bestMatches = [];

    for (const [intent, score] of scores) {
        if (score > bestScore) {
            bestScore = score;
            bestIntent = intent;
            bestMatches = matches.get(intent) || [];
        }
    }

    // Normalize confidence to 0-1 range
    const confidence = Math.min(bestScore / 1.5, 1.0);

    // Determine if tools are needed
    const toolIntents = new Set([
        Intent.DATABASE_ACTION,
        Intent.SEARCH_QUERY,
        Intent.CAMPAIGN_WORKFLOW,
        Intent.DRAFT_OUTREACH, // May need to lookup candidate info
    ]);

    return {
        intent: bestIntent,
        confidence,
        matchedPatterns: bestMatches,
        requiresTools: toolIntents.has(bestIntent),
    };
}

/**
 * Get a human-readable description of the intent for logging
 * @param {Intent} intent - The intent to describe
 * @returns {string} Human-readable description
 */
export function describeIntent(intent) {
    const descriptions = {
        [Intent.EDIT_CONTENT]: 'Editing user-provided content',
        [Intent.DRAFT_OUTREACH]: 'Drafting new outreach message',
        [Intent.DATABASE_ACTION]: 'Executing database operation',
        [Intent.SEARCH_QUERY]: 'Searching for information',
        [Intent.CAMPAIGN_WORKFLOW]: 'Running campaign workflow',
        [Intent.GENERAL]: 'General conversation',
    };
    return descriptions[intent] || 'Unknown intent';
}

export default { classify, describeIntent, Intent };
