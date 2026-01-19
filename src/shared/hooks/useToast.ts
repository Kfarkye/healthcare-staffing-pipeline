// ============================================================================
// /src/shared/hooks/useToast.ts
// ============================================================================

import { useState, useCallback } from 'react';
import type { ToastState } from '../types';

interface UseToastReturn {
    toast: ToastState;
    showToast: (message: string, type?: ToastState['type'], duration?: number) => void;
    hideToast: () => void;
}

export function useToast(): UseToastReturn {
    const [toast, setToast] = useState<ToastState>({
        show: false,
        message: '',
        type: 'success'
    });
    
    const showToast = useCallback((
        message: string, 
        type: ToastState['type'] = 'success',
        duration: number = 3000
    ) => {
        setToast({ show: true, message, type });
        
        if (duration > 0) {
            setTimeout(() => {
                setToast(prev => ({ ...prev, show: false }));
            }, duration);
        }
    }, []);
    
    const hideToast = useCallback(() => {
        setToast(prev => ({ ...prev, show: false }));
    }, []);
    
    return { toast, showToast, hideToast };
}