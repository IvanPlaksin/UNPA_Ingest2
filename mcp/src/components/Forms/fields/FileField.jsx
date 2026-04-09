import React, { useRef } from 'react';
import { Button, Typography, Box, FormHelperText, FormControl } from '@mui/material';

export default function FileField({
  name, label, value, onChange, error, helperText,
  required, disabled, readOnly, fullWidth,
  accept, multiple
}) {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const files = Array.from(e.target.files || []);
    onChange(multiple ? files : files[0] || null);
  };

  const fileNames = value
    ? (Array.isArray(value) ? value.map(f => f.name).join(', ') : value.name || String(value))
    : 'No file selected';

  return (
    <FormControl fullWidth={fullWidth} error={error}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {label}{required && ' *'}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || readOnly}
        >
          Choose File
        </Button>
        <Typography variant="body2" noWrap sx={{ flex: 1 }}>
          {fileNames}
        </Typography>
      </Box>
      <input
        ref={inputRef}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
}
