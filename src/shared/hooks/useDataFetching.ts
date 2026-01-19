// ============================================================================
// /src/shared/hooks/useDataFetching.ts
// ============================================================================

import { useState, useEffect, useCallback } from 'react';

interface DataFetchingState<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
}

interface UseDataFetchingReturn<T> extends DataFetchingState<T> {
    refetch: () => Promise<void>;
    setData: React.Dispatch<React.SetStateAction<T | null>>;
}

export function useDataFetching<T>(
    fetchFunction: () => Promise<T>,
    dependencies: any[] = []
): UseDataFetchingReturn<T> {
    const [state, setState] = useState<DataFetchingState<T>>({
        data: null,
        loading: true,
        error: null
    });
    
    const fetchData = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        
        try {
            const result = await fetchFunction();
            setState({ data: result, loading: false, error: null });
        } catch (error) {
            setState({ data: null, loading: false, error: error as Error });
        }
    }, [fetchFunction]);
    
    useEffect(() => {
        fetchData();
    }, dependencies);
    
    const setData = useCallback((newData: React.SetStateAction<T | null>) => {
        setState(prev => ({
            ...prev,
            data: typeof newData === 'function' 
                ? (newData as (prevState: T | null) => T | null)(prev.data)
                : newData
        }));
    }, []);
    
    return {
        ...state,
        refetch: fetchData,
        setData
    };
}