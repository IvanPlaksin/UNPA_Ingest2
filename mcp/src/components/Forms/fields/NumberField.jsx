import React from 'react';
import { TextField } from '@mui/material';

export default function NumberField({
  name, label, value, onChange, error, helperText,
  required, disabled, readOnly, placeholder, fullWidth,
  min, max, step
}) {
  return (
    <TextField
      name={name}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      error={error}
      helperText={helperText}
      required={required}
      disabled={disabled}
      slotProps={{
        input: { readOnly },
        htmlInput: { min, max, step }
      }}
      placeholder={placeholder}
      fullWidth={fullWidth}
      type="number"
      variant="outlined"
      size="small"
    />
  );
}
