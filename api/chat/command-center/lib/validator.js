/**
 * Validator - Output Quality Assurance
 * 
 * Purpose: Scan AI-generated output for common mistakes before sending to user.
 * This is the final safety net that catches placeholder text, banned phrases,
 * and other quality issues the model might slip through.
 * 
 * Design Principles:
 * - Fast regex-based checks (no AI calls)
 * - Configurable severity levels
 * - Auto-fix where safe, flag where not
 * 
 * @module lib/validator
 */

import { RECRUITER_IDENTITY } from './prompts.js';

/**
 * Validation issue severity levels
 * @readonly
 * @enum {string}
 */
export const Severity = Object.freeze({
    /** Critical issue that must be fixed or regenerated */
    ERROR: 'ERROR',
    /** Potential issue that should be reviewed */
    WARNING: 'WARNING',
    /** Minor suggestion for improvement */
    INFO: 'INFO',
});

/**
 * Validation issue structure
 * @typedef {Object} ValidationIssue
 * @property {Severity} severity - How serious the issue is
 * @property {string} code - Machine-readable issue code
 * @property {string} message - Human-readable description
 * @property {string} [match] - The problematic text that was found
 * @property {string} [suggestion] - Suggested fix
 * @property {boolean} [autoFixable] - Whether this can be auto-corrected
 */

/**
 * Validation rules - each rule checks for a specific issue
 */
const VALIDATION_RULES = [
    // =========================================================================
    // PLACEHOLDER DETECTION (Critical)
    // =========================================================================
    {
        code: 'PLACEHOLDER_NAME',
        severity: Severity.ERROR,
        pattern: /\[(?:Name|Your\s*Name|Recruiter\s*Name|First\s*Name)\]/gi,
        message: 'Found placeholder for name instead of actual recruiter name',
        autoFix: (text) => text.replace(
            /\[(?:Name|Your\s*Name|Recruiter\s*Name|First\s*Name)\]/gi,
            RECRUITER_IDENTITY.name
        ),
    },
    {
        code: 'PLACEHOLDER_CANDIDATE',
        severity: Severity.ERROR,
        pattern: /\[(?:Candidate|Candidate\s*Name|Their\s*Name)\]/gi,
        message: 'Found placeholder for candidate name',
        autoFix: null, // Can't auto-fix without context
    },
    {
        code: 'PLACEHOLDER_GENERIC',
        severity: Severity.ERROR,
        pattern: /\[(?:Subject|Body|Email|Phone|Date|Time|Location|Facility|Role|Position)\]/gi,
        message: 'Found generic placeholder bracket',
        autoFix: null,
    },
    {
        code: 'PLACEHOLDER_BRACKETS',
        severity: Severity.WARNING,
        pattern: /\[[A-Z][A-Za-z\s]{2,20}\]/g,
        message: 'Found text in brackets that looks like a placeholder',
        autoFix: null,
    },

    // =========================================================================
    // BANNED PHRASES (Presumptuous/Aggressive)
    // =========================================================================
    {
        code: 'BANNED_CLICKED_INTERESTED',
        severity: Severity.WARNING,
        pattern: /I\s+saw\s+you\s+(?:clicked|flagged|showed|expressed)\s+interest/gi,
        message: 'Assumes prior engagement - inappropriate for first contact',
        autoFix: null,
    },
    {
        code: 'BANNED_NEW_RECRUITER',
        severity: Severity.WARNING,
        pattern: /I['']?m\s+(?:your\s+)?new\s+recruiter/gi,
        message: 'Presumptuous phrasing for first contact',
        autoFix: null,
    },
    {
        code: 'BANNED_SUBMIT_TODAY',
        severity: Severity.INFO,
        pattern: /(?:get\s+you\s+)?submitted\s+(?:for\s+(?:these|this|that)\s+)?today/gi,
        message: 'Aggressive sales language',
        autoFix: null,
    },
    {
        code: 'BANNED_UNASSIGNED',
        severity: Severity.WARNING,
        pattern: /I['']?m\s+(?:currently\s+)?unassigned\s+to\s+your\s+profile/gi,
        message: 'Awkward internal jargon',
        autoFix: null,
    },

    // =========================================================================
    // FORMAT ISSUES
    // =========================================================================
    {
        code: 'MARKDOWN_IN_SMS',
        severity: Severity.INFO,
        pattern: /\*\*[^*]+\*\*/g,
        message: 'Markdown bold found - may not render in SMS',
        autoFix: (text) => text.replace(/\*\*([^*]+)\*\*/g, '$1'),
    },
    {
        code: 'WRONG_NOVA_URL',
        severity: Severity.ERROR,
        pattern: /nova\.ayahealthcare\.com\/traveler\/profile\//gi,
        message: 'Wrong Nova URL format (should use /#/recruiting/candidates/)',
        autoFix: (text) => text.replace(
            /nova\.ayahealthcare\.com\/traveler\/profile\/(\d+)/gi,
            'nova.ayahealthcare.com/#/recruiting/candidates/$1/new-profile/about'
        ),
    },
];

