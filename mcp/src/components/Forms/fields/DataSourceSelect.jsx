/**
 * DataSourceSelect
 *
 * Select / Autocomplete field backed by a DataSource.
 * Handles preloaded, search, and cascading DataSources.
 */

import React, { useCallback } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  TextField,
  CircularProgress,
  FormHelperText,
  Box,
  Typography,
} from '@mui/material';
import { useDataSource } from '../hooks/useDataSource';

export function DataSourceSelect({
  name,
  label,
  value,
  onChange,
  onBlur,
  error,
  helperText,
  required,
  disabled,
  dataSourceSpec,
  formValues,
  uiHints = {},
  fullWidth = true,
  size = 'small',
}) {
  const {
    items,
    loading,
    error: dsError,
    initialized,
    searchQuery,
    setSearchQuery,
    type,
    hasDependency,
    dependsOn,
    getItemByValue,
  } = useDataSource(name, dataSourceSpec, formValues);

  const widget = uiHints.widget || (type === 'search' ? 'autocomplete' : 'select');

  const handleSelectChange = useCallback(
    (event) => onChange(name, event.target.value),
    [name, onChange],
  );

  const handleAutocompleteChange = useCallback(
    (_event, newValue) => onChange(name, newValue?.value ?? null),
    [name, onChange],
  );

  const handleInputChange = useCallback(
    (_event, newInputValue, reason) => {
      if (reason === 'input') setSearchQuery(newInputValue);
    },
    [setSearchQuery],
  );

  const selectedItem = value ? getItemByValue(value) : null;
  const displayError = error || (dsError ? `DataSource error: ${dsError}` : null);
  const showDependencyHint = hasDependency && !formValues?.[dependsOn];

  // ─── Autocomplete ──────────────────────────────────────────────────────────

  if (widget === 'autocomplete') {
    return (
      <FormControl fullWidth={fullWidth} error={!!displayError} size={size}>
        <Autocomplete
          value={selectedItem}
          onChange={handleAutocompleteChange}
          onInputChange={handleInputChange}
          inputValue={searchQuery}
          options={items}
          getOptionLabel={(option) => option?.label || ''}
          isOptionEqualToValue={(option, val) => option?.value === val?.value}
          loading={loading}
          disabled={disabled || showDependencyHint}
          size={size}
          renderInput={(params) => (
            <TextField
              {...params}
              label={label}
              required={required}
              error={!!displayError}
              helperText={
                displayError ||
                helperText ||
                (showDependencyHint ? `Select ${dependsOn} first` : '')
              }
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading && <CircularProgress color="inherit" size={20} />}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.value}>
              <Box>
                <Typography variant="body2">{option.label}</Typography>
                {option.metadata && uiHints.showMetadata && (
                  <Typography variant="caption" color="text.secondary">
                    {formatMetadata(option.metadata, uiHints.metadataTemplate)}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
          noOptionsText={
            searchQuery.length < (dataSourceSpec?.minSearchLength || 2)
              ? `Type at least ${dataSourceSpec?.minSearchLength || 2} characters`
              : 'No options found'
          }
        />
      </FormControl>
    );
  }

  // ─── Select ────────────────────────────────────────────────────────────────

  return (
    <FormControl fullWidth={fullWidth} error={!!displayError} size={size}>
      <InputLabel required={required}>{label}</InputLabel>
      <Select
        name={name}
        value={value || ''}
        onChange={handleSelectChange}
        onBlur={onBlur}
        label={label}
        disabled={disabled || showDependencyHint || !initialized}
      >
        {loading && (
          <MenuItem disabled>
            <CircularProgress size={20} sx={{ mr: 1 }} />
            Loading...
          </MenuItem>
        )}

        {!required && !loading && (
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
        )}

        {!loading &&
          items.map((item) => (
            <MenuItem key={item.value} value={item.value}>
              {item.label}
              {item.metadata && uiHints.showMetadata && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {formatMetadata(item.metadata, uiHints.metadataTemplate)}
                </Typography>
              )}
            </MenuItem>
          ))}

        {!loading && items.length === 0 && initialized && (
          <MenuItem disabled>
            {showDependencyHint ? `Select ${dependsOn} first` : 'No options available'}
          </MenuItem>
        )}
      </Select>

      {(displayError || helperText) && (
        <FormHelperText>{displayError || helperText}</FormHelperText>
      )}
    </FormControl>
  );
}

function formatMetadata(metadata, template) {
  if (!metadata) return '';

  if (template) {
    return template.replace(/\$\{(\w+)\}/g, (_, field) => metadata[field] || '');
  }

  return Object.entries(metadata)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
}

export default DataSourceSelect;
