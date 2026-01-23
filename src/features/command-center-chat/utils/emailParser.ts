/**
 * Email Parser Utility
 * 
 * Tag-based parsing for extracting email content from AI responses.
 * Uses [SUBJECT]...[/SUBJECT] and [BODY]...[/BODY] delimiters.
 */

export interface ParsedEmail {
    subject: string | null;
    body: string | null;
    hasEmail: boolean;
}

/**
 * Extract email content from AI response using tag delimiters.
 * Falls back to heuristic extraction if tags are not present.
 */
export function parseEmailFromResponse(text: string): ParsedEmail {
    // Try tag-based extraction first
    const subjectMatch = text.match(/\[SUBJECT\]([\s\S]*?)\[\/SUBJECT\]/i);
    const bodyMatch = text.match(/\[BODY\]([\s\S]*?)\[\/BODY\]/i);

    if (subjectMatch && bodyMatch) {
        return {
            subject: subjectMatch[1].trim(),
            body: bodyMatch[1].trim(),
            hasEmail: true
        };
    }

    // Fallback: Try to extract from common patterns
    // Look for "Subject:" line followed by body content
    const subjectLineMatch = text.match(/Subject:\s*(.+?)(?:\n|$)/i);
    const bodyLineMatch = text.match(/Body:\s*([\s\S]+?)(?:(?:Best|Regards|Thank|Sincerely)[\s\S]*$|$)/i);

    if (subjectLineMatch) {
        return {
            subject: subjectLineMatch[1].trim(),
            body: bodyLineMatch ? bodyLineMatch[1].trim() : extractBodyAfterSubject(text, subjectLineMatch.index || 0),
            hasEmail: true
        };
    }

    return {
        subject: null,
        body: null,
        hasEmail: false
    };
}

/**
 * Extract body text after the subject line.
 */
function extractBodyAfterSubject(text: string, subjectEnd: number): string {
    const remaining = text.slice(subjectEnd);
    // Look for the next newline after subject, then grab everything
    const bodyStart = remaining.indexOf('\n');
    if (bodyStart === -1) return '';

    return remaining.slice(bodyStart).trim();
}

/**
 * Build mailto link with proper encoding.
 */
export function buildMailtoLink(
    to: string,
    subject: string,
    body: string,
    cc?: string
): string {
    const params = new URLSearchParams();
    if (cc) params.set('cc', cc);
    params.set('subject', subject);
    params.set('body', body);

    return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}

/**
 * Check if text looks like it contains an email draft.
 */
export function hasEmailContent(text: string): boolean {
    // Check for explicit tags
    if (text.includes('[SUBJECT]') || text.includes('[BODY]')) {
        return true;
    }

    // Check for common email patterns
    const emailPatterns = [
        /Subject:\s*.+/i,
        /^Hi\s+\w+,?\s*\n/m,
        /^Dear\s+\w+,?\s*\n/m,
        /Best,?\s*\n/i,
        /Regards,?\s*\n/i,
        /Thank you[,!]?\s*\n/i
    ];

    return emailPatterns.some(pattern => pattern.test(text));
}
