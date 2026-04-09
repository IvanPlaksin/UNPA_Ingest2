import React, { useState } from 'react';
import { Box, Typography, Paper, Radio, RadioGroup, FormControlLabel, TextField, Divider, Chip, Alert, Accordion, AccordionSummary, AccordionDetails, Grid } from '@mui/material';
import { AlertTriangle, ChevronDown, Check, X } from 'lucide-react';

export default function ConflictResolutionStep({ conflicts, resolutions, onResolutionChange }) {
  const [expanded, setExpanded] = useState(conflicts[0]?.draftId || null);

  if (!conflicts.length) return <Alert severity="success">No conflicts to resolve.</Alert>;

  const setStrategy = (draftId, strategy) => onResolutionChange(draftId, { ...resolutions[draftId], strategy, resolved: strategy !== 'merge', finalAction: strategy });
  const setField = (draftId, field, value) => {
    const cur = resolutions[draftId] || {};
    const fields = { ...cur.fields, [field]: value };
    const draft = conflicts.find(c => c.draftId === draftId);
    const allResolved = draft.conflicts.every(c => fields[c.field] !== undefined);
    onResolutionChange(draftId, { ...cur, fields, resolved: allResolved, strategy: 'merge', finalAction: 'merge' });
  };

  return (
    <Box>
      <Alert severity="warning" sx={{ mb: 2 }}>{conflicts.length} conflict(s) need resolution.</Alert>
      {conflicts.map(item => {
        const res = resolutions[item.draftId] || {};
        return (
          <Accordion key={item.draftId} expanded={expanded === item.draftId} onChange={() => setExpanded(expanded === item.draftId ? null : item.draftId)} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ChevronDown size={18} />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                <AlertTriangle size={18} color={res.resolved ? '#4caf50' : '#f44336'} />
                <Typography variant="subtitle2" sx={{ flex: 1 }}>{item.draftName}</Typography>
                <Chip label={item.draftType} size="small" variant="outlined" />
                <Chip icon={res.resolved ? <Check size={14} /> : <X size={14} />} label={res.resolved ? 'Resolved' : `${item.conflicts.length} conflicts`} size="small" color={res.resolved ? 'success' : 'error'} />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {item.bestMatch && <Paper sx={{ p: 2, mb: 2, bgcolor: 'grey.50' }}><Typography variant="caption" color="text.secondary">Matches:</Typography><Typography variant="body2" fontWeight="medium">{item.bestMatch.entity?.name} ({Math.round(item.maxSimilarity * 100)}%)</Typography></Paper>}

              <RadioGroup value={res.strategy || ''} onChange={e => setStrategy(item.draftId, e.target.value)}>
                <FormControlLabel value="use_draft" control={<Radio size="small" />} label={<Box><Typography variant="body2">Use Draft values</Typography><Typography variant="caption" color="text.secondary">Replace KB entity</Typography></Box>} />
                <FormControlLabel value="use_kb" control={<Radio size="small" />} label={<Box><Typography variant="body2">Keep KB values</Typography><Typography variant="caption" color="text.secondary">Skip this draft</Typography></Box>} />
                <FormControlLabel value="merge" control={<Radio size="small" />} label={<Box><Typography variant="body2">Merge (per field)</Typography><Typography variant="caption" color="text.secondary">Choose per conflicting field</Typography></Box>} />
              </RadioGroup>

              {res.strategy === 'merge' && (
                <Box sx={{ mt: 2, pl: 2 }}>
                  <Divider sx={{ mb: 2 }} />
                  {item.conflicts.map(c => (
                    <Paper key={c.field} sx={{ p: 2, mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>{c.field} <Chip label={c.type} size="small" color="warning" sx={{ ml: 1 }} /></Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={6}>
                          <Paper sx={{ p: 1.5, cursor: 'pointer', border: res.fields?.[c.field] === 'use_draft' ? 2 : 1, borderColor: res.fields?.[c.field] === 'use_draft' ? 'success.main' : 'divider', bgcolor: res.fields?.[c.field] === 'use_draft' ? 'success.50' : 'grey.100' }} onClick={() => setField(item.draftId, c.field, 'use_draft')}>
                            <Typography variant="caption" color="text.secondary">Draft</Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(c.draftValue, null, 2)}</Typography>
                          </Paper>
                        </Grid>
                        <Grid item xs={6}>
                          <Paper sx={{ p: 1.5, cursor: 'pointer', border: res.fields?.[c.field] === 'use_kb' ? 2 : 1, borderColor: res.fields?.[c.field] === 'use_kb' ? 'info.main' : 'divider', bgcolor: res.fields?.[c.field] === 'use_kb' ? 'info.50' : 'grey.100' }} onClick={() => setField(item.draftId, c.field, 'use_kb')}>
                            <Typography variant="caption" color="text.secondary">KB</Typography>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(c.kbValue, null, 2)}</Typography>
                          </Paper>
                        </Grid>
                      </Grid>
                    </Paper>
                  ))}
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