/**
 * Validate AI-generated output
 * 
 * @param {string} text - The AI-generated text to validate
 * @param {Object} [options={}] - Validation options
 * @param {boolean} [options.autoFix=true] - Whether to apply auto-fixes
 * @param {Severity[]} [options.severityFilter] - Only return issues of these severities
 * @returns {Object} Validation result
 * @property {boolean} valid - Whether the text passed validation (no ERROR severity issues)
 * @property {string} text - The (possibly auto-fixed) text
 * @property {ValidationIssue[]} issues - List of found issues
 * @property {number} errorCount - Number of ERROR severity issues
 * @property {number} warningCount - Number of WARNING severity issues
 */
export function validate(text, options = {}) {
    const { autoFix = true, severityFilter = null } = options;

    if (!text || typeof text !== 'string') {
        return {
            valid: true,
            text: text || '',
            issues: [],
            errorCount: 0,
            warningCount: 0,
        };
    }

    let processedText = text;
    const issues = [];

    for (const rule of VALIDATION_RULES) {
        const matches = text.match(rule.pattern);

        if (matches && matches.length > 0) {
            // Check severity filter
            if (severityFilter && !severityFilter.includes(rule.severity)) {
                continue;
            }

            issues.push({
                severity: rule.severity,
                code: rule.code,
                message: rule.message,
                match: matches[0],
                matchCount: matches.length,
                autoFixable: !!rule.autoFix,
            });

            // Apply auto-fix if enabled and available
            if (autoFix && rule.autoFix) {
                processedText = rule.autoFix(processedText);
            }
        }
    }

    const errorCount = issues.filter(i => i.severity === Severity.ERROR).length;
    const warningCount = issues.filter(i => i.severity === Severity.WARNING).length;

    return {
        valid: errorCount === 0 || (autoFix && issues.every(i => i.autoFixable || i.severity !== Severity.ERROR)),
        text: processedText,
        issues,
        errorCount,
        warningCount,
    };
}

/**
 * Quick check if text contains critical issues (for pre-screening)
 * 
 * @param {string} text - Text to check
 * @returns {boolean} True if text has no critical issues
 */
export function isClean(text) {
    if (!text) return true;

    const criticalPatterns = [
        /\[(?:Name|Your\s*Name)\]/i,
        /\[(?:Candidate|Subject|Body)\]/i,
    ];

    return !criticalPatterns.some(p => p.test(text));
}

/**
 * Get validation summary for logging
 * 
 * @param {Object} result - Validation result from validate()
 * @returns {string} Human-readable summary
 */
export function summarize(result) {
    if (result.valid && result.issues.length === 0) {
        return 'PASS: No issues found';
    }

    const parts = [];
    if (result.errorCount > 0) parts.push(`${result.errorCount} error(s)`);
    if (result.warningCount > 0) parts.push(`${result.warningCount} warning(s)`);

    const status = result.valid ? 'PASS (auto-fixed)' : 'FAIL';
    return `${status}: ${parts.join(', ')}`;
}

export default { validate, isClean, summarize, Severity };
