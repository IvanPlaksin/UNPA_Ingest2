/**
 * useDataSource Hook
 *
 * Manages DataSource data loading for form fields:
 *   - Preloaded: uses items from FormSpecification
 *   - Search: debounced API calls for autocomplete
 *   - Endpoint: loads on mount or when cascading dependency changes
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../../config/api.config';

const api = axios.create({ baseURL: API_BASE_URL });

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function getDataSourceItems(dataSourceId, params = {}, options = {}) {
  const response = await api.get(`/datasources/${dataSourceId}/load`, {
    params,
    signal: options.signal,
  });
  return response.data;
}

async function searchDataSource(dataSourceId, query, options = {}) {
  const { limit = 20, signal, ...filters } = options;
  const response = await api.get(`/datasources/${dataSourceId}/search`, {
    params: { q: query, limit, ...filters },
    signal,
  });
  return response.data;
}

// ---------------------------------------------------------------------------
// useDataSource — single field
// ---------------------------------------------------------------------------

/**
 * @param {string} fieldName
 * @param {object} dataSourceSpec - From FormSpecification.dataSources[fieldName]
 * @param {object} formValues - Current form values (for cascading)
 * @param {object} [options]
 */
export function useDataSource(fieldName, dataSourceSpec, formValues = {}, options = {}) {
  const { enabled = true } = options;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [initialized, setInitialized] = useState(false);

  const abortRef = useRef(null);
  const timerRef = useRef(null);

  const {
    type,
    dataSourceId,
    endpoint,
    items: preloadedItems,
    minSearchLength = 2,
    debounceMs = 300,
    dependsOn,
    staticFilters,
    valueField = 'value',
    labelField = 'label',
  } = dataSourceSpec || {};

  const dependentValue = dependsOn ? formValues[dependsOn.field] : null;

  // --- Preloaded ---
  useEffect(() => {
    if (!enabled || !dataSourceSpec) return;
    if (type === 'preloaded' && preloadedItems) {
      setItems(preloadedItems);
      setInitialized(true);
    }
  }, [enabled, type, preloadedItems, dataSourceSpec]);

  // --- Endpoint (incl. cascading) ---
  const loadFromEndpoint = useCallback(async () => {
    if (!dataSourceId) return;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = { ...staticFilters };
      if (dependsOn && dependentValue) {
        params[dependsOn.paramName] = dependentValue;
      }

      const result = await getDataSourceItems(dataSourceId, params, {
        signal: abortRef.current.signal,
      });

      setItems(result.items || []);
      setInitialized(true);
    } catch (err) {
      if (!axios.isCancel(err) && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [dataSourceId, dependentValue, staticFilters, dependsOn]);

  useEffect(() => {
    if (!enabled || !dataSourceSpec || type !== 'endpoint') return;

    // Cascading: only load when dependent value exists
    if (dependsOn && !dependentValue) {
      setItems([]);
      setInitialized(true);
      return;
    }

    loadFromEndpoint();
  }, [enabled, type, loadFromEndpoint, dependsOn, dependentValue, dataSourceSpec]);

  // --- Search (debounced) ---
  const performSearch = useCallback(async (query) => {
    if (!dataSourceId) return;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await searchDataSource(dataSourceId, query, {
        signal: abortRef.current.signal,
        limit: 20,
      });

      setItems(result.items || []);
    } catch (err) {
      if (!axios.isCancel(err) && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [dataSourceId]);

  useEffect(() => {
    if (!enabled || !dataSourceSpec || type !== 'search') return;

    if (timerRef.current) clearTimeout(timerRef.current);

    if (!searchQuery || searchQuery.length < minSearchLength) {
      setItems([]);
      return;
    }

    timerRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, type, searchQuery, minSearchLength, debounceMs, performSearch, dataSourceSpec]);

  // --- Refresh ---
  const refresh = useCallback(() => {
    if (type === 'search' && searchQuery.length >= minSearchLength) {
      performSearch(searchQuery);
    } else if (type === 'endpoint') {
      loadFromEndpoint();
    }
  }, [type, searchQuery, minSearchLength, performSearch, loadFromEndpoint]);

  // --- Lookup ---
  const getItemByValue = useCallback(
    (value) => items.find((item) => item.value === value) || null,
    [items],
  );

  // --- Formatted items for MUI ---
  const formattedItems = useMemo(
    () =>
      items.map((item) => ({
        value: item.value,
        label: item.label,
        ...(item.metadata && { metadata: item.metadata }),
      })),
    [items],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    items: formattedItems,
    loading,
    error,
    initialized,

    searchQuery,
    setSearchQuery,

    refresh,
    getItemByValue,

    type,
    dataSourceId,
    valueField,
    labelField,

    dependsOn: dependsOn?.field || null,
    hasDependency: !!dependsOn,
  };
}

// ---------------------------------------------------------------------------
// useFormDataSources — multiple fields from FormSpecification
// ---------------------------------------------------------------------------

/**
 * @param {object} dataSources - dataSources from FormSpecification
 * @param {object} formValues - Current form values
 */
export function useFormDataSources(dataSources, formValues = {}) {
  const [fieldStates, setFieldStates] = useState({});

  useEffect(() => {
    if (!dataSources) return;

    const states = {};
    for (const [fieldName, spec] of Object.entries(dataSources)) {
      states[fieldName] = {
        items: spec.type === 'preloaded' ? spec.items || [] : [],
        loading: false,
        error: spec.type === 'error' ? spec.error : null,
        type: spec.type,
      };
    }
    setFieldStates(states);
  }, [dataSources]);

  const getFieldDataSource = useCallback(
    (fieldName) => fieldStates[fieldName] || { items: [], loading: false, error: null },
    [fieldStates],
  );

  const hasDataSource = useCallback(
    (fieldName) => !!dataSources?.[fieldName],
    [dataSources],
  );

  const dataSourceFields = useMemo(
    () => Object.keys(dataSources || {}),
    [dataSources],
  );

  return { fieldStates, getFieldDataSource, hasDataSource, dataSourceFields };
}

export default useDataSource;

// Re-export API helpers for direct usage
export { getDataSourceItems, searchDataSource };
