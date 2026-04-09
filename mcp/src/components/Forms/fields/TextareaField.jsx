import React from 'react';
import { TextField } from '@mui/material';

export default function TextareaField({
  name, label, value, onChange, error, helperText,
  required, disabled, readOnly, placeholder, fullWidth,
  rows = 4, maxLength
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
        htmlInput: { maxLength }
      }}
      placeholder={placeholder}
      fullWidth={fullWidth}
      multiline
      rows={rows}
      variant="outlined"
      size="small"
    />
  );
}
