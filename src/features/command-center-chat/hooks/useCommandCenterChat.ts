import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export function useCommandCenterChat() {
    const {
        messages,
        sendMessage,
        status,
        error,
        setMessages,
    } = useChat({
        transport: new DefaultChatTransport({
            api: '/api/chat',
        }),
        onError: (err) => {
            console.error('[CommandCenterChat] Error:', err);
        },
    });

    // Derive isLoading from status for backwards compatibility
    const isLoading = status === 'submitted' || status === 'streaming';

    // Wrapper for sendMessage to match old interface
    const handleSendMessage = async (content: string) => {
        if (!content.trim()) return;
        sendMessage({ text: content });
    };

    const clearChat = () => setMessages([]);

    return {
        messages,
        isLoading,
        error: error?.message || null,
        sendMessage: handleSendMessage,
        clearChat,
        status, // Expose new status for streaming UI
    };
}
