/**
 * VectorFilterBuilder — per-collection payload filter UI for Graph Transfer.
 *
 * Uses a collection's payload-schema (GET /meta/collections/:c/payload-schema) to
 * offer field/operator/value pickers, and emits a `vectorFilters[collection]`
 * config: { conditions: [{field, operator, value}], logic: 'AND'|'OR' }.
 */

import { useState, useEffect, useRef } from 'react';
import {
    Box, Paper, Typography, Select, MenuItem, TextField, Checkbox, ListItemText,
    IconButton, Button, Chip, Stack,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';

const OPERATORS_FOR_TYPE = (type) => {
    const base = [{ v: 'eq', l: '=' }, { v: 'in', l: 'in' }, { v: 'exists', l: 'exists' }];
    if (type === 'integer' || type === 'float') base.splice(2, 0, { v: 'range', l: 'range' });
    if (type === 'array') base.splice(2, 0, { v: 'any', l: 'any of' });
    return base;
};

function ValueInput({ condition, field, onChange }) {
    const { operator, value } = condition;
    const distinct = field?.distinctValues;

    if (operator === 'exists') {
        return <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>(field present)</Typography>;
    }
    if (operator === 'eq') {
        return distinct
            ? (
                <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)} size="small" sx={{ minWidth: 160 }}>
                    {distinct.map((v) => <MenuItem key={String(v)} value={v}>{String(v)}</MenuItem>)}
                </Select>
            )
            : <TextField value={value ?? ''} onChange={(e) => onChange(e.target.value)} size="small" sx={{ minWidth: 160 }} />;
    }
    if (operator === 'in' || operator === 'any') {
        const arr = Array.isArray(value) ? value : [];
        return distinct
            ? (
                <Select multiple value={arr} onChange={(e) => onChange(e.target.value)} size="small" sx={{ minWidth: 220 }}
                    renderValue={(sel) => sel.join(', ')}>
                    {distinct.map((v) => (
                        <MenuItem key={String(v)} value={v}>
                            <Checkbox size="small" checked={arr.includes(v)} />
                            <ListItemText primary={String(v)} />
                        </MenuItem>
                    ))}
                </Select>
            )
            : (
                <TextField value={arr.join(', ')} placeholder="a, b, c" size="small" sx={{ minWidth: 220 }}
                    onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
            );
    }
    if (operator === 'range') {
        const v = value || {};
        const num = (x) => (x === '' || x === undefined ? undefined : Number(x));
        return (
            <Stack direction="row" spacing={1}>
                <TextField label="≥" type="number" size="small" sx={{ width: 90 }} value={v.gte ?? ''}
                    onChange={(e) => onChange({ ...v, gte: num(e.target.value) })} />
                <TextField label="≤" type="number" size="small" sx={{ width: 90 }} value={v.lte ?? ''}
                    onChange={(e) => onChange({ ...v, lte: num(e.target.value) })} />
            </Stack>
        );
    }
    return null;
}

function ConditionRow({ condition, schema, onChange, onRemove, disabled }) {
    const field = schema.fields.find((f) => f.name === condition.field);
    const ops = OPERATORS_FOR_TYPE(field?.type);
    return (
        <Stack direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
            <Select value={condition.field} size="small" sx={{ minWidth: 150 }} disabled={disabled}
                onChange={(e) => onChange({ field: e.target.value, operator: 'eq', value: null })}>
                {schema.filterableFields.map((f) => <MenuItem key={f} value={f}>{f}</MenuItem>)}
            </Select>
            <Select value={condition.operator} size="small" sx={{ minWidth: 100 }} disabled={disabled}
                onChange={(e) => onChange({ ...condition, operator: e.target.value, value: e.target.value === 'range' ? {} : (e.target.value === 'in' || e.target.value === 'any' ? [] : null) })}>
                {ops.map((o) => <MenuItem key={o.v} value={o.v}>{o.l}</MenuItem>)}
            </Select>
            <ValueInput condition={condition} field={field} onChange={(value) => onChange({ ...condition, value })} />
            <IconButton size="small" onClick={onRemove} disabled={disabled}><CloseIcon fontSize="small" /></IconButton>
        </Stack>
    );
}

export default function VectorFilterBuilder({ collection, schema, filter, onChange, disabled }) {
    const [local, setLocal] = useState(filter || { conditions: [], logic: 'AND' });
    const first = useRef(true);

    // Debounced upward propagation (avoids a preview call per keystroke).
    useEffect(() => {
        if (first.current) { first.current = false; return; }
        const t = setTimeout(() => onChange(local.conditions.length ? local : null), 350);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [local]);

    if (!schema) {
        return <Typography variant="caption" color="text.secondary">Loading filter fields for {collection}…</Typography>;
    }
    if (!schema.filterableFields?.length) {
        return <Typography variant="caption" color="text.secondary">{collection}: no filterable fields.</Typography>;
    }

    const addCondition = () => setLocal((s) => ({ ...s, conditions: [...s.conditions, { field: schema.filterableFields[0], operator: 'eq', value: null }] }));
    const updateCondition = (i, c) => setLocal((s) => ({ ...s, conditions: s.conditions.map((x, idx) => (idx === i ? c : x)) }));
    const removeCondition = (i) => setLocal((s) => ({ ...s, conditions: s.conditions.filter((_, idx) => idx !== i) }));

    return (
        <Paper variant="outlined" sx={{ p: 1.5, mt: 1 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2">Filter: {collection}</Typography>
                <Select value={local.logic} size="small" disabled={disabled || local.conditions.length < 2}
                    onChange={(e) => setLocal((s) => ({ ...s, logic: e.target.value }))}>
                    <MenuItem value="AND">AND</MenuItem>
                    <MenuItem value="OR">OR</MenuItem>
                </Select>
            </Stack>

            {local.conditions.map((c, i) => (
                <ConditionRow key={i} condition={c} schema={schema} disabled={disabled}
                    onChange={(nc) => updateCondition(i, nc)} onRemove={() => removeCondition(i)} />
            ))}
            {local.conditions.length === 0 && (
                <Typography variant="caption" color="text.secondary">No conditions — the whole collection is exported.</Typography>
            )}

            <Box sx={{ mt: 1 }}>
                <Button size="small" startIcon={<AddIcon />} onClick={addCondition} disabled={disabled}>Add condition</Button>
            </Box>
        </Paper>
    );
}

export { VectorFilterBuilder };
