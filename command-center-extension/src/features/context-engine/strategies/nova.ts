/**
 * Nova Context Strategy
 * 
 * Extracts candidate information from Nova ATS pages.
 * Handles dynamic SPAs with fallback selectors.
 */
import { CandidateContextSchema, type CandidateContext } from "~core/messaging/schemas"
import type { ContextStrategy } from "./base"

export class NovaStrategy implements ContextStrategy {
    match(url: string): boolean {
        return url.includes("nova.ayahealthcare.com")
    }

    async extract(): Promise<CandidateContext | null> {
        try {
            // Extract Nova ID from URL
            // Pattern: /recruiting/candidates/{novaId}/new-profile/about
            const novaIdMatch = location.href.match(/candidates\/(\d+)/)
            const novaId = novaIdMatch?.[1]

            // Scrape candidate name with fallbacks
            const name = this.extractText([
                '[data-testid="candidate-name"]',
                '.candidate-header h1',
                '.profile-header .name',
                'h1[class*="candidate"]',
            ])

            if (!name) {
                console.warn("[NovaStrategy] Could not find candidate name")
                return null
            }

            // Scrape email with fallbacks
            const email = this.extractText([
                '[data-testid="primary-email"]',
                'a[href^="mailto:"]',
                '.contact-info .email',
                '[class*="email"]',
            ]) || undefined

            // Scrape phone with fallbacks
            const phone = this.extractText([
                '[data-testid="primary-phone"]',
                'a[href^="tel:"]',
                '.contact-info .phone',
                '[class*="phone"]',
            ]) || undefined

            // Scrape specialty if available
            const specialty = this.extractText([
                '[data-testid="specialty"]',
                '.specialty',
                '[class*="specialty"]',
            ]) || undefined

            // Build and validate context
            const context: CandidateContext = {
                source: "NOVA",
                candidate: {
                    name,
                    novaId,
                    email: this.isValidEmail(email) ? email : undefined,
                    phone,
                    specialty,
                },
                pageUrl: location.href,
                scrapedAt: new Date().toISOString(),
            }

            // Validate with Zod before returning
            const result = CandidateContextSchema.safeParse(context)

            if (!result.success) {
                console.error("[NovaStrategy] Validation failed:", result.error)
                return null
            }

            return result.data
        } catch (err) {
            console.error("[NovaStrategy] Extraction error:", err)
            return null
        }
    }

    /**
     * Try multiple selectors, return first match
     */
    private extractText(selectors: string[]): string | null {
        for (const selector of selectors) {
            const el = document.querySelector(selector)
            const text = el?.textContent?.trim()
            if (text) return text
        }
        return null
    }

    /**
     * Basic email validation
     */
    private isValidEmail(email?: string): boolean {
        if (!email) return false
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    }
}
