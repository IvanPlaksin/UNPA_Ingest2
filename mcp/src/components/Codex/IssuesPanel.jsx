import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Chip, IconButton, Collapse
} from '@mui/material';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useKBIssues } from '../../hooks/useKBHealth';

const SEV = {
  error:   { color: 'error',   Icon: AlertCircle },
  warning: { color: 'warning', Icon: AlertTriangle },
  info:    { color: 'info',    Icon: Info }
};

function IssueRow({ issue }) {
  const [open, setOpen] = useState(false);
  const { color, Icon } = SEV[issue.severity] || SEV.info;
  const iconColor = color === 'error' ? '#f44336' : color === 'warning' ? '#ff9800' : '#2196f3';

  return (
    <Card sx={{ mb: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton size="small" onClick={() => setOpen(!open)}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </IconButton>
          <Icon size={18} color={iconColor} />
          <Typography variant="body2" sx={{ flex: 1 }}>{issue.message}</Typography>
          <Chip label={issue.type.replace(/_/g, ' ')} size="small" variant="outlined" sx={{ fontSize: 10 }} />
          <Chip label={issue.severity} size="small" color={color} sx={{ fontSize: 10 }} />
        </Box>
        <Collapse in={open}>
          <Box sx={{ mt: 1.5, pl: 5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {issue.nodeId && <Typography variant="caption" color="text.disabled"><b>Node:</b> {issue.nodeId}</Typography>}
            {issue.label && <Typography variant="caption" color="text.disabled"><b>Label:</b> {issue.label}</Typography>}
            {issue.suggestedAction && <Typography variant="caption" color="text.disabled"><b>Action:</b> {issue.suggestedAction}</Typography>}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

export default function IssuesPanel() {
  const { issues, loading, error, refetch } = useKBIssues();

  const counts = issues.reduce((a, i) => { a[i.severity] = (a[i.severity] || 0) + 1; return a; }, {});

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Issues ({issues.length})</Typography>
        <IconButton onClick={refetch} disabled={loading}><RefreshCw size={18} /></IconButton>
      </Box>

      {error && <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>}

      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {Object.entries(counts).map(([sev, n]) => (
          <Chip key={sev} label={`${n} ${sev}`} size="small" color={SEV[sev]?.color || 'default'} />
        ))}
      </Box>

      {issues.length === 0 ? (
        <Typography color="text.disabled" sx={{ textAlign: 'center', py: 4 }}>No issues detected</Typography>
      ) : (
        <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
          {issues.map((issue, i) => <IssueRow key={issue.nodeId || i} issue={issue} />)}
        </Box>
      )}
    </Box>
  );
}
