import React from 'react';
import { Autocomplete, TextField } from '@mui/material';
import { useDataSource } from '../hooks/useDataSource';

export default function AutocompleteField({
  name, label, value, onChange, error, helperText,
  required, disabled, readOnly, fullWidth,
  dataSourceId, options: staticOptions, apiBaseUrl
}) {
  const { items, loading } = useDataSource(dataSourceId, {}, apiBaseUrl);
  const options = dataSourceId ? items : (staticOptions || []);
  const selectedOption = options.find(o => o.value === value) || null;

  return (
    <Autocomplete
      value={selectedOption}
      onChange={(_, newValue) => onChange(newValue?.value ?? '')}
      options={options}
      getOptionLabel={(opt) => opt.label || opt.value || ''}
      loading={loading}
      disabled={disabled}
      readOnly={readOnly}
      fullWidth={fullWidth}
      size="small"
      renderInput={(params) => (
        <TextField
          {...params}
          name={name}
          label={label}
          error={error}
          helperText={helperText}
          required={required}
          variant="outlined"
        />
      )}
    />
  );
}
