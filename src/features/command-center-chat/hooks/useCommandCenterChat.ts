/**
 * Command Center Chat Hook
 * 
 * Elite Production Implementation:
 * - 60fps Render Throttling (prevents UI freeze)
 * - Deep Comparison for Context Stability
 * - Ref-based State Management (prevents stale closures)
 * - Strict Type Safety
 * 
 * @version 3.0.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { readUIMessageStream } from 'ai';

// ============================================================================
// TYPES
// ============================================================================

export interface CommandCenterMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt?: Date;
    toolInvocations?: any[];
}

export interface CommandCenterContext {
    [key: string]: any;
}

export interface UseCommandCenterChatOptions {
    context?: CommandCenterContext;
    onError?: (error: Error) => void;
    onToolCall?: (toolName: string, args: any) => void;
}

export interface UseCommandCenterChatReturn {
    messages: CommandCenterMessage[];
    isLoading: boolean;
    isStreaming: boolean;
    error: string | null;
    sendMessage: (content: string) => Promise<void>;
    clearChat: () => void;
    stop: () => void;
    reload: () => void;
    status: 'idle' | 'loading' | 'streaming' | 'error';
}

// ============================================================================
// UTILITIES
// ============================================================================

function generateId(): string {
    return typeof crypto !== 'undefined'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15);
}

/**
 * Custom hook to memoize context objects using deep equality.
 * Prevents infinite loops when consumers pass inline objects like {{ id: 1 }}
 */
function useDeepCompareMemoize(value: any) {
    const ref = useRef<any>(null);
    if (JSON.stringify(value) !== JSON.stringify(ref.current)) {
        ref.current = value;
    }
    return ref.current;
}

// ============================================================================
// HOOK
// ============================================================================

export function useCommandCenterChat(
    options: UseCommandCenterChatOptions = {}
): UseCommandCenterChatReturn {
    const { context, onError, onToolCall } = options;

    // Stabilize context to prevent dependency thrashing
    const stableContext = useDeepCompareMemoize(context);

    const [messages, setMessages] = useState<CommandCenterMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Refs ensure we always access the latest state inside async closures
    const abortControllerRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<CommandCenterMessage[]>([]);

    // Sync ref with state automatically
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Cleanup on unmount
    useEffect(() => {
        return () => abortControllerRef.current?.abort();
    }, []);

    // ========================================================================
    // SEND MESSAGE
    // ========================================================================

    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        // 1. Cancel active request
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        const userMessage: CommandCenterMessage = {
            id: generateId(),
            role: 'user',
            content,
            createdAt: new Date(),
        };

        const assistantMessage: CommandCenterMessage = {
            id: generateId(),
            role: 'assistant',
            content: '',
            createdAt: new Date(),
            toolInvocations: [],
        };

        // 2. Optimistic Update
        const newHistory = [...messagesRef.current, userMessage, assistantMessage];
        setMessages(newHistory);

        setIsLoading(true);
        setIsStreaming(false);
        setError(null);

        try {
            const requestMessages = newHistory.slice(0, -1).map(m => ({
                role: m.role,
                content: m.content,
            }));

            const response = await fetch('/api/chat/command-center', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: requestMessages,
                    context: stableContext,
                }),
                signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Request failed: ${response.status}`);
            }

            if (!response.body) throw new Error('No response body');

            setIsStreaming(true);

            // 3. Stream Reading with Render Throttling
            const reader = readUIMessageStream({
                getReader: () => response.body!.getReader(),
            });

            let accumulatedText = '';
            let toolInvocations: any[] = [];
            let lastRenderTime = 0;
            const RENDER_THROTTLE_MS = 16; // Cap at ~60fps

            for await (const chunk of reader) {
                if (signal.aborted) break;

                let shouldUpdate = false;

                if (chunk.type === 'text') {
                    accumulatedText += chunk.text;
                    // Only update React state if throttle time has passed
                    if (Date.now() - lastRenderTime > RENDER_THROTTLE_MS) {
                        shouldUpdate = true;
                    }
                } else if (chunk.type === 'tool-invocation') {
                    // Always process tools immediately
                    const existingIdx = toolInvocations.findIndex(t => t.toolCallId === chunk.toolCallId);
                    if (existingIdx >= 0) {
                        toolInvocations[existingIdx] = chunk;
                    } else {
                        toolInvocations.push(chunk);
                        if (onToolCall && chunk.toolName) {
                            try { onToolCall(chunk.toolName, chunk.args); } catch (e) { console.error(e); }
                        }
                    }
                    shouldUpdate = true;
                } else if (chunk.type === 'finish' || chunk.type === 'step-finish') {
                    shouldUpdate = true;
                }

                if (shouldUpdate) {
                    setMessages(prev => {
                        const updated = [...prev];
                        const lastIdx = updated.length - 1;
                        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                            updated[lastIdx] = {
                                ...updated[lastIdx],
                                content: accumulatedText,
                                toolInvocations: [...toolInvocations],
                            };
                        }
                        return updated;
                    });
                    lastRenderTime = Date.now();
                }
            }

            // Final sync to ensure no dropped frames
            if (!signal.aborted) {
                setMessages(prev => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                        updated[lastIdx] = {
                            ...updated[lastIdx],
                            content: accumulatedText,
                            toolInvocations: [...toolInvocations],
                        };
                    }
                    return updated;
                });
            }

        } catch (err: any) {
            if (err.name === 'AbortError') return;

            console.error('[CommandCenterChat] Error:', err);
            setError(err.message || 'An error occurred');
            onError?.(err);

            // Rollback empty assistant message if it failed completely
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && !last.content && (!last.toolInvocations || last.toolInvocations.length === 0)) {
                    return prev.slice(0, -1);
                }
                return prev;
            });
        } finally {
            if (!signal.aborted) {
                setIsLoading(false);
                setIsStreaming(false);
            }
        }
    }, [stableContext, onError, onToolCall]);

    // ========================================================================
    // ACTIONS
    // ========================================================================

    const clearChat = useCallback(() => {
        abortControllerRef.current?.abort();
        setMessages([]);
        setError(null);
    }, []);

    const stop = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsLoading(false);
        setIsStreaming(false);
    }, []);

    const reload = useCallback(() => {
        const history = messagesRef.current;
        const lastUserMsg = [...history].reverse().find(m => m.role === 'user');
        if (lastUserMsg) {
            // Rollback to just before the last user message
            const keepIdx = history.findIndex(m => m.id === lastUserMsg.id);
            if (keepIdx !== -1) {
                setMessages(history.slice(0, keepIdx));
                sendMessage(lastUserMsg.content);
            }
        }
    }, [sendMessage]);

    const status = error ? 'error' : isStreaming ? 'streaming' : isLoading ? 'loading' : 'idle';

    return { messages, isLoading, isStreaming, error, sendMessage, clearChat, stop, reload, status };
}

export default useCommandCenterChat;
