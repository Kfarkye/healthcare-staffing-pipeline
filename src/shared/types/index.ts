// ============================================================================
// /src/shared/types/index.ts
// ============================================================================

export interface BaseRecord {
    id: number | string;
    created_at: string;
    updated_at?: string;
}

export interface ToastState {
    show: boolean;
    message: string;
    type: 'success' | 'error' | 'info';
}

export interface SortConfig<T = string> {
    key: T;
    direction: 'ascending' | 'descending';
}

export interface FilterState {
    searchTerm: string;
    [key: string]: any;
}