/**
 * StructureRenderer — metrics table for STRUCTURE primitive results.
 *
 * Content shape:
 *   nodes:   [{entityId, name, type, degree, inDegree, outDegree}]
 *   edges:   [{sourceId, targetId, relType}]
 *   metrics: [{entityId, name, degree, betweennessProxy, isBridge}]
 *   bridges: [{sourceId, targetId, relType}]
 *   summary: { nodeCount, edgeCount, bridgeCount, mostCentral: {entityId, name, degree} }
 */
import React from 'react';
import {
  Box, Typography, Chip, Stack,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
} from '@mui/material';
import { fromEnvelope } from './envelope-compat';

export default function StructureRenderer({ content, compact }) {
  const data = fromEnvelope(content, 'STRUCTURE');
  if (!data?.metrics?.length) {
    return <Typography color="text.secondary" variant="body2">No structural data.</Typography>;
  }

  const { metrics, bridges, summary } = data;
  const mostCentralId = summary?.mostCentral?.entityId;
  const bridgeNodeIds = new Set(
    (bridges || []).flatMap(b => [b.sourceId, b.targetId])
  );

  const displayMetrics = compact
    ? metrics.slice(0, 5)
    : metrics.slice(0, 30);

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" label={`${summary?.nodeCount || 0} nodes`} variant="outlined" />
        <Chip size="small" label={`${summary?.edgeCount || 0} edges`} variant="outlined" />
        {summary?.bridgeCount > 0 && (
          <Chip size="small" label={`${summary.bridgeCount} bridge${summary.bridgeCount !== 1 ? 's' : ''}`} color="warning" variant="outlined" />
        )}
        {summary?.mostCentral && (
          <Chip
            size="small"
            label={`Central: ${summary.mostCentral.name} (deg ${summary.mostCentral.degree})`}
            color="primary"
            variant="outlined"
          />
        )}
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', p: 0.75 }}>Entity</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem', p: 0.75 }}>Degree</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.7rem', p: 0.75 }}>Centrality</TableCell>
              <TableCell sx={{ fontWeight: 700, fontSize: '0.7rem', p: 0.75 }}>Role</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {displayMetrics.map(m => (
              <TableRow key={m.entityId}>
                <TableCell sx={{ p: 0.75 }}>
                  <Typography
                    variant="caption"
                    sx={{ fontSize: '0.72rem', maxWidth: 160, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={m.name}
                  >
                    {m.name}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ p: 0.75 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>{m.degree}</Typography>
                </TableCell>
                <TableCell align="right" sx={{ p: 0.75 }}>
                  <Typography variant="caption" sx={{ fontSize: '0.72rem' }}>
                    {(m.betweennessProxy || 0).toFixed(2)}
                  </Typography>
                </TableCell>
                <TableCell sx={{ p: 0.75 }}>
                  <Stack direction="row" spacing={0.4} flexWrap="wrap">
                    {m.entityId === mostCentralId && (
                      <Chip label="Central" size="small" color="primary" sx={{ height: 16, fontSize: '0.58rem' }} />
                    )}
                    {(m.isBridge || bridgeNodeIds.has(m.entityId)) && (
                      <Chip label="Bridge" size="small" color="warning" sx={{ height: 16, fontSize: '0.58rem' }} />
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {metrics.length > displayMetrics.length && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          +{metrics.length - displayMetrics.length} more entities
        </Typography>
      )}
    </Box>
  );
}
