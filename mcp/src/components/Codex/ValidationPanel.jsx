/**
 * ValidationPanel — Codex compliance validation dashboard
 * Score ring + summary cards + violations table + run button
 */
import React, { useState, useMemo } from 'react';
import {
  Box, Typography, Chip, Card, CardContent, Button, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButtonGroup, ToggleButton, TextField, InputAdornment, IconButton
} from '@mui/material';
import { ShieldCheck, AlertTriangle, AlertCircle, Info, Play, Search, X, RefreshCw, FileCheck, Wand2, ArrowRight } from 'lucide-react';
import { useValidationReport, useRunValidation, useValidationHistory, useValidationIssues } from '../../hooks/useValidation';

// ── Score Ring ───────────────────────────────────────────
function ScoreRing({ score, size = 100 }) {
  const s = score ?? 0;
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (s / 100) * circumference;
  const color = s >= 70 ? '#4caf50' : s >= 40 ? '#ff9800' : '#f44336';

  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={8}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{s}</Typography>
        <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>/ 100</Typography>
      </Box>
    </Box>
  );
}

// ── Summary Card ─────────────────────────────────────────
function SummaryCard({ count, label, icon: Icon, color, bgColor }) {
  return (
    <Card sx={{ bgcolor: bgColor, border: `1px solid ${color}22`, flex: 1 }}>
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
        <Icon size={18} style={{ color, marginBottom: 4 }} />
        <Typography sx={{ fontSize: 24, fontWeight: 700, color, lineHeight: 1.2 }}>{count}</Typography>
        <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>{label}</Typography>
      </CardContent>
    </Card>
  );
}

// ── Severity Badge ───────────────────────────────────────
const SEV = {
  error:   { color: '#f44336', bg: '#ffebee', icon: AlertCircle, label: 'ERROR' },
  warning: { color: '#ff9800', bg: '#fff3e0', icon: AlertTriangle, label: 'WARN' },
  info:    { color: '#2196f3', bg: '#e3f2fd', icon: Info, label: 'INFO' },
};

function SeverityBadge({ severity }) {
  const s = SEV[severity] || SEV.info;
  return (
    <Chip icon={<s.icon size={12} />} label={s.label} size="small"
      sx={{ height: 20, fontSize: '9px', fontWeight: 700, bgcolor: s.bg, color: s.color, '& .MuiChip-icon': { color: s.color } }} />
  );
}

// ── History Sparkline (simple SVG) ───────────────────────
function HistorySparkline({ history }) {
  if (!history.length) return null;
  const scores = history.map(h => h.score ?? 0).reverse();
  const max = 100;
  const w = 200, h = 40;
  const step = w / Math.max(scores.length - 1, 1);
  const points = scores.map((s, i) => `${i * step},${h - (s / max) * h}`).join(' ');

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>History:</Typography>
      <svg width={w} height={h} style={{ overflow: 'visible' }}>
        <polyline points={points} fill="none" stroke="#4fd1c5" strokeWidth={1.5} />
        {scores.map((s, i) => (
          <circle key={i} cx={i * step} cy={h - (s / max) * h} r={2.5} fill="#4fd1c5" />
        ))}
      </svg>
    </Box>
  );
}

