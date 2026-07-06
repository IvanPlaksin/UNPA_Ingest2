/**
 * EntityPickerBubble — shown after a LOCATE artifact with multiple results.
 *
 * Lets the user select entities from the LOCATE result set and pin them
 * as "entity context" for the next operation (CONNECT, EXPAND, etc.).
 *
 * On "Use selected" → calls onSetEntityContext([...selectedEntities])
 * These entities appear as context chips above the chat input.
 */
import React, { useState } from 'react';
import {
  Box, Stack, Typography, Button, Chip, Paper,
} from '@mui/material';
import { CheckCircle, Pin } from 'lucide-react';

export default function EntityPickerBubble({ results = [], onSetEntityContext }) {
  const [selected, setSelected] = useState(new Set());

  if (!results || results.length <= 1) return null;

  const toggle = (entityId) => {
    setSelected(s => {
      const next = new Set(s);
      next.has(entityId) ? next.delete(entityId) : next.add(entityId);
      return next;
    });
  };

  const handleUse = () => {
    const entities = results
      .filter(r => selected.has(r.entityId))
      .map(r => ({ id: r.entityId, label: r.name, type: r.type, namespace: r.namespace }));
    onSetEntityContext(entities);
  };

  return (
    <Box sx={{ mt: 0.75 }}>
      <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 700, display: 'block', mb: 0.5 }}>
        Select entities to use in next operation:
      </Typography>
      <Stack spacing={0.4} sx={{ maxHeight: 220, overflow: 'auto' }}>
        {results.map(r => {
          const isSelected = selected.has(r.entityId);
          return (
            <Paper
              key={r.entityId}
              elevation={0}
              onClick={() => toggle(r.entityId)}
              sx={{
                px: 1, py: 0.5,
                border: 1,
                borderColor: isSelected ? 'primary.main' : 'divider',
                borderRadius: 1,
                cursor: 'pointer',
                bgcolor: isSelected ? 'primary.50' : 'transparent',
                transition: 'all 0.1s',
                '&:hover': { borderColor: 'primary.light', bgcolor: 'action.hover' },
                display: 'flex', alignItems: 'center', gap: 0.75,
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.name}
                </Typography>
                {(r.type || r.namespace) && (
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.62rem' }}>
                    {[r.type, r.namespace].filter(Boolean).join(' · ')}
                  </Typography>
                )}
              </Box>
              {isSelected && <CheckCircle size={13} style={{ color: '#3b82f6', flexShrink: 0 }} />}
            </Paper>
          );
        })}
      </Stack>
      {selected.size > 0 && (
        <Button
          size="small"
          variant="outlined"
          startIcon={<Pin size={12} />}
          onClick={handleUse}
          sx={{ mt: 0.75, fontSize: '0.7rem', py: 0.25, px: 1 }}
        >
          Use {selected.size} selected
        </Button>
      )}
    </Box>
  );
}
