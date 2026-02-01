/**
 * Tab-Keyed Storage Hooks — State Isolation Layer
 * 
 * These hooks ensure the Side Panel always shows data
 * for the ACTIVE tab, preventing state pollution between
 * different candidates.
 */
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"
import {
    StorageKeys,
    CandidateContextSchema,
    EmailDraftSchema,
    type CandidateContext,
    type EmailDraft
} from "~core/messaging/schemas"

// Use session storage (RAM only, cleared on browser close)
const storage = new Storage({ area: "session" })

/**
 * Hook to get/set the active tab ID
 */
export function useActiveTabId() {
    return useStorage<number | null>({
        key: StorageKeys.activeTabId,
        instance: storage,
    })
}

/**
 * Hook to get context for the CURRENTLY ACTIVE tab
 * 
 * When user switches tabs, this hook automatically returns
 * the new tab's context data.
 */
export function useTabContext() {
    const [activeTabId] = useActiveTabId()

    const [rawContext, setRawContext] = useStorage<CandidateContext | null>({
        key: activeTabId ? StorageKeys.contextForTab(activeTabId) : "context_null",
        instance: storage,
    })

    // Validate on read (defense in depth)
    const context = rawContext
        ? CandidateContextSchema.safeParse(rawContext).data ?? null
        : null

    return {
        tabId: activeTabId,
        context,
        isLoading: activeTabId !== null && !context,
        setContext: setRawContext,
    }
}

/**
 * Hook to get/set draft for the CURRENTLY ACTIVE tab
 */
export function useTabDraft() {
    const [activeTabId] = useActiveTabId()

    const [rawDraft, setRawDraft] = useStorage<EmailDraft | null>({
        key: activeTabId ? StorageKeys.draftForTab(activeTabId) : "draft_null",
        instance: storage,
    })

    const draft = rawDraft
        ? EmailDraftSchema.safeParse(rawDraft).data ?? null
        : null

    return {
        tabId: activeTabId,
        draft,
        setDraft: setRawDraft,
        clearDraft: () => setRawDraft(null),
    }
}

/**
 * Hook to get screenshot for the CURRENTLY ACTIVE tab
 */
export function useTabScreenshot() {
    const [activeTabId] = useActiveTabId()

    const [screenshot, setScreenshot] = useStorage<string | null>({
        key: activeTabId ? StorageKeys.screenshotForTab(activeTabId) : "screenshot_null",
        instance: storage,
    })

    return {
        screenshot,
        setScreenshot,
        clearScreenshot: () => setScreenshot(null),
    }
}

// ============================================================================
// IMPERATIVE STORAGE API (for Service Worker)
// ============================================================================

/**
 * Direct storage access for background script
 * (Service Worker cannot use React hooks)
 */
export const tabStorage = {
    async setActiveTabId(tabId: number) {
        await storage.set(StorageKeys.activeTabId, tabId)
    },

    async getActiveTabId(): Promise<number | null> {
        return storage.get<number | null>(StorageKeys.activeTabId)
    },

    async setContext(tabId: number, context: CandidateContext) {
        // Validate before writing
        const validated = CandidateContextSchema.parse(context)
        await storage.set(StorageKeys.contextForTab(tabId), validated)
    },

    async getContext(tabId: number): Promise<CandidateContext | null> {
        const raw = await storage.get<CandidateContext>(StorageKeys.contextForTab(tabId))
        if (!raw) return null

        const result = CandidateContextSchema.safeParse(raw)
        return result.success ? result.data : null
    },

    async clearContext(tabId: number) {
        await storage.remove(StorageKeys.contextForTab(tabId))
    },

    async setDraft(tabId: number, draft: EmailDraft) {
        const validated = EmailDraftSchema.parse(draft)
        await storage.set(StorageKeys.draftForTab(tabId), validated)
    },

    async getDraft(tabId: number): Promise<EmailDraft | null> {
        const raw = await storage.get<EmailDraft>(StorageKeys.draftForTab(tabId))
        if (!raw) return null

        const result = EmailDraftSchema.safeParse(raw)
        return result.success ? result.data : null
    },

    async setScreenshot(tabId: number, dataUrl: string) {
        await storage.set(StorageKeys.screenshotForTab(tabId), dataUrl)
    },

    async getScreenshot(tabId: number): Promise<string | null> {
        return storage.get<string | null>(StorageKeys.screenshotForTab(tabId))
    },

    async clearTab(tabId: number) {
        await Promise.all([
            storage.remove(StorageKeys.contextForTab(tabId)),
            storage.remove(StorageKeys.draftForTab(tabId)),
            storage.remove(StorageKeys.screenshotForTab(tabId)),
        ])
    },
}
