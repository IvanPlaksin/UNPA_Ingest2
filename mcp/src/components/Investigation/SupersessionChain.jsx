import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Chip, Stack, CircularProgress, Divider, Tooltip,
} from '@mui/material';
import { CheckCircle, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';

const API = '/api/v1/entity-store';

function VersionRow({ doc, relation, color, icon: Icon }) {
  return (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: 2, mb: 0.3 }}>
      <Icon size={10} style={{ color, flexShrink: 0 }} />
      <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {doc.documentSymbol || doc.name}
      </Typography>
      {doc.effectiveDate && (
        <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', flexShrink: 0 }}>
          {doc.effectiveDate}
        </Typography>
      )}
      <Chip
        label={relation}
        size="small"
        sx={{ fontSize: '0.52rem', height: 14, bgcolor: color + '18', color, flexShrink: 0 }}
      />
    </Stack>
  );
}

export default function SupersessionChain({ entityId, entityName, entityType }) {
  const [chain, setChain]   = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entityId) return;
    // Only fetch for document-like entities
    if (entityType && !['DOCUMENT', 'POLICY', 'RESOLUTION', 'REGULATION', 'GUIDELINE'].includes(entityType?.toUpperCase())) return;
    setLoading(true);
    fetch(`${API}/${encodeURIComponent(entityId)}/supersession-chain`)
      .then(r => r.json())
      .then(({ data }) => setChain(data))
      .catch(() => setChain(null))
      .finally(() => setLoading(false));
  }, [entityId, entityType]);

  if (loading) return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 1, opacity: 0.5 }}>
      <CircularProgress size={10} />
      <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>Loading supersession chain…</Typography>
    </Box>
  );

  if (!chain) return null;
  const { supersedes = [], supersededBy = [], isInForce } = chain;
  if (!supersedes.length && !supersededBy.length) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Divider sx={{ mb: 0.75 }} />
      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: 'text.secondary', mb: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Supersession Chain
      </Typography>

      {/* Newer versions that supersede this */}
      {supersededBy.map((doc, i) => (
        <VersionRow key={doc.id || i} doc={doc} relation="Superseded By" color="#ef4444" icon={ArrowUp} />
      ))}

      {/* This entity — current row */}
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.3, pl: 0.25 }}>
        {isInForce
          ? <CheckCircle size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
          : <AlertTriangle size={12} style={{ color: '#f97316', flexShrink: 0 }} />
        }
        <Typography sx={{ fontSize: '0.73rem', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entityName}
        </Typography>
        <Chip
          label={isInForce ? 'In Force' : 'Superseded'}
          size="small"
          color={isInForce ? 'success' : 'warning'}
          sx={{ fontSize: '0.55rem', height: 16, flexShrink: 0 }}
        />
      </Stack>

      {/* Older documents this entity supersedes */}
      {supersedes.map((doc, i) => (
        <VersionRow key={doc.id || i} doc={doc} relation="Supersedes" color="#3b82f6" icon={ArrowDown} />
      ))}
    </Box>
  );
}
