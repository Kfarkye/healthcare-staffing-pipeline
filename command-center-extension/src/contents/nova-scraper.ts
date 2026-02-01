/**
 * Nova Scraper Content Script
 * 
 * Runs on nova.ayahealthcare.com pages.
 * Extracts candidate context and sends to background.
 */
import type { PlasmoCSConfig } from "plasmo"
import { NovaStrategy } from "~features/context-engine/strategies/nova"
import { sendToBackground } from "~core/messaging"

export const config: PlasmoCSConfig = {
    matches: ["https://nova.ayahealthcare.com/*"],
    run_at: "document_idle",
}

console.log("[NovaScraper] Content script loaded")

const strategy = new NovaStrategy()

// Initial scrape
async function scrapeAndSend() {
    if (!strategy.match(location.href)) {
        console.log("[NovaScraper] URL does not match, skipping")
        return
    }

    // Check if this is a candidate page
    if (!location.href.includes("/candidates/")) {
        console.log("[NovaScraper] Not a candidate page, skipping")
        return
    }

    console.log("[NovaScraper] Extracting context...")

    const context = await strategy.extract()

    if (context) {
        console.log("[NovaScraper] Context extracted:", context)
        await sendToBackground("CONTEXT_SCRAPED", context)
    } else {
        console.warn("[NovaScraper] Could not extract context from page")
    }
}

// Run initial scrape after DOM settles
setTimeout(scrapeAndSend, 1000)

// Watch for SPA navigation (Nova is likely React/SPA)
let lastUrl = location.href

const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href
        console.log("[NovaScraper] URL changed:", lastUrl)

        // Wait for new page content to load
        setTimeout(scrapeAndSend, 1500)
    }
})

observer.observe(document.body, {
    childList: true,
    subtree: true
})

// Listen for messages from background/popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "REQUEST_CONTEXT") {
        scrapeAndSend()
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ error: err.message }))
        return true // async response
    }
})

console.log("[NovaScraper] Watching for navigation...")
