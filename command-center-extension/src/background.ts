/**
 * Background Service Worker — Application Kernel
 * 
 * This is the "brain" of the extension:
 * - Tracks active tab ID
 * - Handles message routing
 * - Manages storage writes (only writer!)
 * - Survives SW suspension via tab-keyed storage
 */
import { initMessageRouter, onMessage } from "~core/messaging"
import { tabStorage } from "~core/storage"
import { secureCapture } from "~features/secure-capture"

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log("[Background] Service Worker starting...")

// Initialize typed message router
initMessageRouter()

// ============================================================================
// TAB TRACKING
// ============================================================================

// Track active tab changes
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    console.log(`[Background] Tab activated: ${tabId}`)
    await tabStorage.setActiveTabId(tabId)
})

// Handle tab updates (URL changes within same tab)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.active) {
        console.log(`[Background] Tab updated: ${tabId}`)
        await tabStorage.setActiveTabId(tabId)
    }
})

// Cleanup when tab closes
chrome.tabs.onRemoved.addListener(async (tabId) => {
    console.log(`[Background] Tab closed: ${tabId}`)
    await tabStorage.clearTab(tabId)
})

// Initialize with current active tab
chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
    if (tab?.id) {
        await tabStorage.setActiveTabId(tab.id)
        console.log(`[Background] Initialized with tab: ${tab.id}`)
    }
})

// ============================================================================
// MESSAGE HANDLERS
// ============================================================================

// Handle context scraped from content scripts
onMessage("CONTEXT_SCRAPED", async (msg) => {
    const { tabId, payload } = msg
    if (!tabId || !payload) {
        console.warn("[Background] CONTEXT_SCRAPED missing tabId or payload")
        return
    }

    console.log(`[Background] Context scraped for tab ${tabId}:`, payload)
    await tabStorage.setContext(tabId, payload)
})

// Handle tab capture requests
onMessage("CAPTURE_TAB", async (msg) => {
    const activeTabId = await tabStorage.getActiveTabId()
    if (!activeTabId) {
        console.error("[Background] No active tab for capture")
        return
    }

    console.log(`[Background] Capturing tab: ${activeTabId}`)

    try {
        const screenshot = await secureCapture(activeTabId)
        await tabStorage.setScreenshot(activeTabId, screenshot)
        console.log("[Background] Screenshot saved to storage")
    } catch (err) {
        console.error("[Background] Capture failed:", err)
    }
})

// Handle side panel open requests
onMessage("OPEN_SIDE_PANEL", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId })
    }
})

// ============================================================================
// ACTION CLICK (ICON CLICK)
// ============================================================================

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
    if (tab.windowId) {
        await chrome.sidePanel.open({ windowId: tab.windowId })
    }
})

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
}).catch(console.error)

console.log("[Background] Service Worker ready")
