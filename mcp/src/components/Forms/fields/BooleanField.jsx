import React from 'react';
import { FormControlLabel, Checkbox, FormHelperText, FormControl } from '@mui/material';

export default function BooleanField({
  name, label, value, onChange, error, helperText,
  required, disabled, readOnly
}) {
  return (
    <FormControl error={error}>
      <FormControlLabel
        control={
          <Checkbox
            name={name}
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled || readOnly}
            required={required}
            size="small"
          />
        }
        label={label}
      />
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
}
