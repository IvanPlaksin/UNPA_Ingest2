/**
 * useDebounce Hook (PH-006)
 *
 * Debounces a value by a specified delay. Useful for search inputs
 * to avoid triggering API calls on every keystroke.
 *
 * Usage:
 *   const [query, setQuery] = useState('');
 *   const debouncedQuery = useDebounce(query, 300);
 *   useEffect(() => { if (debouncedQuery) search(debouncedQuery); }, [debouncedQuery]);
 */

import { useState, useEffect } from 'react';

export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
