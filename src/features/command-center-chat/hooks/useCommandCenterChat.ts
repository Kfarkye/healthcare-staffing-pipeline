/**
 * Command Center Chat Hook
 * 
 * Production-grade React hook for Vercel AI SDK v6 chat integration.
 * Uses ChatInit and sendMessage pattern from AI SDK v6.
 * 
 * @version 2.0.0
 */

import { useChat, UIMessage } from '@ai-sdk/react';
import { useCallback, useMemo, useRef } from 'react';
import { DefaultChatTransport } from 'ai';

// ============================================================================
// TYPES
// ============================================================================

export interface CommandCenterMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt?: Date;
    toolInvocations?: any[];
}

export interface CommandCenterContext {
    activeCandidate?: {
        id: number;
        name: string;
        specialty?: string;
    };
    filters?: {
        status?: string;
        specialty?: string;
    };
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
// MESSAGE CONTENT EXTRACTION
// ============================================================================

/**
 * Extract displayable content from a UIMessage
 * AI SDK v6 uses `parts` array, not a `content` string
 */
function extractMessageContent(msg: UIMessage): string {
    // Handle parts-based messages (v6 format)
    if ('parts' in msg && Array.isArray(msg.parts)) {
        return msg.parts
            .filter(part => part.type === 'text')
            .map(part => (part as any).text || '')
            .join('');
    }

    // Fallback for legacy content property
    if ('content' in msg && typeof (msg as any).content === 'string') {
        return (msg as any).content;
    }

    return '';
}

// ============================================================================
// HOOK
// ============================================================================

export function useCommandCenterChat(
    options: UseCommandCenterChatOptions = {}
): UseCommandCenterChatReturn {
    const { context, onError, onToolCall } = options;
    const abortControllerRef = useRef<AbortController | null>(null);

    const {
        messages,
        error,
        status: chatStatus,
        sendMessage: sdkSendMessage,
        setMessages,
        stop: stopGeneration,
        regenerate,
    } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/chat/command-center',
            body: { context },
        }),
        onError: (err) => {
            console.error('[CommandCenterChat] Error:', err);
            onError?.(err);
        },
        onToolCall: ({ toolCall }) => {
            onToolCall?.(toolCall.toolName, (toolCall as any).args);
        },
    });

    // ========================================================================
    // DERIVED STATE
    // ========================================================================

    const isLoading = chatStatus === 'submitted' || chatStatus === 'streaming';
    const isStreaming = chatStatus === 'streaming';

    const status = useMemo((): 'idle' | 'loading' | 'streaming' | 'error' => {
        if (error) return 'error';
        if (chatStatus === 'streaming') return 'streaming';
        if (chatStatus === 'submitted') return 'loading';
        return 'idle';
    }, [error, chatStatus]);

    // ========================================================================
    // ACTIONS
    // ========================================================================

    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        // Cancel any pending request
        abortControllerRef.current?.abort();
        abortControllerRef.current = new AbortController();

        try {
            // AI SDK v6 sendMessage accepts text directly or message object
            await sdkSendMessage({ text: content });
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error('[CommandCenterChat] Send failed:', err);
                onError?.(err);
            }
        }
    }, [sdkSendMessage, onError]);

    const clearChat = useCallback(() => {
        abortControllerRef.current?.abort();
        setMessages([]);
    }, [setMessages]);

    const stop = useCallback(() => {
        abortControllerRef.current?.abort();
        stopGeneration();
    }, [stopGeneration]);

    const reload = useCallback(() => {
        regenerate();
    }, [regenerate]);

    // ========================================================================
    // MAP MESSAGES
    // ========================================================================

    const mappedMessages: CommandCenterMessage[] = useMemo(() => {
        return messages.map(msg => ({
            id: msg.id,
            role: msg.role as CommandCenterMessage['role'],
            content: extractMessageContent(msg),
            createdAt: (msg as any).createdAt,
            toolInvocations: (msg as any).toolInvocations,
        }));
    }, [messages]);

    // ========================================================================
    // RETURN
    // ========================================================================

    return {
        messages: mappedMessages,
        isLoading,
        isStreaming,
        error: error?.message || null,
        sendMessage,
        clearChat,
        stop,
        reload,
        status,
    };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default useCommandCenterChat;
