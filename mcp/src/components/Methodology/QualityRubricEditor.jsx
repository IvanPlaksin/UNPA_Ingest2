import React from 'react';
import {
  Box, Typography, Stack, TextField, Tooltip, Paper,
} from '@mui/material';
import { ShieldCheck } from 'lucide-react';

const RUBRIC_FIELDS = [
  {
    key: 'minEntityCount',
    label: 'Min entity count',
    description: 'Minimum number of entity nodes that must be returned in results',
    type: 'number',
    placeholder: 'e.g. 5',
  },
  {
    key: 'minProvenanceRatio',
    label: 'Min provenance ratio (0–1)',
    description: 'Fraction of result nodes that must have provenance/evidence (0.0 to 1.0)',
    type: 'number',
    placeholder: 'e.g. 0.7',
  },
  {
    key: 'minSourceCoverage',
    label: 'Min source coverage (0–1)',
    description: 'Fraction of declared sources that must contribute at least one result',
    type: 'number',
    placeholder: 'e.g. 0.5',
  },
];

export default function QualityRubricEditor({ value = {}, onChange }) {
  const update = (key, raw) => {
    const num = parseFloat(raw);
    const next = { ...value };
    if (raw === '' || raw === undefined) {
      delete next[key];
    } else if (!isNaN(num)) {
      next[key] = num;
    }
    onChange(next);
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
        <ShieldCheck size={18} />
        <Typography variant="subtitle2">Quality gates</Typography>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          {RUBRIC_FIELDS.map(({ key, label, description, placeholder }) => (
            <Tooltip key={key} title={description} placement="right">
              <TextField
                label={label}
                type="number"
                value={value[key] !== undefined ? String(value[key]) : ''}
                onChange={e => update(key, e.target.value)}
                size="small"
                fullWidth
                placeholder={placeholder}
                inputProps={{ step: key === 'minEntityCount' ? 1 : 0.05, min: 0 }}
                helperText={description}
              />
            </Tooltip>
          ))}
        </Stack>
      </Paper>

      {Object.keys(value).length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Active gates: {Object.entries(value).map(([k, v]) => `${k}=${v}`).join(', ')}
        </Typography>
      )}
    </Box>
  );
}
