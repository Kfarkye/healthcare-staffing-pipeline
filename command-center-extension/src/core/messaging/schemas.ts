/**
 * Core Zod Schemas — Enterprise Validation Layer
 * 
 * All data scraped from DOM or received from background MUST pass
 * through these schemas before entering application state.
 */
import { z } from "zod"

// ============================================================================
// CONTEXT SCHEMAS
// ============================================================================

export const CandidateSchema = z.object({
    name: z.string().min(1, "Candidate name is required"),
    novaId: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    specialty: z.string().optional(),
})

export const ContextSourceSchema = z.enum([
    "NOVA",
    "OUTLOOK",
    "GMAIL",
    "UNKNOWN"
])

export const CandidateContextSchema = z.object({
    source: ContextSourceSchema,
    candidate: CandidateSchema,
    pageUrl: z.string().url().optional(),
    scrapedAt: z.string().datetime().optional(),
})

export type CandidateContext = z.infer<typeof CandidateContextSchema>
export type Candidate = z.infer<typeof CandidateSchema>
export type ContextSource = z.infer<typeof ContextSourceSchema>

// ============================================================================
// DRAFT SCHEMAS
// ============================================================================

export const EmailDraftSchema = z.object({
    to: z.string().email().optional(),
    cc: z.string().optional(),
    subject: z.string(),
    body: z.string(),
    generatedAt: z.string().datetime(),
})

export type EmailDraft = z.infer<typeof EmailDraftSchema>

// ============================================================================
// MESSAGE BUS SCHEMAS
// ============================================================================

export const MessageTypeSchema = z.enum([
    // Context events
    "CONTEXT_SCRAPED",
    "CONTEXT_CLEARED",

    // Tab events
    "TAB_ACTIVATED",
    "TAB_CLOSED",

    // Capture events
    "CAPTURE_TAB",
    "CAPTURE_COMPLETED",

    // Draft events
    "GENERATE_DRAFT",
    "DRAFT_COMPLETED",
    "DRAFT_ERROR",

    // UI events
    "OPEN_SIDE_PANEL",
    "COPY_DRAFT",
])

export type MessageType = z.infer<typeof MessageTypeSchema>

export const BusMessageSchema = z.object({
    type: MessageTypeSchema,
    payload: z.any().optional(),
    tabId: z.number().optional(),
    timestamp: z.number().default(() => Date.now()),
})

export type BusMessage = z.infer<typeof BusMessageSchema>

// ============================================================================
// STORAGE KEY HELPERS
// ============================================================================

export const StorageKeys = {
    activeTabId: "activeTabId",
    contextForTab: (tabId: number) => `context_${tabId}`,
    draftForTab: (tabId: number) => `draft_${tabId}`,
    screenshotForTab: (tabId: number) => `screenshot_${tabId}`,
} as const
