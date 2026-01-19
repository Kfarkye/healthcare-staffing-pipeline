// ============================================================================
// /src/shared/hooks/useLocalStorage.ts
// ============================================================================

import { useState, useEffect } from 'react';

export function useLocalStorage<T>(
    key: string, 
    initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
    // Get from local storage then parse stored json or return initialValue
    const readValue = (): T => {
        // Prevent build error "window is undefined" but keep running on server
        if (typeof window === 'undefined') {
            return initialValue;
        }
        
        try {
            const item = window.localStorage.getItem(key);
            return item ? (JSON.parse(item) as T) : initialValue;
        } catch (error) {
            console.warn(`Error reading localStorage key "${key}":`, error);
            return initialValue;
        }
    };
    
    const [storedValue, setStoredValue] = useState<T>(readValue);
    
    // Save to local storage
    const setValue = (value: T | ((val: T) => T)) => {
        try {
            // Allow value to be a function
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            
            // Save state
            setStoredValue(valueToStore);
            
            // Save to local storage
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
            }
        } catch (error) {
            console.warn(`Error setting localStorage key "${key}":`, error);
        }
    };
    
    useEffect(() => {
        setStoredValue(readValue());
    }, []);
    
    return [storedValue, setValue];
}