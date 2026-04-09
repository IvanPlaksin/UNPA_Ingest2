import React from 'react';
import { TextField as MuiTextField } from '@mui/material';

export default function TextField({
  name, label, value, onChange, error, helperText,
  required, disabled, readOnly, placeholder, fullWidth, type = 'text'
}) {
  return (
    <MuiTextField
      name={name}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      helperText={helperText}
      required={required}
      disabled={disabled}
      slotProps={{ input: { readOnly } }}
      placeholder={placeholder}
      fullWidth={fullWidth}
      type={type}
      variant="outlined"
      size="small"
    />
  );
}
