import { ChatRequest, ChatResponse, Provider } from '../../features/command-center-chat/types';
import { callGemini } from './providers/geminiProvider';
import { callOpenAI } from './providers/openaiProvider';

// Circuit Breaker State (Memory-based for Edge Functions)
const circuits = new Map<Provider, { failures: number; lastFailure: number; state: 'CLOSED' | 'OPEN' }>();
const THRESHOLD = 3;
const COOLDOWN = 45000;

function checkCircuit(provider: Provider) {
    const circuit = circuits.get(provider) || { failures: 0, lastFailure: 0, state: 'CLOSED' };
    if (circuit.state === 'OPEN') {
        if (Date.now() - circuit.lastFailure > COOLDOWN) {
            circuit.state = 'CLOSED';
            circuit.failures = 0;
            circuits.set(provider, circuit);
            return true;
        }
        return false;
    }
    return true;
}

function recordSuccess(provider: Provider) {
    circuits.set(provider, { failures: 0, lastFailure: 0, state: 'CLOSED' });
}

function recordFailure(provider: Provider) {
    const circuit = circuits.get(provider) || { failures: 0, lastFailure: 0, state: 'CLOSED' };
    circuit.failures++;
    circuit.lastFailure = Date.now();
    if (circuit.failures >= THRESHOLD) {
        circuit.state = 'OPEN';
    }
    circuits.set(provider, circuit);
}

export async function chatRouter(req: ChatRequest, keys: Record<string, string>): Promise<ChatResponse> {
    const providers: Provider[] = [req.primary_provider];
    if (req.secondary_provider) providers.push(req.secondary_provider);

    let lastError: any = null;

    for (const provider of providers) {
        if (!checkCircuit(provider)) {
            console.warn(`[ChatRouter] Circuit OPEN for ${provider}, skipping...`);
            continue;
        }

        try {
            let result: ChatResponse;
            if (provider === 'gemini') {
                result = await callGemini(req, keys.GEMINI_API_KEY);
            } else if (provider === 'openai') {
                result = await callOpenAI(req, keys.OPENAI_API_KEY);
            } else {
                throw new Error(`Provider ${provider} not implemented`);
            }

            recordSuccess(provider);
            return result;
        } catch (err: any) {
            console.error(`[ChatRouter] ${provider} failed:`, err);
            recordFailure(provider);
            lastError = err;

            if (!err.retryable) {
                break; // Don't failover if error is not retryable (e.g. 400 Bad Request)
            }
        }
    }

    return {
        schema_version: "chat.v1",
        message_id: crypto.randomUUID(),
        provider: req.primary_provider,
        model: "error",
        text: "I'm currently having trouble connecting to my brain. Please try again in a moment.",
        error: {
            code: lastError?.code || "ROUTER_FAILURE",
            message: lastError?.message || "All providers failed",
            retryable: true
        }
    };
}
