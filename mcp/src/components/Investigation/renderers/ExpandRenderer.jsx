import React from 'react';
import { Box, Typography, Stack, Chip, Divider } from '@mui/material';
import { Network, Link2 } from 'lucide-react';
import EvidencePanel from '../EvidencePanel';
import { fromEnvelope } from './envelope-compat';

const DOC_TYPES = new Set(['DOCUMENT', 'POLICY', 'RESOLUTION', 'REGULATION', 'GUIDELINE']);

function buildEntityMap(nodes) {
  const m = {};
  for (const n of (nodes || [])) {
    const id = n.id || n.entityId;
    if (id) m[id] = n.name || id.slice(0, 8) + '…';
  }
  return m;
}

export default function ExpandRenderer({ content, compact }) {
  const data  = fromEnvelope(content, 'EXPAND');
  const nodes = data?.nodes || [];
  const edges = data?.edges || [];
  const nodeLimit = compact ? 5 : 12;
  const edgeLimit = compact ? 0 : 8;
  const entityMap = buildEntityMap(nodes);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        Depth {data?.depth} · {data?.nodeCount ?? nodes.length} nodes · {data?.edgeCount ?? edges.length} edges
      </Typography>

      {/* Nodes list */}
      {nodes.slice(0, nodeLimit).map((n, i) => {
        const isDocType = DOC_TYPES.has((n.type || '').toUpperCase());
        const superseded = isDocType && n.isInForce === false;
        return (
          <Box key={i} sx={{ py: 0.4, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="body2" sx={{ flex: 1 }}>{n.name || n.entityId}</Typography>
              {n.type && (
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>{n.type}</Typography>
              )}
              {superseded && (
                <Chip label="Superseded" size="small" color="warning" sx={{ fontSize: '0.52rem', height: 14, flexShrink: 0 }} />
              )}
            </Stack>
          </Box>
        );
      })}
      {nodes.length > nodeLimit && (
        <Typography variant="caption" color="text.secondary" sx={{ pt: 0.5, display: 'block' }}>
          +{nodes.length - nodeLimit} more nodes
        </Typography>
      )}

      {/* Edges with EvidencePanel — non-compact only */}
      {!compact && edges.length > 0 && (
        <Box sx={{ mt: 1.25 }}>
          <Divider sx={{ mb: 1 }} />
          <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.75 }}>
            <Link2 size={11} style={{ color: '#94a3b8', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Relationships ({edges.length})
            </Typography>
          </Stack>

          {edges.slice(0, edgeLimit).map((edge, i) => (
            <Box key={i} sx={{
              mb: 0.75, p: '6px 10px', borderLeft: '2px solid', borderColor: 'divider',
              bgcolor: 'action.hover', borderRadius: '0 4px 4px 0',
            }}>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.25 }}>
                <Typography sx={{
                  fontSize: '0.68rem', color: 'text.primary', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90,
                }}>
                  {entityMap[edge.sourceId] || edge.sourceId?.slice(0, 6)}
                </Typography>
                <Chip
                  label={edge.relType || 'RELATED'}
                  size="small"
                  sx={{ fontSize: '0.52rem', height: 14, bgcolor: 'background.paper', flexShrink: 0 }}
                />
                <Typography sx={{
                  fontSize: '0.68rem', color: 'text.primary', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 90,
                }}>
                  {entityMap[edge.targetId] || edge.targetId?.slice(0, 6)}
                </Typography>
                {edge.confidence != null && (
                  <Typography sx={{ fontSize: '0.58rem', color: 'text.disabled', flexShrink: 0 }}>
                    {(edge.confidence * 100).toFixed(0)}%
                  </Typography>
                )}
              </Stack>

              {edge.context && (
                <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary', fontStyle: 'italic', lineHeight: 1.35, mb: 0.25 }}>
                  "{edge.context.slice(0, 100)}{edge.context.length > 100 ? '…' : ''}"
                </Typography>
              )}

              <EvidencePanel sourceId={edge.sourceId} targetId={edge.targetId} relType={edge.relType} />
            </Box>
          ))}

          {edges.length > edgeLimit && (
            <Typography variant="caption" color="text.secondary">
              +{edges.length - edgeLimit} more edges
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}
