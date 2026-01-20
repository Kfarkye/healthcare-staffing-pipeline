import { supabase } from '../lib/supabase';

export interface TailoredReplyResponse {
    reply: string;
    analysis: string;
    suggested_action: string;
}

export interface ChatMessage {
    role: 'user' | 'model' | 'function';
    parts: {
        text?: string;
        functionCall?: { name: string; args: any };
        functionResponse?: { name: string; response: any };
    }[];
}

export interface CommandResponse {
    role: 'model';
    parts: { text: string }[];
}

class AIServiceClass {
    async generateTailoredReply(incomingText: string, context: any = {}): Promise<TailoredReplyResponse> {
        const { data: sessionRes } = await supabase.auth.getSession();
        const accessToken = sessionRes?.session?.access_token ?? '';

        const { data, error } = await supabase.functions.invoke('generate-tailored-reply', {
            headers: {
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: {
                incomingText,
                context
            },
        });

        if (error) {
            console.error('[AIService] Error calling generate-tailored-reply:', error);
            throw new Error(error.message || 'Failed to generate tailored reply');
        }

        return data as TailoredReplyResponse;
    }

    async sendCommand(message: string, history: ChatMessage[] = []): Promise<CommandResponse> {
        const { data: sessionRes } = await supabase.auth.getSession();
        const accessToken = sessionRes?.session?.access_token ?? '';

        const { data, error } = await supabase.functions.invoke('chat-command-center', {
            headers: {
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: {
                message,
                history
            },
        });

        if (error) {
            console.error('[AIService] Error calling chat-command-center:', error);
            throw new Error(error.message || 'Failed to send command');
        }

        return data as CommandResponse;
    }
}

export const AIService = new AIServiceClass();
