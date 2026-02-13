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
