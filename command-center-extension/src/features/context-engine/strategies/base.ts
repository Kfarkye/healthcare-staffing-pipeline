/**
 * Context Strategy Interface
 * 
 * Each strategy knows how to detect and extract candidate
 * context from a specific application (Nova, Outlook, etc.)
 */
import type { CandidateContext } from "~core/messaging/schemas"

export interface ContextStrategy {
    /**
     * Check if this strategy applies to the current URL
     */
    match(url: string): boolean

    /**
     * Extract candidate context from the page DOM
     * Returns null if extraction fails
     */
    extract(): Promise<CandidateContext | null>
}
