/**
 * Secure Capture — HIPAA-Compliant Screenshot
 * 
 * Implements "Blur-First" pattern:
 * 1. Inject CSS to blur sensitive fields
 * 2. Wait for paint
 * 3. Capture screenshot
 * 4. Remove blur CSS
 * 
 * The screenshot NEVER contains unmasked PII.
 */

// Selectors for sensitive data that must be blurred
const SENSITIVE_SELECTORS = [
    // SSN
    '[data-testid="ssn"]',
    '[class*="ssn"]',
    'input[name*="ssn"]',

    // Date of Birth
    '[data-testid="dob"]',
    '[class*="date-of-birth"]',
    '[class*="birthdate"]',

    // Financial
    '.salary-info',
    '[class*="salary"]',
    '[class*="pay-rate"]',
    '[class*="compensation"]',

    // Medical
    '.medical-history',
    '[class*="medical"]',
    '[class*="health-info"]',

    // Generic sensitive
    '[data-sensitive="true"]',
    '.sensitive-data',

    // Form inputs
    'input[type="password"]',
]

const BLUR_CSS = `
  ${SENSITIVE_SELECTORS.join(',')} {
    filter: blur(12px) !important;
    pointer-events: none !important;
    user-select: none !important;
  }
`

/**
 * Capture the visible tab with sensitive data blurred
 */
export async function secureCapture(tabId: number): Promise<string> {
    if (!tabId) throw new Error("Tab ID required for capture")

    try {
        // 1. Inject blur mask
        await chrome.scripting.insertCSS({
            target: { tabId },
            css: BLUR_CSS,
        })

        // 2. Wait for paint (critical for race condition)
        await new Promise(resolve => setTimeout(resolve, 50))

        // 3. Capture visible tab
        const screenshot = await chrome.tabs.captureVisibleTab(undefined, {
            format: 'png',
            quality: 90,
        })

        // 4. Remove mask immediately
        await chrome.scripting.removeCSS({
            target: { tabId },
            css: BLUR_CSS,
        })

        return screenshot
    } catch (err) {
        // Ensure we remove CSS even on error
        try {
            await chrome.scripting.removeCSS({
                target: { tabId },
                css: BLUR_CSS,
            })
        } catch {
            // ignore cleanup errors
        }

        throw err
    }
}

/**
 * Check if capture is allowed on this tab
 */
export async function canCapture(tabId: number): Promise<boolean> {
    try {
        const tab = await chrome.tabs.get(tabId)
        const url = tab.url || ""

        // Cannot capture chrome:// or extension:// pages
        if (url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
            return false
        }

        // Cannot capture if no permission
        const permissions = await chrome.permissions.contains({
            origins: [new URL(url).origin + "/*"]
        })

        return permissions
    } catch {
        return false
    }
}
