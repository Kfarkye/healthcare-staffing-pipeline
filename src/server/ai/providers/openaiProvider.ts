import { ChatRequest, ChatResponse } from '../../../features/command-center-chat/types';

export async function callOpenAI(req: ChatRequest, apiKey: string): Promise<ChatResponse> {
    const model = "gpt-4o"; // Standard high-quality fallback
    const url = "https://api.openai.com/v1/chat/completions";

    const payload = {
        model,
        messages: req.messages.map(m => ({
            role: m.role,
            content: m.content
        })),
        temperature: req.temperature ?? 0.7,
        max_tokens: req.max_tokens ?? 1024,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw {
            code: `OPENAI_${response.status}`,
            message: errorData.error?.message || response.statusText,
            retryable: [429, 502, 503, 504].includes(response.status)
        };
    }

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content || '';

    return {
        schema_version: "chat.v1",
        message_id: result.id || crypto.randomUUID(),
        provider: 'openai',
        model: result.model || model,
        text,
        usage: {
            prompt_tokens: result.usage?.prompt_tokens || 0,
            completion_tokens: result.usage?.completion_tokens || 0,
            total_tokens: result.usage?.total_tokens || 0
        }
    };
}
