/**
 * API Client
 *
 * Typed fetch wrapper for all data routes. Client components use this
 * instead of importing Supabase directly. All actual DB work happens
 * server-side in /app/api/data/* routes.
 *
 * Pattern: hook → apiClient.method() → fetch('/api/data/...') → API route → Supabase → JSON
 *
 * @module src/lib/api/client
 */

// ============================================================================
// CORE FETCH
// ============================================================================

class ApiError extends Error {
    status: number;
    retryable: boolean;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.retryable = [429, 502, 503, 504].includes(status);
    }
}

async function request<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const url = path.startsWith("http") ? path : `/api/data${path}`;

    const res = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
        },
        ...options,
    });

    if (!res.ok) {
        let message = `API error ${res.status}`;
        try {
            const body = await res.json();
            message = body.error || body.message || message;
        } catch {
            // Response wasn't JSON — use status text
        }
        throw new ApiError(message, res.status);
    }

    return res.json();
}

function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    let url = path;
    if (params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== "") {
                searchParams.set(key, String(value));
            }
        });
        const qs = searchParams.toString();
        if (qs) url += `?${qs}`;
    }
    return request<T>(url, { method: "GET" });
}

function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

function patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
        method: "PATCH",
        body: JSON.stringify(body),
    });
}

// ============================================================================
// CLINICIANS (prospects_dashboard / submittals_dashboard / active_assignments_dashboard)
// ============================================================================

export interface ClinicianParams {
    view: "prospects_dashboard" | "submittals_dashboard" | "active_assignments_dashboard";
    q?: string;
    limit?: number;
}

export const clinicians = {
    list: (params: ClinicianParams) =>
        get<{ rows: unknown[]; count: number }>("/clinicians", {
            view: params.view,
            q: params.q,
            limit: params.limit,
        }),
};

// ============================================================================
// ENGAGEMENTS (engagements_dashboard view)
// ============================================================================

export interface EngagementParams {
    q?: string;
    bucket?: string;
    page?: number;
    pageSize?: number;
}

export const engagements = {
    list: (params: EngagementParams = {}) =>
        get<{ rows: unknown[]; count: number; hasMore: boolean }>("/engagements", {
            q: params.q,
            bucket: params.bucket,
            page: params.page,
            pageSize: params.pageSize,
        }),

    promote: (engagementId: string, nextStage: string) =>
        post<{ success: boolean }>("/engagements", {
            action: "promote",
            engagementId,
            nextStage,
        }),
};

// ============================================================================
// ASSIGNMENTS (active_assignments_dashboard + RPCs)
// ============================================================================

export interface AssignmentParams {
    search?: string;
    stage?: string;
    weekMin?: number;
    weekMax?: number;
    looking?: boolean;
    exiting?: boolean;
}

export const assignments = {
    list: (params: AssignmentParams = {}) =>
        get<{ rows: unknown[] }>("/assignments", {
            search: params.search,
            stage: params.stage,
            weekMin: params.weekMin,
            weekMax: params.weekMax,
            looking: params.looking,
            exiting: params.exiting,
        }),

    updateStage: (id: number, newStage: string) =>
        post<{ success: boolean; data: unknown }>("/assignments/stage", { id, newStage }),

    toggleFlag: (id: number, flagName: "looking" | "exiting", flagValue: boolean) =>
        post<{ success: boolean; data: unknown }>("/assignments/flag", { id, flagName, flagValue }),

    updateStatus: (id: number, newStatus: string) =>
        post<{ success: boolean }>("/assignments/status", { id, newStatus }),
};

// ============================================================================
// PROSPECTS (prospects table)
// ============================================================================

export const prospects = {
    list: () =>
        get<{ rows: unknown[] }>("/prospects"),

    create: (prospect: Record<string, unknown>) =>
        post<{ data: unknown }>("/prospects", { action: "create", ...prospect }),

    update: (id: number, updates: Record<string, unknown>) =>
        patch<{ data: unknown }>("/prospects", { id, ...updates }),

    convertFromClick: (clickId: number) =>
        post<{ data: unknown }>("/prospects/convert", { clickId }),
};

// ============================================================================
// CLICKS (priority_interested_clicks)
// ============================================================================

export const clicks = {
    list: () =>
        get<{ rows: unknown[] }>("/clicks"),

    update: (id: number, updates: Record<string, unknown>) =>
        patch<{ data: unknown }>("/clicks", { id, ...updates }),
};

// ============================================================================
// CANDIDATE HISTORY (cross-table lookup)
// ============================================================================

export const candidates = {
    history: (email: string) =>
        get<{ clicks: unknown[]; prospects: unknown[]; totalInteractions: number }>(
            "/clicks",
            { email, history: true }
        ),
};

// ============================================================================
// EXPORT
// ============================================================================

export const apiClient = {
    clinicians,
    engagements,
    assignments,
    prospects,
    clicks,
    candidates,
    ApiError,
};

export type { ApiError };
export default apiClient;
