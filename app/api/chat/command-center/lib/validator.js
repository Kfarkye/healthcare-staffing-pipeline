/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * VALIDATOR — Content Quality Assurance
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Validates and optionally auto-fixes generated content.
 * Ensures output meets quality standards before delivery.
 * 
 * @module app/api/chat/command-center/lib/validator
 */

/**
 * Validation rule definitions
 * Each rule has a test function and optional fix function
 */
const VALIDATION_RULES = [
  {
    id: 'empty_response',
    description: 'Response is empty or whitespace only',
    test: (text) => (text ?? '').trim().length === 0,
    severity: 'error',
    fix: null, // Cannot auto-fix empty responses
  },
  {
    id: 'excessive_whitespace',
    description: 'Contains excessive whitespace or blank lines',
    test: (text) => /\n{4,}/.test(text) || /[ \t]{4,}/.test(text),
    severity: 'warning',
    fix: (text) => text
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/[ \t]{4,}/g, ' '),
  },
  {
    id: 'trailing_whitespace',
    description: 'Contains trailing whitespace on lines',
    test: (text) => /[ \t]+\n/.test(text) || /[ \t]+$/.test(text),
    severity: 'info',
    fix: (text) => text
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trimEnd(),
  },
  {
    id: 'incomplete_sentence',
    description: 'Response appears incomplete (ends mid-sentence)',
    test: (text) => {
      const trimmed = text.trim();
      if (trimmed.length < 10) return false;
      
      // Check if ends with proper punctuation or code block
      const endsWithPunctuation = /[.!?:;"')\]}`]$/.test(trimmed);
      const endsWithCodeBlock = /```\s*$/.test(trimmed);
      const endsWithListItem = /[-*]\s+\S+$/.test(trimmed);
      
      return !endsWithPunctuation && !endsWithCodeBlock && !endsWithListItem;
    },
    severity: 'warning',
    fix: null, // Cannot safely auto-complete sentences
  },
  {
    id: 'unclosed_code_block',
    description: 'Code block is not properly closed',
    test: (text) => {
      const openCount = (text.match(/```/g) || []).length;
      return openCount % 2 !== 0;
    },
    severity: 'warning',
    fix: (text) => {
      const openCount = (text.match(/```/g) || []).length;
      if (openCount % 2 !== 0) {
        return text.trimEnd() + '\n```';
      }
      return text;
    },
  },
  {
    id: 'placeholder_text',
    description: 'Contains placeholder text that should be replaced',
    test: (text) => /\[(?:INSERT|PLACEHOLDER|YOUR|TODO|XXX|FIXME)\b[^\]]*\]/i.test(text),
    severity: 'warning',
    fix: null, // Placeholders need human review
  },
  {
    id: 'html_entities',
    description: 'Contains unescaped HTML entities',
    test: (text) => /&(?:amp|lt|gt|quot|apos|nbsp);/.test(text),
    severity: 'info',
    fix: (text) => text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' '),
  },
  {
    id: 'excessive_punctuation',
    description: 'Contains excessive punctuation',
    test: (text) => /[!]{3,}|[?]{3,}|[.]{4,}/.test(text),
    severity: 'info',
    fix: (text) => text
      .replace(/!{3,}/g, '!')
      .replace(/\?{3,}/g, '?')
      .replace(/\.{4,}/g, '...'),
  },
  {
    id: 'smart_quotes',
    description: 'Contains inconsistent quote styles',
    test: (text) => {
      const hasSmartQuotes = /[""'']/.test(text);
      const hasStraightQuotes = /["']/.test(text);
      return hasSmartQuotes && hasStraightQuotes;
    },
    severity: 'info',
    fix: null, // Quote style is context-dependent
  },
];

/**
 * Validates text content against all rules
 * 
 * @param {string} text - Content to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.autoFix - Whether to apply automatic fixes
 * @param {string[]} options.skipRules - Rule IDs to skip
 * @returns {Object} - Validation result
 */
export function validate(text, options = {}) {
  const { autoFix = false, skipRules = [] } = options;
  
  let processedText = text ?? '';
  const issues = [];
  const fixes = [];

  for (const rule of VALIDATION_RULES) {
    // Skip if rule is in skip list
    if (skipRules.includes(rule.id)) continue;

    // Test the rule
    if (rule.test(processedText)) {
      issues.push({
        id: rule.id,
        description: rule.description,
        severity: rule.severity,
        fixable: !!rule.fix,
      });

      // Apply fix if enabled and available
      if (autoFix && rule.fix) {
        const beforeFix = processedText;
        processedText = rule.fix(processedText);
        
        if (beforeFix !== processedText) {
          fixes.push({
            id: rule.id,
            description: rule.description,
          });
        }
      }
    }
  }

  // Determine overall validity
  const hasErrors = issues.some((i) => i.severity === 'error');
  const hasWarnings = issues.some((i) => i.severity === 'warning');

  return {
    valid: !hasErrors,
    clean: issues.length === 0,
    text: processedText,
    issues,
    fixes,
    summary: {
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
      fixed: fixes.length,
    },
  };
}

/**
 * Quick check if text passes basic validation
 * 
 * @param {string} text - Content to check
 * @returns {boolean} - True if text passes basic validation
 */
export function isValid(text) {
  return validate(text).valid;
}

/**
 * Gets all validation rules (for debugging/testing)
 * 
 * @returns {Array} - List of validation rules
 */
export function getRules() {
  return VALIDATION_RULES.map((rule) => ({
    id: rule.id,
    description: rule.description,
    severity: rule.severity,
    fixable: !!rule.fix,
  }));
}

export default { validate, isValid, getRules };
