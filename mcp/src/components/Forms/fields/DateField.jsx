import React from 'react';
import { TextField } from '@mui/material';

export default function DateField({
  name, label, value, onChange, error, helperText,
  required, disabled, readOnly, placeholder, fullWidth, type = 'date'
}) {
  return (
    <TextField
      name={name}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      helperText={helperText}
      required={required}
      disabled={disabled}
      slotProps={{
        input: { readOnly },
        inputLabel: { shrink: true }
      }}
      placeholder={placeholder}
      fullWidth={fullWidth}
      type={type}
      variant="outlined"
      size="small"
    />
  );
}
