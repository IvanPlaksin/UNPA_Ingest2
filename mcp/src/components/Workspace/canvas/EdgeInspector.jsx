/**
 * EdgeInspector (WS3-006)
 *
 * Floating panel that appears when an edge is selected on WorkspaceCanvas.
 * Lets the user edit:
 *   - relation type (label) — preset enum or custom value
 *   - confidence (0..1)
 *   - arbitrary key/value properties
 *
 * Changes are applied to local React state via onChange. Persistence happens
 * on the next canvas Save (same as NodeInspector).
 *
 * Delete button removes the edge from local state via onDelete.
 */

import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Typography, IconButton, Paper, Divider, TextField, MenuItem,
  Button, Chip, Tooltip
} from '@mui/material';
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Add as AddIcon
} from '@mui/icons-material';

const PRESET_RELATIONS = [
  'RELATES_TO',
  'BELONGS_TO',
  'CONTAINS',
  'WORKS_IN',
  'DEPENDS_ON',
  'IMPLEMENTS',
  'REFERENCES',
  'EXTENDS',
  'PRODUCES',
  'CONSUMES',
  'TRIGGERS',
  'GOVERNS',
  'CONFLICTS_WITH'
];

const inferType = (value) => {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'string';
};

const coerceValue = (raw, type) => {
  if (type === 'number') {
    const n = parseFloat(raw);
    return isNaN(n) ? 0 : n;
  }
  if (type === 'boolean') return raw === 'true' || raw === true;
  return String(raw ?? '');
};

const EdgeInspector = ({ edge, onChange, onDelete, onClose }) => {
  const [relType, setRelType] = useState('RELATES_TO');
  const [customMode, setCustomMode] = useState(false);
  const [confidence, setConfidence] = useState(0.8);
  const [props, setProps] = useState([]);   // [{ key, value, type }]
  const [newKey, setNewKey] = useState('');

  // Load edge into local state
  useEffect(() => {
    if (!edge) return;
    const initialType = edge.label || edge.data?.relationType || 'RELATES_TO';
    setRelType(initialType);
    setCustomMode(!PRESET_RELATIONS.includes(initialType));
    setConfidence(typeof edge.data?.confidence === 'number' ? edge.data.confidence : 0.8);

    const propEntries = [];
    const sourceProps = edge.data?.properties || {};
    for (const [k, v] of Object.entries(sourceProps)) {
      // Skip control fields
      if (['id', 'createdAt', 'confidence'].includes(k)) continue;
      propEntries.push({ key: k, value: v, type: inferType(v) });
    }
    setProps(propEntries);
    setNewKey('');
  }, [edge?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!edge) return null;

  const handleApply = () => {
    const propsObject = {};
    for (const p of props) {
      if (!p.key) continue;
      propsObject[p.key] = coerceValue(p.value, p.type);
    }
    onChange(edge.id, {
      label: relType,
      data: {
        ...edge.data,
        relationType: relType,
        confidence,
        properties: propsObject
      }
    });
  };

  const handleAddProp = () => {
    if (!newKey.trim()) return;
    setProps(prev => [...prev, { key: newKey.trim(), value: '', type: 'string' }]);
    setNewKey('');
  };

  const handleRemoveProp = (idx) => {
    setProps(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePropChange = (idx, partial) => {
    setProps(prev => prev.map((p, i) => i === idx ? { ...p, ...partial } : p));
  };

  return (
    <Paper sx={{ p: 1.5, width: 320, position: 'absolute', top: 12, right: 12, zIndex: 10, maxHeight: 'calc(100% - 24px)', overflowY: 'auto' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Edge Inspector
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Divider sx={{ mb: 1 }} />

      <Stack direction="row" spacing={0.5} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip
          label={`${edge.source?.slice(0, 8)} → ${edge.target?.slice(0, 8)}`}
          size="small"
          sx={{ fontFamily: 'monospace', fontSize: '0.6rem', height: 18 }}
        />
      </Stack>

      {/* Relation type */}
      {customMode ? (
        <TextField
          label="Relation type (custom)"
          size="small"
          fullWidth
          value={relType}
          onChange={(e) => setRelType(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
          sx={{ mb: 1 }}
          helperText="Use UPPER_SNAKE_CASE"
        />
      ) : (
        <TextField
          select
          label="Relation type"
          size="small"
          fullWidth
          value={relType}
          onChange={(e) => {
            if (e.target.value === '__custom__') setCustomMode(true);
            else setRelType(e.target.value);
          }}
          sx={{ mb: 1 }}
        >
          {PRESET_RELATIONS.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          <MenuItem value="__custom__"><em>Custom…</em></MenuItem>
        </TextField>
      )}

      {customMode && (
        <Button size="small" onClick={() => setCustomMode(false)} sx={{ mb: 1, fontSize: '0.65rem' }}>
          Use preset
        </Button>
      )}

      <TextField
        label="Confidence"
        size="small"
        type="number"
        inputProps={{ step: 0.05, min: 0, max: 1 }}
        fullWidth
        value={confidence}
        onChange={(e) => setConfidence(parseFloat(e.target.value) || 0)}
        sx={{ mb: 1.5 }}
      />

      <Divider sx={{ mb: 1 }} />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
        PROPERTIES ({props.length})
      </Typography>

      {props.length === 0 && (
        <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', display: 'block', mb: 1 }}>
          No properties
        </Typography>
      )}

      {props.map((p, i) => (
        <Stack key={i} direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
          <TextField
            size="small"
            value={p.key}
            onChange={(e) => handlePropChange(i, { key: e.target.value })}
            placeholder="key"
            sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: '0.75rem' } }}
          />
          <TextField
            size="small"
            value={String(p.value ?? '')}
            onChange={(e) => handlePropChange(i, { value: e.target.value })}
            placeholder="value"
            sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: '0.75rem' } }}
          />
          <TextField
            select
            size="small"
            value={p.type}
            onChange={(e) => handlePropChange(i, { type: e.target.value })}
            sx={{ width: 70, '& .MuiInputBase-root': { fontSize: '0.7rem' } }}
          >
            <MenuItem value="string">str</MenuItem>
            <MenuItem value="number">num</MenuItem>
            <MenuItem value="boolean">bool</MenuItem>
          </TextField>
          <IconButton size="small" onClick={() => handleRemoveProp(i)}>
            <DeleteIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Stack>
      ))}

      {/* Add property row */}
      <Stack direction="row" spacing={0.5} sx={{ mb: 1.5 }}>
        <TextField
          size="small"
          placeholder="new property name"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddProp(); } }}
          sx={{ flex: 1, '& .MuiInputBase-root': { fontSize: '0.75rem' } }}
        />
        <Tooltip title="Add property">
          <span>
            <IconButton size="small" onClick={handleAddProp} disabled={!newKey.trim()}>
              <AddIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Divider sx={{ mb: 1 }} />

      <Stack direction="row" spacing={0.5}>
        <Button
          size="small"
          variant="contained"
          fullWidth
          onClick={handleApply}
          sx={{ fontSize: '0.7rem' }}
        >
          Apply
        </Button>
        <Tooltip title="Delete edge">
          <IconButton size="small" color="error" onClick={() => onDelete(edge.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
};

export default EdgeInspector;
