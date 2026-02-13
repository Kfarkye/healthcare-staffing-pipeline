import type { Logger } from '../types/index';

export interface ModelLogContext {
    logger?: Logger;
    traceId?: string;
}

export interface ModelSelectionParams extends ModelLogContext {
    model: string;
    intent?: string;
    isFallback?: boolean;
    primaryModel?: string;
    reason?: string;
}

export interface ModelSelectionHandle {
    logger?: Logger;
    model: string;
    intent?: string;
    selectedAt: number;
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractTokenUsage(result: any): { inputTokens?: number; outputTokens?: number } {
    const usage =
        result?.usage ??
        result?.tokenUsage ??
        result?.providerMetadata?.usage ??
        result?.providerMetadata?.tokenUsage;

    const inputTokens = asNumber(
        usage?.promptTokens ??
        usage?.inputTokens ??
        usage?.promptTokenCount ??
        usage?.inputTokenCount ??
        usage?.requestTokens
    );
    const outputTokens = asNumber(
        usage?.completionTokens ??
        usage?.outputTokens ??
        usage?.completionTokenCount ??
        usage?.outputTokenCount ??
        usage?.responseTokens
    );

    return { inputTokens, outputTokens };
}

function normalizeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

function getErrorStatus(error: any): number | undefined {
    const candidates = [
        error?.status,
        error?.statusCode,
        error?.cause?.status,
        error?.cause?.statusCode,
        error?.response?.status,
        error?.error?.status,
    ];
    for (const value of candidates) {
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return undefined;
}

export function fallbackReasonFromError(error: unknown): string {
    const message = normalizeError(error).toLowerCase();
    const status = getErrorStatus(error as any);

    if (message.includes('quota') || message.includes('resource exhausted') || message.includes('insufficient_quota')) {
        return 'quota_exceeded';
    }
    if (status === 429 || message.includes('rate limit') || message.includes('too many requests')) {
        return 'rate_limited';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
        return 'primary_timeout';
    }
    return 'primary_error';
}

export function shouldAttemptFallback(error: unknown): boolean {
    const message = normalizeError(error).toLowerCase();
    const status = getErrorStatus(error as any);

    if (status === 429 || status === 408) return true;
    if (typeof status === 'number' && status >= 500) return true;
    if (message.includes('quota') || message.includes('resource exhausted') || message.includes('insufficient_quota')) return true;
    if (message.includes('rate limit') || message.includes('too many requests')) return true;
    if (message.includes('timeout') || message.includes('timed out')) return true;
    if (message.includes('overloaded') || message.includes('unavailable') || message.includes('network')) return true;

    return false;
}

export function logModelSelected(params: ModelSelectionParams): ModelSelectionHandle {
    const {
        logger,
        model,
        intent,
        isFallback = false,
        primaryModel,
        reason = 'primary',
    } = params;

    logger?.info('model_selected', {
        model,
        intent: intent || null,
        isFallback,
        ...(isFallback && primaryModel ? { primaryModel } : {}),
        reason,
    });

    return {
        logger,
        model,
        intent,
        selectedAt: Date.now(),
    };
}

export function logModelResponseReceived(
    selection: ModelSelectionHandle,
    result?: any,
    extra: Record<string, any> = {}
): void {
    const { inputTokens, outputTokens } = extractTokenUsage(result);
    const latencyMs = Math.max(0, Date.now() - selection.selectedAt);

    selection.logger?.info('model_response_received', {
        model: selection.model,
        intent: selection.intent || null,
        inputTokens,
        outputTokens,
        latencyMs,
        ...extra,
    });
}

export function logModelResponseError(
    selection: ModelSelectionHandle,
    error: unknown,
    extra: Record<string, any> = {}
): void {
    logModelResponseReceived(selection, undefined, {
        error: normalizeError(error),
        ...extra,
    });
}
