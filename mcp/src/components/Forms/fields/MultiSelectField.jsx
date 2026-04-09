import React from 'react';
import { FormControl, InputLabel, Select, MenuItem, FormHelperText, Chip, Box } from '@mui/material';
import { useDataSource } from '../hooks/useDataSource';

export default function MultiSelectField({
  name, label, value = [], onChange, error, helperText,
  required, disabled, readOnly, fullWidth,
  dataSourceId, options: staticOptions, apiBaseUrl
}) {
  const { items, loading } = useDataSource(dataSourceId, {}, apiBaseUrl);
  const options = dataSourceId ? items : (staticOptions || []);
  const selected = Array.isArray(value) ? value : [];

  return (
    <FormControl fullWidth={fullWidth} error={error} size="small" required={required}>
      <InputLabel>{label}</InputLabel>
      <Select
        name={name}
        multiple
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        label={label}
        disabled={disabled || loading}
        readOnly={readOnly}
        renderValue={(sel) => (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {sel.map((v) => {
              const opt = options.find(o => o.value === v);
              return <Chip key={v} label={opt?.label || v} size="small" />;
            })}
          </Box>
        )}
      >
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
