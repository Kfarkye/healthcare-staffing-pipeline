/**
 * PII Redaction — Client-Side Data Scrubbing
 * 
 * This runs BEFORE any data is sent to the LLM.
 * Never trust the AI not to leak — redact on the client.
 */

// Patterns for common PII
const PII_PATTERNS = [
    // SSN: 123-45-6789 or 123456789
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: "[SSN REDACTED]" },
    { pattern: /\b\d{9}\b/g, label: "[SSN REDACTED]" },

    // DOB: 01/15/1990 or 1990-01-15
    { pattern: /\b\d{2}\/\d{2}\/\d{4}\b/g, label: "[DOB REDACTED]" },
    { pattern: /\b\d{4}-\d{2}-\d{2}\b/g, label: "[DOB REDACTED]" },

    // Credit card: 1234-5678-9012-3456
    { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, label: "[CC REDACTED]" },
]

/**
 * Redact PII from text before sending to LLM
 */
export function redactPII(text: string): string {
    let clean = text

    for (const { pattern, label } of PII_PATTERNS) {
        clean = clean.replace(pattern, label)
    }

    return clean
}

/**
 * Check if text contains any PII patterns
 */
export function containsPII(text: string): boolean {
    for (const { pattern } of PII_PATTERNS) {
        pattern.lastIndex = 0
        if (pattern.test(text)) return true
    }
    return false
}

/**
 * Get count of PII instances found
 */
export function countPII(text: string): number {
    let count = 0

    for (const { pattern } of PII_PATTERNS) {
        pattern.lastIndex = 0
        const matches = text.match(pattern)
        if (matches) count += matches.length
    }

    return count
}
