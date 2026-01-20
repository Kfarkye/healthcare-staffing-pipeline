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
        thought?: boolean;
        functionCall?: { name: string; args: any };
        functionResponse?: { name: string; response: any };
    }[];
    metadata?: any;
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

    async sendCommand(message: string, history: ChatMessage[] = [], attachment?: { base64: string; mimeType: string }, context?: any, metadata?: any): Promise<{ text: string, history: ChatMessage[] }> {
        const { data: sessionRes } = await supabase.auth.getSession();
        const accessToken = sessionRes?.session?.access_token ?? '';

        const { data, error } = await supabase.functions.invoke('chat-command-center', {
            headers: {
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: {
                message,
                history,
                attachment,
                context,
                metadata
            },
        });

        if (error) {
            console.error('[AIService] Error calling chat-command-center:', error);
            throw new Error(error.message || 'Failed to send command');
        }

        // The edge function now returns { text, thought, history } as its standard response format
        return data as { text: string, thought?: string, history: ChatMessage[] };
    }
    async sendResearchQuery(message: string, history: ChatMessage[] = []): Promise<any> {
        const { data, error } = await supabase.functions.invoke('research-chat', {
            body: {
                message,
                history
            },
        });

        if (error) {
            console.error('[AIService] Error calling research-chat:', error);
            throw new Error(error.message || 'Failed to perform research');
        }

        return data;
    }

    async extractPayPackageFromImage(imageBase64: string, mimeType: string = 'image/png'): Promise<any> {
        const { data, error } = await supabase.functions.invoke('extract-pay-package', {
            body: {
                imageBase64,
                mimeType
            },
        });

        if (error) {
            console.error('[AIService] Error calling extract-pay-package:', error);
            throw new Error(error.message || 'Failed to extract data from image');
        }

        return data;
    }
}

export const AIService = new AIServiceClass();
