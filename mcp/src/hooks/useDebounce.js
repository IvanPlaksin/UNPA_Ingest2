/**
 * useDebounce Hook (PH-006)
 *
 * Debounces a value by a specified delay. Useful for search inputs
 * to avoid triggering API calls on every keystroke.
 *
 * Usage:
 *   const debouncedQuery = useDebounce(query, 300);
 *   const debouncedSearch = useDebouncedCallback(doSearch, 300);
 *   const throttledAnalyze = useThrottledCallback(analyze, 5000);
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounce a callback function.
 */
export function useDebouncedCallback(callback, delay = 300) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  useEffect(() => { callbackRef.current = callback; }, [callback]);

  const debouncedFn = useCallback((...args) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
  }, [delay]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return debouncedFn;
}

/**
 * Throttle a callback function.
 */
export function useThrottledCallback(callback, limit = 300) {
  const lastRanRef = useRef(0);
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  useEffect(() => { callbackRef.current = callback; }, [callback]);

  const throttledFn = useCallback((...args) => {
    const now = Date.now();
    const remaining = limit - (now - lastRanRef.current);

    if (remaining <= 0) {
      lastRanRef.current = now;
      callbackRef.current(...args);
    } else if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        lastRanRef.current = Date.now();
        timeoutRef.current = null;
        callbackRef.current(...args);
      }, remaining);
    }
  }, [limit]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return throttledFn;
}

export default useDebounce;
