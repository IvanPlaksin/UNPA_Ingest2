import React from 'react';
import {
  Box, TextField, Typography, Stack, Switch, FormControlLabel, Tooltip,
} from '@mui/material';
import { Info } from 'lucide-react';
import SourcesSelector from './SourcesSelector';

export default function ParameterForm({ schema = {}, values = {}, onChange }) {
  const entries = Object.entries(schema);

  if (entries.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        This methodology has no parameters.
      </Typography>
    );
  }

  const update = (key, val) => onChange({ ...values, [key]: val });

  return (
    <Stack spacing={2.5}>
      {entries.map(([key, def]) => {
        const label = (
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.75 }}>
            <Typography variant="body2" fontWeight={600}>{key}</Typography>
            {def.required && <Typography variant="caption" color="error">*</Typography>}
            {def.description && (
              <Tooltip title={def.description}>
                <Info size={14} style={{ opacity: 0.5 }} />
              </Tooltip>
            )}
          </Stack>
        );

        if (def.type === 'boolean') {
          return (
            <Box key={key}>
              {label}
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={values[key] !== undefined ? !!values[key] : (def.default ?? false)}
                    onChange={e => update(key, e.target.checked)}
                  />
                }
                label={<Typography variant="body2">{values[key] ? 'Yes' : 'No'}</Typography>}
              />
            </Box>
          );
        }

        // "sources" array → multi-select source picker
        if (def.type === 'array' && key === 'sources') {
          const arrVal = Array.isArray(values[key])
            ? values[key]
            : (Array.isArray(def.default) ? def.default : []);
          return (
            <Box key={key}>
              {label}
              <SourcesSelector
                value={arrVal}
                onChange={v => update(key, v)}
              />
            </Box>
          );
        }

        return (
          <Box key={key}>
            {label}
            <TextField
              fullWidth size="small"
              type={def.type === 'number' ? 'number' : 'text'}
              value={
                values[key] !== undefined
                  ? (Array.isArray(values[key]) ? JSON.stringify(values[key]) : String(values[key]))
                  : (def.default !== undefined
                    ? (Array.isArray(def.default) ? JSON.stringify(def.default) : String(def.default))
                    : '')
              }
              onChange={e => {
                let v = e.target.value;
                if (def.type === 'number') v = parseFloat(v);
                if (def.type === 'array') { try { v = JSON.parse(v); } catch {} }
                update(key, v);
              }}
              placeholder={def.description || ''}
              helperText={def.description || ''}
            />
          </Box>
        );
      })}
    </Stack>
  );
}
