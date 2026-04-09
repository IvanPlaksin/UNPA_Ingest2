import React from 'react';
import { FormControl, InputLabel, Select, MenuItem, FormHelperText } from '@mui/material';
import { useDataSource } from '../hooks/useDataSource';

export default function SelectField({
  name, label, value, onChange, error, helperText,
  required, disabled, readOnly, fullWidth,
  dataSourceId, options: staticOptions, apiBaseUrl
}) {
  const { items, loading } = useDataSource(dataSourceId, {}, apiBaseUrl);
  const options = dataSourceId ? items : (staticOptions || []);

  return (
    <FormControl fullWidth={fullWidth} error={error} size="small" required={required}>
      <InputLabel>{label}</InputLabel>
      <Select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        disabled={disabled || loading}
        readOnly={readOnly}
      >
        <MenuItem value=""><em>Select...</em></MenuItem>
        {options.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
}
