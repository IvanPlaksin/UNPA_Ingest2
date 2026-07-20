import React, { useState } from 'react';
import {
  Box, Typography, Stack, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, IconButton, Tooltip, Switch, FormControlLabel,
  Paper, Divider,
} from '@mui/material';
import { Plus, Trash2, GripVertical } from 'lucide-react';

const PARAM_TYPES = ['string', 'number', 'boolean', 'array'];

function ParamRow({ name, def, onChange, onDelete, isFirst }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, mb: 1 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        <Box sx={{ color: 'text.disabled', pt: 1 }}>
          <GripVertical size={16} />
        </Box>

        <Stack spacing={1} sx={{ flex: 1 }}>
          <Stack direction="row" spacing={1}>
            <TextField
              label="Parameter name"
              value={name}
              onChange={e => onChange(name, 'name', e.target.value)}
              size="small"
              sx={{ flex: 1 }}
              inputProps={{ style: { fontFamily: 'monospace' } }}
            />
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Type</InputLabel>
              <Select
                label="Type"
                value={def.type || 'string'}
                onChange={e => onChange(name, 'type', e.target.value)}
              >
                {PARAM_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </Select>
            </FormControl>
          </Stack>

          <TextField
            label="Description"
            value={def.description || ''}
            onChange={e => onChange(name, 'description', e.target.value)}
            size="small"
            fullWidth
          />

          {def.type !== 'boolean' && (
            <TextField
              label="Default value"
              value={def.default !== undefined ? String(def.default) : ''}
              onChange={e => {
                let v = e.target.value;
                if (def.type === 'number') v = Number(v) || '';
                if (def.type === 'array') try { v = JSON.parse(v); } catch {}
                onChange(name, 'default', v);
              }}
              size="small"
              fullWidth
              placeholder={def.type === 'array' ? '["a","b"]' : ''}
            />
          )}

          <FormControlLabel
            control={<Switch size="small" checked={!!def.required} onChange={e => onChange(name, 'required', e.target.checked)} />}
            label={<Typography variant="caption">Required</Typography>}
          />
        </Stack>

        <Tooltip title="Remove parameter">
          <IconButton size="small" onClick={() => onDelete(name)} color="error">
            <Trash2 size={16} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}

export default function ParameterSchemaBuilder({ value = {}, onChange }) {
  const [newName, setNewName] = useState('');

  const addParam = () => {
    const key = newName.trim().replace(/\s+/g, '_');
    if (!key || value[key]) return;
    onChange({ ...value, [key]: { type: 'string', description: '', required: false } });
    setNewName('');
  };

  const updateParam = (oldName, field, val) => {
    const entries = Object.entries(value);
    const idx = entries.findIndex(([k]) => k === oldName);
    if (idx === -1) return;

    if (field === 'name') {
      const newKey = val.trim().replace(/\s+/g, '_');
      if (!newKey || (newKey !== oldName && value[newKey])) return;
      entries[idx] = [newKey, entries[idx][1]];
    } else {
      entries[idx] = [oldName, { ...entries[idx][1], [field]: val }];
    }
    onChange(Object.fromEntries(entries));
  };

  const deleteParam = (name) => {
    const { [name]: _, ...rest } = value;
    onChange(rest);
  };

  const entries = Object.entries(value);

  return (
    <Box>
      {entries.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No parameters yet. Add one below.
        </Typography>
      )}

      {entries.map(([name, def], i) => (
        <ParamRow
          key={name}
          name={name}
          def={def}
          onChange={updateParam}
          onDelete={deleteParam}
          isFirst={i === 0}
        />
      ))}

      <Divider sx={{ my: 1.5 }} />

      <Stack direction="row" spacing={1}>
        <TextField
          label="New parameter name"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          size="small"
          sx={{ flex: 1 }}
          onKeyDown={e => e.key === 'Enter' && addParam()}
          inputProps={{ style: { fontFamily: 'monospace' } }}
          placeholder="e.g. serviceName"
        />
        <Button
          variant="outlined"
          startIcon={<Plus size={16} />}
          onClick={addParam}
          disabled={!newName.trim()}
        >
          Add
        </Button>
      </Stack>
    </Box>
  );
}
