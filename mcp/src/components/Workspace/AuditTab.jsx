import React, { useEffect } from 'react';
import { Box, Typography, Paper, Table, TableHead, TableBody, TableRow, TableCell, Chip } from '@mui/material';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const AuditTab = ({ workspaceId }) => {
  const { auditLog, fetchAuditLog } = useWorkspaceStore();

  useEffect(() => {
    if (workspaceId) fetchAuditLog(workspaceId, { limit: 100 });
  }, [workspaceId]);

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
        Read Audit Log ({auditLog.length} entries)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        All reads from Global KB are logged for security and traceability.
      </Typography>

      {auditLog.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No audit entries yet</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined" sx={{ overflow: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Timestamp</TableCell>
                <TableCell>Operation</TableCell>
                <TableCell>Results</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Flags</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditLog.map((entry, i) => (
                <TableRow key={entry.id || i} hover>
                  <TableCell>
                    <Typography variant="caption">{new Date(entry.timestamp).toLocaleString()}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={entry.operation}
                      size="small"
                      color={entry.operation === 'BLOCKED_WRITE' ? 'error' : 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>{entry.resultCount ?? '-'}</TableCell>
                  <TableCell>{entry.durationMs ? `${entry.durationMs}ms` : '-'}</TableCell>
                  <TableCell>
                    {entry.flags && (
                      Array.isArray(JSON.parse(entry.flags))
                        ? JSON.parse(entry.flags).map((f, j) => (
                            <Chip key={j} label={f} size="small" color={f === 'SECURITY_VIOLATION' ? 'error' : 'warning'} sx={{ mr: 0.5 }} />
                          ))
                        : null
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
};

export default AuditTab;