// ── Main Panel ───────────────────────────────────────────
export default function ValidationPanel() {
  const { report, loading: reportLoading, refetch } = useValidationReport();
  const { run, running } = useRunValidation();
  const { history } = useValidationHistory(10);
  const { summary: issueSummary, syncIssues, createProposal, autoFix } = useValidationIssues();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [autoFixing, setAutoFixing] = useState(false);

  const handleRun = async () => {
    await run({ includeInfo: true });
    refetch();
  };

  const handleSyncIssues = async () => {
    setSyncing(true);
    await syncIssues();
    setSyncing(false);
  };

  const handleAutoFix = async () => {
    setAutoFixing(true);
    await autoFix();
    setAutoFixing(false);
  };

  const handleCreateProposal = async (issueId) => {
    await createProposal(issueId);
  };

  const summary = report?.summary || { total: 0, bySeverity: { error: 0, warning: 0, info: 0 } };
  const score = report?.complianceScore ?? null;

  // Filter violations
  const violations = useMemo(() => {
    let v = report?.violations || [];
    if (severityFilter !== 'all') v = v.filter(vi => vi.severity === severityFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      v = v.filter(vi =>
        (vi.nodeId || '').toLowerCase().includes(q) ||
        (vi.message || '').toLowerCase().includes(q) ||
        (vi.checkName || '').toLowerCase().includes(q)
      );
    }
    return v;
  }, [report, severityFilter, searchQuery]);

  if (reportLoading && !report) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress size={28} /></Box>;
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header: Score + Summary + Controls */}
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {/* Score Ring */}
          <ScoreRing score={score} size={90} />

          {/* Summary Cards */}
          <Box sx={{ display: 'flex', gap: 1.5, flex: 1 }}>
            <SummaryCard count={summary.bySeverity.error || 0} label="Errors" icon={AlertCircle} color="#f44336" bgColor="#ffebee08" />
            <SummaryCard count={summary.bySeverity.warning || 0} label="Warnings" icon={AlertTriangle} color="#ff9800" bgColor="#fff3e008" />
            <SummaryCard count={summary.bySeverity.info || 0} label="Info" icon={Info} color="#2196f3" bgColor="#e3f2fd08" />
          </Box>

          {/* Controls */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, alignItems: 'flex-end' }}>
            <Button
              variant="contained" size="small"
              startIcon={running ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />}
              onClick={handleRun} disabled={running}
              sx={{ textTransform: 'none', bgcolor: '#4fd1c5', '&:hover': { bgcolor: '#38b2ac' }, fontSize: '12px' }}
            >
              {running ? 'Running...' : 'Run Validation'}
            </Button>
            <Button
              variant="outlined" size="small"
              startIcon={syncing ? <CircularProgress size={14} /> : <ArrowRight size={14} />}
              onClick={handleSyncIssues} disabled={syncing || !report}
              sx={{ textTransform: 'none', fontSize: '11px' }}
            >
              {syncing ? 'Syncing...' : 'Sync → Issues'}
            </Button>
            <Button
              variant="outlined" size="small" color="success"
              startIcon={autoFixing ? <CircularProgress size={14} /> : <Wand2 size={14} />}
              onClick={handleAutoFix} disabled={autoFixing || !issueSummary?.autoFixable}
              sx={{ textTransform: 'none', fontSize: '11px' }}
            >
              Auto-fix ({issueSummary?.autoFixable || 0})
            </Button>
            {report && (
              <Box>
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                  {report.duration}ms · {report.checksRun} checks
                </Typography>
                <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>
                  {new Date(report.timestamp).toLocaleString()}
                </Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* History sparkline */}
        {history.length > 1 && (
          <Box sx={{ mt: 1.5 }}>
            <HistorySparkline history={history} />
          </Box>
        )}
      </Box>

      {/* Filters */}
      <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <ToggleButtonGroup value={severityFilter} exclusive onChange={(_, v) => v && setSeverityFilter(v)} size="small">
          <ToggleButton value="all" sx={{ fontSize: '11px', py: 0.25 }}>All ({summary.total})</ToggleButton>
          <ToggleButton value="error" sx={{ fontSize: '11px', py: 0.25, color: '#f44336' }}>Errors ({summary.bySeverity.error || 0})</ToggleButton>
          <ToggleButton value="warning" sx={{ fontSize: '11px', py: 0.25, color: '#ff9800' }}>Warn ({summary.bySeverity.warning || 0})</ToggleButton>
          <ToggleButton value="info" sx={{ fontSize: '11px', py: 0.25, color: '#2196f3' }}>Info ({summary.bySeverity.info || 0})</ToggleButton>
        </ToggleButtonGroup>

        <TextField
          size="small" placeholder="Search violations..."
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}><X size={12} /></IconButton>
              </InputAdornment>
            ),
            sx: { fontSize: '12px', height: 30 }
          }}
          sx={{ flex: 1, maxWidth: 300 }}
        />

        <Typography sx={{ fontSize: 13, color: 'text.disabled', ml: 'auto' }}>
          {violations.length} violations shown
        </Typography>
      </Box>

      {/* Violations Table */}
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        {!report ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.disabled' }}>
            <ShieldCheck size={40} style={{ opacity: 0.3, marginBottom: 12 }} />
            <Typography variant="body2">No validation report yet</Typography>
            <Typography variant="caption">Click "Run Validation" to check KB compliance</Typography>
          </Box>
        ) : (
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 80, fontSize: '11px', fontWeight: 600 }}>Severity</TableCell>
                <TableCell sx={{ width: 180, fontSize: '11px', fontWeight: 600 }}>Check</TableCell>
                <TableCell sx={{ width: 120, fontSize: '11px', fontWeight: 600 }}>Node</TableCell>
                <TableCell sx={{ width: 80, fontSize: '11px', fontWeight: 600 }}>Label</TableCell>
                <TableCell sx={{ fontSize: '11px', fontWeight: 600 }}>Message</TableCell>
                <TableCell sx={{ width: 40, fontSize: '11px', fontWeight: 600 }}>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {violations.slice(0, 200).map((v, i) => (
                <TableRow key={i} hover sx={{ '&:hover': { bgcolor: 'rgba(79,209,197,0.05)' } }}>
                  <TableCell><SeverityBadge severity={v.severity} /></TableCell>
                  <TableCell sx={{ fontSize: '11px' }}>{v.checkName}</TableCell>
                  <TableCell sx={{ fontSize: '11px', fontFamily: 'monospace' }}>{String(v.nodeId).slice(0, 20)}</TableCell>
                  <TableCell><Chip label={v.label || '—'} size="small" sx={{ height: 18, fontSize: '9px' }} /></TableCell>
                  <TableCell sx={{ fontSize: '11px', color: 'text.secondary' }}>{v.message}</TableCell>
                  <TableCell>
                    <IconButton size="small" title="Create Proposal"
                      onClick={() => handleCreateProposal(`issue-val-${v.nodeId?.toString().slice(0,8) || i}`)}>
                      <FileCheck size={14} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>
    </Box>
  );
}
