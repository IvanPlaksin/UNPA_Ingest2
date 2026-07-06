/**
 * EntityAutocomplete — debounced KB entity search with single or multi select.
 *
 * EntityAutocomplete:   value = {id, label, type, namespace} | null
 * EntityMultiAutocomplete: value = {id, label, type, namespace}[]
 */
import React, { useState, useCallback, useRef } from 'react';
import {
  Autocomplete, TextField, CircularProgress,
  Box, Typography, Chip,
} from '@mui/material';

const ENTITY_STORE_URL = '/api/v1/entity-store';
const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

async function searchEntities(query) {
  if (!query || query.length < MIN_CHARS) return [];
  try {
    const res = await fetch(`${ENTITY_STORE_URL}?search=${encodeURIComponent(query)}`);
    const json = await res.json();
    return (json.data || []).slice(0, 12).map(e => ({
      id: e.id || e.entityId,
      label: e.name || e.id || e.entityId,
      type: e.type || '',
      namespace: e.namespace || '',
    }));
  } catch {
    return [];
  }
}

// ─── Single entity autocomplete ───────────────────────────────────────────────

export function EntityAutocomplete({
  label, value, onChange, placeholder,
  autoFocus = false, size = 'small', disabled = false,
  error = false, helperText,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const handleInputChange = useCallback((_, newInput, reason) => {
    if (reason === 'reset') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const results = await searchEntities(newInput);
      setOptions(results);
      setLoading(false);
    }, DEBOUNCE_MS);
  }, []);

  return (
    <Autocomplete
      size={size}
      options={options}
      loading={loading}
      value={value || null}
      onChange={(_, newVal) => onChange(newVal || null)}
      onInputChange={handleInputChange}
      getOptionLabel={o => (typeof o === 'string' ? o : o.label) || ''}
      isOptionEqualToValue={(o, v) => o?.id === v?.id}
      filterOptions={x => x}
      disabled={disabled}
      noOptionsText={<Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
        {loading ? 'Searching…' : 'Type 2+ chars to search'}
      </Typography>}
      renderOption={(props, o) => (
        <Box component="li" {...props} key={o.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', py: '6px !important' }}>
          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500, lineHeight: 1.3 }}>
            {o.label}
          </Typography>
          {(o.type || o.namespace) && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {[o.type, o.namespace].filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Box>
      )}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder || 'Type to search entities…'}
          autoFocus={autoFocus}
          error={error}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading && <CircularProgress size={13} sx={{ mr: 0.5 }} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}

// ─── Multi entity autocomplete ────────────────────────────────────────────────

export function EntityMultiAutocomplete({
  label, value = [], onChange, placeholder,
  autoFocus = false, size = 'small', disabled = false,
  error = false, helperText,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const handleInputChange = useCallback((_, newInput, reason) => {
    if (reason === 'reset') return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const results = await searchEntities(newInput);
      // Merge with already-selected options so chips keep their labels
      const selectedIds = new Set(value.map(v => v.id));
      setOptions([...value, ...results.filter(r => !selectedIds.has(r.id))]);
      setLoading(false);
    }, DEBOUNCE_MS);
  }, [value]);

  return (
    <Autocomplete
      multiple
      size={size}
      options={options}
      loading={loading}
      value={value}
      onChange={(_, newVal) => onChange(newVal)}
      onInputChange={handleInputChange}
      getOptionLabel={o => (typeof o === 'string' ? o : o.label) || ''}
      isOptionEqualToValue={(o, v) => o?.id === v?.id}
      filterOptions={x => x}
      disabled={disabled}
      noOptionsText={<Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
        {loading ? 'Searching…' : 'Type 2+ chars to search'}
      </Typography>}
      renderOption={(props, o) => (
        <Box component="li" {...props} key={o.id} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start !important', py: '6px !important' }}>
          <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500, lineHeight: 1.3 }}>
            {o.label}
          </Typography>
          {(o.type || o.namespace) && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
              {[o.type, o.namespace].filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Box>
      )}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((o, index) => (
          <Chip
            {...getTagProps({ index })}
            key={o.id}
            label={o.label}
            size="small"
            sx={{ fontSize: '0.7rem', height: 22, maxWidth: 160 }}
          />
        ))
      }
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          placeholder={value.length === 0 ? (placeholder || 'Type to search entities…') : ''}
          autoFocus={autoFocus}
          error={error}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading && <CircularProgress size={13} sx={{ mr: 0.5 }} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
