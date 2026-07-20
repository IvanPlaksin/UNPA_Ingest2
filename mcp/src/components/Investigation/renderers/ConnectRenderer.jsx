import React, { useState } from 'react';
import { Box, Typography, Chip, Tooltip, Stack } from '@mui/material';
import EvidencePanel from '../EvidencePanel';
import { fromEnvelope } from './envelope-compat';

const AGGREGABLE = new Set([
  'IMPLEMENTS', 'REQUIRES', 'AUTHORED_BY', 'FUNDED_BY',
  'REFERENCES', 'SUPPORTS', 'COOPERATES_WITH', 'MENTIONS', 'RELATED_TO',
]);

function RelChip({ rel }) {
  const isAgg = AGGREGABLE.has(rel.relType);
  const opacity = rel.confidence != null ? Math.max(0.4, rel.confidence) : 0.8;
  return (
    <Tooltip
      title={
        <Box>
          <Typography variant="caption" display="block" fontWeight={700}>{rel.relType}</Typography>
          {rel.context && (
            <Typography variant="caption" display="block" sx={{ fontStyle: 'italic', mt: 0.5 }}>
              "{rel.context?.slice(0, 120)}"
            </Typography>
          )}
          {rel.confidence != null && (
            <Typography variant="caption" display="block">
              Confidence: {(rel.confidence * 100).toFixed(0)}%
            </Typography>
          )}
          {rel.direction === 'backward' && (
            <Typography variant="caption" color="warning.main" display="block">← backward</Typography>
          )}
        </Box>
      }
      arrow
    >
      <Chip
        size="small"
        label={rel.relType}
        variant={isAgg ? 'outlined' : 'filled'}
        sx={{ fontSize: '0.65rem', height: 20, opacity, cursor: 'default' }}
      />
    </Tooltip>
  );
}

function BundleDisplay({ bundle }) {
  const [expanded, setExpanded] = useState(false);
  if (!bundle || !bundle.count) return null;
  const { semantic = [], frequency = [] } = bundle;
  const showAll = expanded || frequency.length <= 3;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.4, alignItems: 'center' }}>
      {semantic.map((r, i) => <RelChip key={i} rel={r} />)}
      {showAll
        ? frequency.map((r, i) => <RelChip key={`f${i}`} rel={r} />)
        : (
          <>
            {frequency.slice(0, 2).map((r, i) => <RelChip key={`f${i}`} rel={r} />)}
            <Chip
              size="small"
              label={`+${frequency.length - 2} more`}
              variant="outlined"
              onClick={() => setExpanded(true)}
              sx={{ fontSize: '0.63rem', height: 20, cursor: 'pointer', opacity: 0.7 }}
            />
          </>
        )
      }
    </Box>
  );
}

export default function ConnectRenderer({ content, compact }) {
  const data = fromEnvelope(content, 'CONNECT');
  const paths = data?.paths || [];
  const bundles = data?.bundles || {};
  const analysis = data?.structuralAnalysis;

  if (!paths.length) {
    return (
      <Typography color="text.secondary" variant="body2">
        No paths found between the entities.
      </Typography>
    );
  }

  const displayPaths = compact ? paths.slice(0, 2) : paths;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" label={`${paths.length} path${paths.length !== 1 ? 's' : ''}`} />
        {analysis?.connectionRobustness && (
          <Chip
            size="small"
            label={analysis.connectionRobustness}
            color={
              analysis.connectionRobustness === 'HIGH' ? 'success'
              : analysis.connectionRobustness === 'MODERATE' ? 'warning'
              : 'error'
            }
          />
        )}
        {analysis?.hasCriticalBottleneck && (
          <Chip size="small" label="⚠ bottleneck" color="warning" variant="outlined" />
        )}
      </Stack>

      {displayPaths.map((p, i) => (
        <Box key={i} sx={{ mb: 1.5, p: 1, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
            Path {i + 1} · {p.hopCount} hop{p.hopCount !== 1 ? 's' : ''}
            {p.pathStrength != null && ` · strength ${(p.pathStrength * 100).toFixed(0)}%`}
          </Typography>
          {(p.segments || []).map((seg, si) => {
            const nextSeg = p.segments[si + 1];
            const pairKey = nextSeg ? `${seg.id}|${nextSeg.id}` : null;
            const bundle = pairKey ? bundles[pairKey] : null;
            return (
              <Box key={si}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    label={seg.name || seg.id?.slice(0, 12)}
                    variant="outlined"
                    sx={{ fontSize: '0.68rem', height: 20, maxWidth: 140 }}
                    title={`${seg.type} · ${seg.id}`}
                  />
                  {pairKey && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mx: 0.5 }}>
                      {bundle && bundle.count > 0
                        ? <BundleDisplay bundle={bundle} />
                        : seg.edge?.relType
                          ? <Chip size="small" label={seg.edge.relType} sx={{ fontSize: '0.65rem', height: 18, opacity: 0.6 }} />
                          : <Typography variant="caption" color="text.disabled">—</Typography>
                      }
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>→</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      ))}

      {compact && paths.length > 2 && (
        <Typography variant="caption" color="text.secondary">+{paths.length - 2} more paths</Typography>
      )}

      {analysis?.summary && (
        <Box sx={{ mt: 1, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            {analysis.summary}
          </Typography>
        </Box>
      )}
      {data?.fromEntityId && data?.toEntityId && !compact && (
        <Box sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
          <EvidencePanel sourceId={data.fromEntityId} targetId={data.toEntityId} />
        </Box>
      )}
      {data?.evidentialLimitation && !data?.fromEntityId && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
          ℹ Edge provenance shows most recent source document only.
        </Typography>
      )}
    </Box>
  );
}
