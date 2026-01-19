import { useDeferredValue, useEffect, useState } from 'react';

/**
 * Returns a debounced version of the input value using React 18's useDeferredValue.
 * Falls back to setTimeout-based debounce for custom delay needs.
 *
 * Why useDeferredValue?
 * - Framework-level optimization (concurrent rendering)
 * - Automatically deprioritizes during heavy rendering
 * - More predictable than custom setTimeout patterns
 *
 * @param value - The value to debounce
 * @param delay - Delay in ms (only used for custom fallback)
 * @returns Debounced value
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const deferredValue = useDeferredValue(value);

  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return deferredValue;
}

/**
 * Custom debounce hook with configurable delay.
 * Use this when you need specific timing control (e.g., API rate limiting).
 */
export function useCustomDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
