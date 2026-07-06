import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Chip, Stack, CircularProgress, Collapse, IconButton,
} from '@mui/material';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';

const API = '/api/v1/entity-store';

function EvidenceRow({ ev }) {
  const conf = ev.confidence != null ? `${(ev.confidence * 100).toFixed(0)}%` : null;
  return (
    <Stack direction="row" alignItems="flex-start" spacing={0.5} sx={{ mb: 0.4 }}>
      <FileText size={9} style={{ color: '#94a3b8', flexShrink: 0, marginTop: 3 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: '0.63rem', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
            {ev.documentId || 'Unknown document'}
          </Typography>
          {conf && (
            <Chip label={conf} size="small" sx={{ fontSize: '0.52rem', height: 14, flexShrink: 0, bgcolor: 'action.hover' }} />
          )}
        </Stack>
        {ev.context && (
          <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled', fontStyle: 'italic', lineHeight: 1.3 }}>
            "{ev.context.slice(0, 100)}{ev.context.length > 100 ? '…' : ''}"
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

export default function EvidencePanel({ sourceId, targetId, relType }) {
  const [evidence, setEvidence] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);

  useEffect(() => {
    if (!sourceId || !targetId || !open) return;
    setLoading(true);
    const params = new URLSearchParams({ sourceId, targetId });
    if (relType) params.append('relType', relType);
    fetch(`${API}/evidence?${params}`)
      .then(r => r.json())
      .then(({ data }) => setEvidence(data || []))
      .catch(() => setEvidence([]))
      .finally(() => setLoading(false));
  }, [sourceId, targetId, relType, open]);

  if (!sourceId || !targetId) return null;

  return (
    <Box sx={{ mt: 0.5 }}>
      <Stack direction="row" alignItems="center" spacing={0.25} sx={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          Evidence sources
        </Typography>
        {evidence != null && !loading && (
          <Chip label={evidence.length} size="small" sx={{ fontSize: '0.5rem', height: 14 }} />
        )}
        {loading
          ? <CircularProgress size={10} sx={{ ml: 0.5 }} />
          : open
            ? <ChevronUp size={11} style={{ color: '#94a3b8' }} />
            : <ChevronDown size={11} style={{ color: '#94a3b8' }} />
        }
      </Stack>

      <Collapse in={open}>
        {evidence?.length === 0 && (
          <Typography sx={{ fontSize: '0.62rem', color: 'text.disabled', mt: 0.25 }}>
            No evidence nodes found for this relationship.
          </Typography>
        )}
        {evidence?.slice(0, 8).map((ev, i) => (
          <EvidenceRow key={ev.id || i} ev={ev} />
        ))}
        {evidence?.length > 8 && (
          <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled' }}>
            +{evidence.length - 8} more sources
          </Typography>
        )}
      </Collapse>
    </Box>
  );
}
