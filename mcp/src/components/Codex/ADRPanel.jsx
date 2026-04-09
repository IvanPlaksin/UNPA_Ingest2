/**
 * ADRPanel - Architecture Decision Records viewer
 * Split-view: list (left) + details (right)
 */
import React, { useState } from 'react';
import { Box, Typography, Card, CardContent, Chip, Divider, CircularProgress } from '@mui/material';
import { Shield, CheckCircle, Clock, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';
import { useCodexADRs } from '../../hooks/useCodex';

const STATUS_CONFIG = {
  ACCEPTED:   { icon: CheckCircle,   color: '#4caf50', bg: '#e8f5e9', label: 'Accepted' },
  accepted:   { icon: CheckCircle,   color: '#4caf50', bg: '#e8f5e9', label: 'Accepted' },
  PROPOSED:   { icon: Clock,         color: '#ff9800', bg: '#fff3e0', label: 'Proposed' },
  proposed:   { icon: Clock,         color: '#ff9800', bg: '#fff3e0', label: 'Proposed' },
  DEPRECATED: { icon: AlertTriangle, color: '#f44336', bg: '#ffebee', label: 'Deprecated' },
  deprecated: { icon: AlertTriangle, color: '#f44336', bg: '#ffebee', label: 'Deprecated' },
  SUPERSEDED: { icon: XCircle,       color: '#9e9e9e', bg: '#f5f5f5', label: 'Superseded' },
  superseded: { icon: XCircle,       color: '#9e9e9e', bg: '#f5f5f5', label: 'Superseded' },
};

function prop(node, key) {
  return node?.properties?.[key] ?? node?.[key] ?? '';
}

function ADRListItem({ adr, selected, onClick }) {
  const id = prop(adr, 'adrId');
  const title = prop(adr, 'title');
  const status = prop(adr, 'status') || 'ACCEPTED';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ACCEPTED;
  const Icon = cfg.icon;
  const linkedParts = adr.linkedParts || [];

  return (
    <Card
      onClick={onClick}
      sx={{
        mb: 0.75, cursor: 'pointer',
        bgcolor: selected ? 'rgba(79,209,197,0.1)' : 'background.paper',
        border: 1, borderColor: selected ? '#4fd1c5' : 'divider',
        '&:hover': { borderColor: '#4fd1c5' }
      }}
    >
      <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Icon size={14} style={{ color: cfg.color }} />
          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{id}</Typography>
          <Chip label={cfg.label} size="small" sx={{ height: 18, fontSize: '9px', bgcolor: cfg.bg, color: cfg.color, fontWeight: 600 }} />
        </Box>
        <Typography variant="body2" sx={{ fontSize: '12px', fontWeight: 500, mb: 0.5 }}>{title}</Typography>
        {linkedParts.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {linkedParts.map(p => (
              <Chip key={p} label={p} size="small" variant="outlined"
                sx={{ height: 16, fontSize: '9px', '& .MuiChip-label': { px: 0.5 } }} />
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function ADRDetail({ adr, onNavigatePart }) {
  if (!adr) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.disabled' }}>
        <Box sx={{ textAlign: 'center' }}>
          <Shield size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
          <Typography variant="body2">Select an ADR to view details</Typography>
        </Box>
      </Box>
    );
  }

  const id = prop(adr, 'adrId');
  const title = prop(adr, 'title');
  const status = prop(adr, 'status') || 'ACCEPTED';
  const decision = prop(adr, 'decision');
  const hash = prop(adr, 'hash');
  const fileName = prop(adr, 'fileName');
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ACCEPTED;
  const Icon = cfg.icon;
  const linkedParts = adr.linkedParts || [];

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Icon size={20} style={{ color: cfg.color }} />
          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{id}</Typography>
          <Chip label={cfg.label} size="small" sx={{ height: 22, bgcolor: cfg.bg, color: cfg.color, fontWeight: 600 }} />
        </Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {/* Decision */}
        {decision && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, display: 'block', fontWeight: 600 }}>
              Decision
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontSize: '12.5px', lineHeight: 1.6 }}>
              {decision}
            </Typography>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Linked Parts */}
        {linkedParts.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', mb: 1, display: 'block', fontWeight: 600 }}>
              Implements Codex Parts
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {linkedParts.map(partId => (
                <Chip
                  key={partId}
                  label={partId}
                  onClick={() => onNavigatePart?.(partId)}
                  icon={<ExternalLink size={12} />}
                  sx={{ cursor: 'pointer', '&:hover': { borderColor: '#4fd1c5' } }}
                  variant="outlined"
                />
              ))}
            </Box>
          </Box>
        )}

        {/* Metadata */}
        <Typography variant="caption" sx={{ color: 'text.disabled', mb: 1, display: 'block', fontWeight: 600 }}>
          Metadata
        </Typography>
        <Box sx={{ display: 'flex', mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.disabled', width: 80 }}>File</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{fileName}</Typography>
        </Box>
        <Box sx={{ display: 'flex', mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: 'text.disabled', width: 80 }}>Hash</Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{hash}</Typography>
        </Box>
      </Box>
    </Box>
  );
}

export default function ADRPanel({ onNavigatePart }) {
  const { adrs, loading } = useCodexADRs();
  const [selectedIdx, setSelectedIdx] = useState(null);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={24} /></Box>;
  }

  const selectedAdr = selectedIdx !== null ? adrs[selectedIdx] : null;

  return (
    <Box sx={{ height: '100%', display: 'flex' }}>
      {/* Left: List */}
      <Box sx={{ width: 300, borderRight: 1, borderColor: 'divider', overflow: 'auto', p: 1.5, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Shield size={16} />
          <Typography variant="subtitle2">Architecture Decision Records</Typography>
          <Chip label={adrs.length} size="small" sx={{ height: 20, fontSize: '10px' }} />
        </Box>
        {adrs.map((adr, i) => (
          <ADRListItem
            key={prop(adr, 'adrId') || i}
            adr={adr}
            selected={selectedIdx === i}
            onClick={() => setSelectedIdx(i)}
          />
        ))}
      </Box>

      {/* Right: Detail */}
      <Box sx={{ flex: 1 }}>
        <ADRDetail adr={selectedAdr} onNavigatePart={onNavigatePart} />
      </Box>
    </Box>
  );
}
