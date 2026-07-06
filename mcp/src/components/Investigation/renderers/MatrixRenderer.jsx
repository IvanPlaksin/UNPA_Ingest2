/**
 * MatrixRenderer — cross-tabulation table for MATRIX primitive results.
 *
 * Content shape:
 *   rowEntities: [{entityId, name, type}]
 *   colEntities: [{entityId, name, type}]
 *   cells: [{rowEntityId, colEntityId, directRel, relType, context, indirectPath, self}]
 *   summary: { totalCells, directConnections, indirectConnections, noConnection }
 */
import React, { useState } from 'react';
import {
  Box, Typography, Chip, Tooltip, Stack,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  Dialog, DialogTitle, DialogContent, IconButton,
} from '@mui/material';
import { X } from 'lucide-react';

function cellKey(rowId, colId) {
  return `${rowId}:${colId}`;
}

function buildCellMap(cells) {
  const map = {};
  for (const c of cells || []) {
    map[cellKey(c.rowEntityId, c.colEntityId)] = c;
  }
  return map;
}

function MatrixCellChip({ cell, onDetail }) {
  if (!cell) return <Typography color="text.disabled" sx={{ fontSize: '0.75rem' }}>—</Typography>;
  if (cell.self) {
    return (
      <Typography color="text.disabled" sx={{ fontSize: '0.7rem', opacity: 0.4 }}>◎</Typography>
    );
  }
  if (cell.directRel) {
    return (
      <Tooltip title={
        <Box>
          <Typography variant="caption" fontWeight={700}>{cell.relType || 'ES_RELATED_TO'}</Typography>
          {cell.context && (
            <Typography variant="caption" display="block" sx={{ fontStyle: 'italic', mt: 0.25 }}>
              "{cell.context.slice(0, 120)}"
            </Typography>
          )}
        </Box>
      } arrow>
        <Chip
          label="✓"
          size="small"
          color="success"
          onClick={() => onDetail(cell)}
          sx={{ height: 20, fontSize: '0.68rem', cursor: 'pointer' }}
        />
      </Tooltip>
    );
  }
  if (cell.indirectPath) {
    return (
      <Tooltip title="Indirect connection (path length 2)" arrow>
        <Chip
          label="⤳"
          size="small"
          variant="outlined"
          onClick={() => onDetail(cell)}
          sx={{ height: 20, fontSize: '0.68rem', cursor: 'pointer', color: 'text.secondary' }}
        />
      </Tooltip>
    );
  }
  return <Typography color="text.disabled" sx={{ fontSize: '0.75rem' }}>✗</Typography>;
}

export default function MatrixRenderer({ content, compact }) {
  const [detail, setDetail] = useState(null);

  if (!content?.rowEntities?.length) {
    return <Typography color="text.secondary" variant="body2">No matrix data.</Typography>;
  }

  const { rowEntities, colEntities, cells, summary } = content;
  const cellMap = buildCellMap(cells);

  const displayRows = compact ? rowEntities.slice(0, 4) : rowEntities;
  const displayCols = compact ? colEntities.slice(0, 4) : colEntities;

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
        <Chip size="small" label={`${summary?.directConnections || 0} direct ✓`} color="success" variant="outlined" />
        <Chip size="small" label={`${summary?.indirectConnections || 0} indirect ⤳`} variant="outlined" />
        <Chip size="small" label={`${summary?.noConnection || 0} none ✗`} variant="outlined" />
      </Stack>

      <TableContainer sx={{ maxWidth: '100%', overflowX: 'auto' }}>
        <Table size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 110, fontWeight: 700, fontSize: '0.7rem', p: 0.5 }} />
              {displayCols.map(col => (
                <TableCell key={col.entityId} align="center" sx={{ p: 0.5 }}>
                  <Tooltip title={`${col.type} · ${col.entityId}`} arrow>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, fontSize: '0.65rem', display: 'block', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {col.name || col.entityId?.slice(0, 12)}
                    </Typography>
                  </Tooltip>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {displayRows.map(row => (
              <TableRow key={row.entityId}>
                <TableCell sx={{ p: 0.5 }}>
                  <Tooltip title={`${row.type} · ${row.entityId}`} arrow>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 600, fontSize: '0.68rem', display: 'block', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {row.name || row.entityId?.slice(0, 12)}
                    </Typography>
                  </Tooltip>
                </TableCell>
                {displayCols.map(col => (
                  <TableCell key={col.entityId} align="center" sx={{ p: 0.5 }}>
                    <MatrixCellChip
                      cell={cellMap[cellKey(row.entityId, col.entityId)]}
                      onDetail={setDetail}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {compact && (rowEntities.length > 4 || colEntities.length > 4) && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          Showing {displayRows.length}×{displayCols.length} of {rowEntities.length}×{colEntities.length}
        </Typography>
      )}

      {/* Cell detail dialog */}
      {detail && (
        <Dialog open onClose={() => setDetail(null)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ pb: 0.5 }}>
            <Stack direction="row" alignItems="center">
              <Typography variant="subtitle2" sx={{ flex: 1 }}>Connection Detail</Typography>
              <IconButton size="small" onClick={() => setDetail(null)}><X size={14} /></IconButton>
            </Stack>
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2"><strong>Type:</strong> {detail.relType || 'ES_RELATED_TO'}</Typography>
            {detail.context && (
              <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                "{detail.context}"
              </Typography>
            )}
            {detail.indirectPath && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Indirect connection (path length 2 — no direct edge).
              </Typography>
            )}
          </DialogContent>
        </Dialog>
      )}
    </Box>
  );
}
