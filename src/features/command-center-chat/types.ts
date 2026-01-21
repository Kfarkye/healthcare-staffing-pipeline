export type Provider = 'gemini' | 'openai' | 'anthropic';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface ChatRequest {
    messages: ChatMessage[];
    primary_provider: Provider;
    secondary_provider?: Provider;
    temperature?: number;
    max_tokens?: number;
}

export interface ChatResponse {
    schema_version: "chat.v1";
    message_id: string;
    provider: Provider;
    model: string;
    text: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    error?: {
        code: string;
        message: string;
        retryable: boolean;
    };
}
