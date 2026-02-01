/**
 * Typed Message Bus — Event Communication Layer
 * 
 * All communication between Content Scripts, Service Worker,
 * and Side Panel goes through this typed bus.
 */
import { BusMessageSchema, type BusMessage, type MessageType } from "./schemas"

type MessageHandler = (message: BusMessage) => Promise<void> | void

const handlers = new Map<MessageType, Set<MessageHandler>>()

/**
 * Send a message to the background service worker
 */
export async function sendToBackground<T = void>(
    type: MessageType,
    payload?: unknown,
    tabId?: number
): Promise<T> {
    const message: BusMessage = {
        type,
        payload,
        tabId,
        timestamp: Date.now(),
    }

    // Validate before sending
    const validated = BusMessageSchema.parse(message)

    return chrome.runtime.sendMessage(validated)
}

/**
 * Send a message to a specific tab's content script
 */
export async function sendToTab<T = void>(
    tabId: number,
    type: MessageType,
    payload?: unknown
): Promise<T> {
    const message: BusMessage = {
        type,
        payload,
        tabId,
        timestamp: Date.now(),
    }

    const validated = BusMessageSchema.parse(message)

    return chrome.tabs.sendMessage(tabId, validated)
}

/**
 * Register a handler for a specific message type
 */
export function onMessage(type: MessageType, handler: MessageHandler): () => void {
    if (!handlers.has(type)) {
        handlers.set(type, new Set())
    }

    handlers.get(type)!.add(handler)

    // Return unsubscribe function
    return () => {
        handlers.get(type)?.delete(handler)
    }
}

/**
 * Initialize the message listener (call once in background.ts)
 */
export function initMessageRouter() {
    chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
        // Validate incoming message
        const result = BusMessageSchema.safeParse(rawMessage)

        if (!result.success) {
            console.error("[MessageBus] Invalid message:", result.error)
            sendResponse({ error: "Invalid message format" })
            return false
        }

        const message = result.data
        const messageHandlers = handlers.get(message.type)

        if (!messageHandlers || messageHandlers.size === 0) {
            console.warn(`[MessageBus] No handlers for: ${message.type}`)
            sendResponse({ error: `No handler for ${message.type}` })
            return false
        }

        // Add sender tab ID if not present
        if (!message.tabId && sender.tab?.id) {
            message.tabId = sender.tab.id
        }

        // Execute handlers
        const promises = Array.from(messageHandlers).map(handler =>
            Promise.resolve(handler(message))
        )

        Promise.all(promises)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ error: err.message }))

        // Return true to indicate async response
        return true
    })

    console.log("[MessageBus] Router initialized")
}
