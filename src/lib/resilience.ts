/**
 * Resilience and Fault Tolerance Utilities
 * Preserves all SDK/Model contracts.
 */

export interface ResilienceOptions {
    attempts?: number;
    baseMs?: number;
    maxMs?: number;
    jitter?: boolean;
    timeoutMs?: number;
}

const DEFAULT_OPTIONS: ResilienceOptions = {
    attempts: 3,
    baseMs: 1000,
    maxMs: 5000,
    jitter: true,
    timeoutMs: 10000,
};

/**
 * Classify if an error is retryable (e.g., 503 Service Unavailable, 429 Rate Limit)
 */
export function classifyError(error: any): { retryable: boolean; status?: number } {
    const status = error?.status || error?.code || (error instanceof Response ? error.status : undefined);

    // 503 (Service Unavailable) and 429 (Rate Limit) are primary retry targets
    // Also common network issues like 'fetch error' or timeout
    const retryableStatuses = [429, 502, 503, 504];
    const isRetryable = retryableStatuses.includes(Number(status)) ||
        error?.message?.toLowerCase().includes('network') ||
        error?.message?.toLowerCase().includes('timeout') ||
        error?.message?.toLowerCase().includes('failed to fetch');

    return { retryable: isRetryable, status: Number(status) };
}

/**
 * Executes a promise with a timeout
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timeoutId: any;
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`Operation timed out after ${ms}ms`));
        }, ms);
    });

    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

/**
 * Retries a function with exponential backoff and jitter
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: ResilienceOptions = {}
): Promise<T> {
    const { attempts, baseMs, maxMs, jitter } = { ...DEFAULT_OPTIONS, ...options };
    let lastError: any;

    for (let i = 0; i < (attempts || 3); i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const { retryable } = classifyError(error);

            if (!retryable || i === (attempts || 3) - 1) {
                throw error;
            }

            const delay = Math.min(
                maxMs || 5000,
                (baseMs || 1000) * Math.pow(2, i)
            );
            const jitteredDelay = jitter ? delay * (0.5 + Math.random()) : delay;

            console.warn(`[Resilience] Attempt ${i + 1} failed (Status: ${lastError?.status}). Retrying in ${Math.round(jitteredDelay)}ms...`);
            await new Promise(resolve => setTimeout(resolve, jitteredDelay));
        }
    }

    throw lastError;
}

/**
 * Basic Circuit Breaker implementation
 */
const circuitRegistry = new Map<string, {
    failures: number;
    lastFailureTime: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}>();

export async function circuitBreaker<T>(
    key: string,
    fn: () => Promise<T>,
    options: { failureThreshold?: number; coolDownMs?: number } = {}
): Promise<T> {
    const { failureThreshold = 5, coolDownMs = 30000 } = options;
    const circuit = circuitRegistry.get(key) || { failures: 0, lastFailureTime: 0, state: 'CLOSED' };

    // Check circuit state
    if (circuit.state === 'OPEN') {
        const now = Date.now();
        if (now - circuit.lastFailureTime > coolDownMs) {
            circuit.state = 'HALF_OPEN';
        } else {
            throw new Error(`Circuit '${key}' is OPEN. Cooling down for ${Math.round((coolDownMs - (now - circuit.lastFailureTime)) / 1000)}s`);
        }
    }

    try {
        const result = await fn();

        // Success: reset circuit
        if (circuit.state === 'HALF_OPEN' || circuit.failures > 0) {
            console.info(`[Resilience] Circuit '${key}' reset to CLOSED.`);
            circuit.failures = 0;
            circuit.state = 'CLOSED';
            circuitRegistry.set(key, circuit);
        }

        return result;
    } catch (error) {
        circuit.failures++;
        circuit.lastFailureTime = Date.now();

        if (circuit.failures >= failureThreshold) {
            circuit.state = 'OPEN';
            console.error(`[Resilience] Circuit '${key}' is now OPEN due to ${circuit.failures} failures.`);
        }

        circuitRegistry.set(key, circuit);
        throw error;
    }
}

/**
 * Lightweight memory cache for SWR with TTL support
 */
const responseCache = new Map<string, {
    data: any;
    timestamp: number;
    ttl?: number;
}>();

/**
 * Get cached data if it exists and hasn't expired.
 * @param key Cache key
 * @returns Cached data or null if expired/missing
 */
export function getCachedData<T>(key: string): T | null {
    const entry = responseCache.get(key);
    if (!entry) return null;

    // Check TTL if specified
    if (entry.ttl !== undefined) {
        const age = Date.now() - entry.timestamp;
        if (age > entry.ttl) {
            responseCache.delete(key);
            return null;
        }
    }

    return entry.data;
}

/**
 * Set cached data with optional TTL.
 * @param key Cache key
 * @param data Data to cache
 * @param ttlMs Optional TTL in milliseconds (no expiration if omitted)
 */
export function setCachedData<T>(key: string, data: T, ttlMs?: number): void {
    responseCache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
}

/**
 * Clear a specific cache key.
 * @param key Cache key to clear
 */
export function clearCachedData(key: string): void {
    responseCache.delete(key);
}

/**
 * Clear all cache entries or a specific key.
 * @param key Optional specific key to clear
 */
export function clearCache(key?: string): void {
    if (key) responseCache.delete(key);
    else responseCache.clear();
}

