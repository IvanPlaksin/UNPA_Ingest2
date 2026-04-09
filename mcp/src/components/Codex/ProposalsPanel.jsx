import React, { useState } from 'react';
import {
  Box, Card, CardContent, Typography, Chip, IconButton,
  Tabs, Tab, Badge, Button, TextField, Dialog, DialogTitle, DialogContent, DialogActions,
  Divider, Stack, Tooltip, Alert, LinearProgress
} from '@mui/material';
import {
  Check, X, Play, ChevronRight, Radar, Shield, ShieldCheck, ShieldAlert, Users,
  Clock, AlertTriangle, Info, FileText, Tag, Zap, ExternalLink, CheckCircle, XCircle, Timer,
  Merge, Trash2, Eye, ArrowRight, Search
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';
import { useProposals } from '../../hooks/useMetacognition';

const api = axios.create({ baseURL: API_BASE_URL });

const LEVEL_CFG = {
  L0: { label: 'Auto',           color: '#4caf50', Icon: Check,       desc: 'Fully automatic — no approval required' },
  L1: { label: 'Audit',          color: '#8bc34a', Icon: Shield,      desc: 'Auto-executed with audit trail' },
  L2: { label: 'Review',         color: '#ff9800', Icon: ShieldCheck, desc: 'Single human review required' },
  L3: { label: 'Expert',         color: '#f44336', Icon: ShieldAlert, desc: 'Expert-level review required' },
  L4: { label: 'Dual Approval',  color: '#9c27b0', Icon: Users,       desc: 'Two independent approvals required' }
};

const SEVERITY_CFG = {
  error:   { color: '#f44336', Icon: XCircle,       label: 'Error' },
  warning: { color: '#ff9800', Icon: AlertTriangle,  label: 'Warning' },
  info:    { color: '#2196f3', Icon: Info,           label: 'Info' }
};

const STATUS_COLOR = {
  PENDING:          'warning',
  AUTO_APPROVED:    'success',
  APPROVED:         'success',
  EXECUTED:         'info',
  REJECTED:         'error',
  EXECUTION_FAILED: 'error'
};

const STATUS_TABS = [
  { value: '',              label: 'All' },
  { value: 'PENDING',       label: 'Pending' },
  { value: 'AUTO_APPROVED', label: 'Auto' },
  { value: 'APPROVED',      label: 'Approved' },
  { value: 'EXECUTED',      label: 'Executed' },
  { value: 'REJECTED',      label: 'Rejected' }
];

/* ── Detail field row ─────────────────────────────────────────────── */
function Field({ icon: Icon, label, children, mono }) {
  if (!children) return null;
  return (
    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
      <Icon size={15} style={{ marginTop: 3, flexShrink: 0, opacity: 0.5 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', lineHeight: 1.2 }}>{label}</Typography>
        <Typography variant="body2" sx={{ wordBreak: 'break-word', ...(mono && { fontFamily: 'monospace', fontSize: 12 }) }}>
          {children}
        </Typography>
      </Box>
    </Box>
  );
}

/* ── Manual Action Panel (requires_manual proposals) ──────────────── */
const MANUAL_ACTIONS = {
  merge_duplicates: {
    title: 'Duplicate Nodes Detected',
    description: 'Two nodes with the same name and label exist in the graph. Review both nodes and decide which to keep.',
    actions: [
      { key: 'inspect',    label: 'Inspect Primary Node',   icon: Eye,       color: 'info' },
      { key: 'inspect_dup', label: 'Inspect Duplicate Node', icon: Search,    color: 'info' },
      { key: 'merge',      label: 'Merge Nodes',            icon: Merge,     color: 'warning' },
      { key: 'delete_dup', label: 'Delete Duplicate',       icon: Trash2,    color: 'error' },
      { key: 'dismiss',    label: 'Dismiss (Not a Duplicate)', icon: X,      color: 'default' },
    ]
  }
};

function ManualActionPanel({ proposal: p, onClose }) {
  const navigate = useNavigate();
  const [acting, setActing] = useState(false);
  const [actionResult, setActionResult] = useState(null);

  const result = p.executionResult || {};
  const actionCfg = MANUAL_ACTIONS[result.action] || {
    title: 'Manual Action Required',
    description: result.summary || 'This action cannot be automated and requires manual intervention.',
    actions: [
      { key: 'inspect', label: 'Inspect Node', icon: Eye, color: 'info' },
    ]
  };

  const handleAction = async (actionKey) => {
    const nodeId = result.nodeId || p.issue?.nodeId;
    const duplicateId = result.duplicateId || p.issue?.duplicateId;

    switch (actionKey) {
      case 'inspect':
        if (nodeId) { onClose(); navigate(`/nexus/${nodeId}`); }
        return;
      case 'inspect_dup':
        if (duplicateId) { onClose(); navigate(`/nexus/${duplicateId}`); }
        return;
      case 'merge':
        if (!nodeId || !duplicateId) return;
        setActing(true);
        try {
          const { data } = await api.post('/immutable-graph/nodes/merge', {
            sourceId: duplicateId,
            targetId: nodeId,
            strategy: 'keep_target'
          });
          setActionResult({ success: true, message: `Nodes merged successfully. Kept "${result.nodeName || nodeId}".`, data });
        } catch (err) {
          setActionResult({ success: false, message: err.response?.data?.error || err.message });
        } finally { setActing(false); }
        return;
      case 'delete_dup':
        if (!duplicateId) return;
        setActing(true);
        try {
          const { data } = await api.delete(`/immutable-graph/nodes/${duplicateId}`);
          setActionResult({ success: true, message: `Duplicate node "${duplicateId}" deleted.`, data });
        } catch (err) {
          setActionResult({ success: false, message: err.response?.data?.error || err.message });
        } finally { setActing(false); }
        return;
      case 'dismiss':
        setActionResult({ success: true, message: 'Marked as dismissed — not a real duplicate.' });
        return;
      default:
        return;
    }
  };

  return (
    <Box sx={{ mt: 0.5, p: 2, border: 1, borderColor: 'warning.main', borderRadius: 1, bgcolor: 'warning.main', backgroundImage: 'none',
      backgroundColor: 'rgba(255, 152, 0, 0.04)' }}>
      {acting && <LinearProgress sx={{ mb: 1 }} />}
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AlertTriangle size={16} color="#ff9800" /> {actionCfg.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        {actionCfg.description}
      </Typography>

      {/* Node references */}
      {(result.nodeName || result.nodeId) && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <Chip size="small" label={`Primary: ${result.nodeName || result.nodeId}`} variant="outlined" sx={{ fontSize: 11 }}
            icon={<Tag size={12} />} />
          {result.duplicateId && (
            <Chip size="small" label={`Duplicate: ${result.duplicateId?.slice(0, 12)}...`} variant="outlined" color="warning" sx={{ fontSize: 11 }}
              icon={<Tag size={12} />} />
          )}
        </Box>
      )}

      {/* Action buttons */}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
        {actionCfg.actions.map(a => {
          const ActionIcon = a.icon;
          const disabled = acting ||
            (a.key === 'inspect' && !result.nodeId && !p.issue?.nodeId) ||
            (a.key === 'inspect_dup' && !result.duplicateId && !p.issue?.duplicateId) ||
            (a.key === 'merge' && (!result.nodeId || !result.duplicateId)) ||
            (a.key === 'delete_dup' && !result.duplicateId);
          return (
            <Button key={a.key} size="small" variant="outlined" color={a.color}
              startIcon={<ActionIcon size={14} />} disabled={disabled}
              onClick={() => handleAction(a.key)} sx={{ textTransform: 'none', fontSize: 12 }}>
              {a.label}
            </Button>
          );
        })}
      </Stack>

      {/* Action result feedback */}
      {actionResult && (
        <Alert severity={actionResult.success ? 'success' : 'error'} variant="outlined" sx={{ mt: 1.5, fontSize: 12 }}>
          {actionResult.message}
        </Alert>
      )}
    </Box>
  );
}

/* ── Proposal Detail Dialog ───────────────────────────────────────── */
function ProposalDetailDialog({ proposal: p, open, onClose, onApprove, onReject, onExecute }) {
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  if (!p) return null;

  const cfg = LEVEL_CFG[p.autonomyLevel] || LEVEL_CFG.L2;
  const LevelIcon = cfg.Icon;
  const sev = SEVERITY_CFG[p.issue?.severity] || SEVERITY_CFG.info;
  const SevIcon = sev.Icon;
  const canApprove = p.status === 'PENDING';
  const canExecute = p.status === 'APPROVED' || p.status === 'AUTO_APPROVED';
  const isTerminal = p.status === 'EXECUTED' || p.status === 'REJECTED' || p.status === 'EXECUTION_FAILED';

  const handleAction = async (fn, ...args) => {
    setActing(true);
    try { await fn(...args); onClose(); }
    finally { setActing(false); }
  };

  const slaDeadline = p.slaHours && p.createdAt
    ? new Date(new Date(p.createdAt).getTime() + p.slaHours * 3600000)
    : null;
  const slaOverdue = slaDeadline && slaDeadline < new Date() && !isTerminal;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderTop: `3px solid ${cfg.color}` } }}>
      {acting && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0 }} />}

      <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <LevelIcon size={22} color={cfg.color} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
            {p.issue?.message || p.issue?.type || 'Proposal'}
          </Typography>
          <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace' }}>{p.id}</Typography>
        </Box>
        <Chip label={p.status.replace('_', ' ')} size="small" color={STATUS_COLOR[p.status] || 'default'} />
      </DialogTitle>

      <DialogContent dividers sx={{ py: 2 }}>
        <Stack spacing={2}>
          {/* ── Issue Details ── */}
          <Box>
            <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1.5 }}>Issue</Typography>
            <Stack spacing={1.5} sx={{ mt: 0.5 }}>
              <Field icon={FileText} label="Type">
                <Chip label={p.issue?.type} size="small" variant="outlined" sx={{ fontSize: 11, height: 22 }} />
              </Field>
              <Field icon={SevIcon} label="Severity">
                <Chip label={sev.label} size="small" sx={{ bgcolor: `${sev.color}18`, color: sev.color, fontSize: 11, height: 22 }} />
              </Field>
              {p.issue?.nodeId && (
                <Field icon={ExternalLink} label="Node ID" mono>{p.issue.nodeId}</Field>
              )}
              {p.issue?.label && (
                <Field icon={Tag} label="Node Label">{p.issue.label}</Field>
              )}
              {p.issue?.name && (
                <Field icon={Tag} label="Node Name">{p.issue.name}</Field>
              )}
            </Stack>
          </Box>

          <Divider />

          {/* ── Autonomy & Governance ── */}
          <Box>
            <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1.5 }}>Governance</Typography>
            <Stack spacing={1.5} sx={{ mt: 0.5 }}>
              <Field icon={LevelIcon} label="Autonomy Level">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={`${p.autonomyLevel} — ${cfg.label}`} size="small"
                    sx={{ bgcolor: `${cfg.color}18`, color: cfg.color, fontWeight: 600, fontSize: 11, height: 22 }} />
                </Box>
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.3 }}>{cfg.desc}</Typography>
              </Field>
              {p.approvalRequired != null && (
                <Field icon={ShieldCheck} label="Approval Required">{p.approvalRequired ? 'Yes' : 'No'}</Field>
              )}
              {p.dualApproval && (
                <Field icon={Users} label="Dual Approval">Required (2 independent approvers)</Field>
              )}
              {p.issue?.suggestedAction && (
                <Field icon={Zap} label="Suggested Action">
                  <Chip label={p.issue.suggestedAction.replace(/_/g, ' ')} size="small"
                    variant="outlined" color="primary" sx={{ fontSize: 11, height: 22 }} />
                </Field>
              )}
            </Stack>
          </Box>

          <Divider />

          {/* ── Timeline ── */}
          <Box>
            <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1.5 }}>Timeline</Typography>
            <Stack spacing={1.5} sx={{ mt: 0.5 }}>
              <Field icon={Clock} label="Created">{new Date(p.createdAt).toLocaleString()}</Field>
              {p.slaHours != null && (
                <Field icon={Timer} label="SLA">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{p.slaHours}h</span>
                    {slaDeadline && (
                      <Typography variant="caption" color={slaOverdue ? 'error' : 'text.disabled'}>
                        (deadline: {slaDeadline.toLocaleString()})
                      </Typography>
                    )}
                  </Box>
                </Field>
              )}
              {slaOverdue && (
                <Alert severity="warning" variant="outlined" sx={{ py: 0, fontSize: 12 }}>
                  SLA overdue — action required
                </Alert>
              )}
              {p.executedAt && (
                <Field icon={Play} label="Executed">{new Date(p.executedAt).toLocaleString()}</Field>
              )}
            </Stack>
          </Box>

          {/* ── Approvals History ── */}
          {p.approvals?.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1.5 }}>Approvals</Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {p.approvals.map((a, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <CheckCircle size={14} color="#4caf50" />
                      <Typography variant="body2">{a.approver}</Typography>
                      <Typography variant="caption" color="text.disabled">{new Date(a.at).toLocaleString()}</Typography>
                    </Box>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* ── Rejections History ── */}
          {p.rejections?.length > 0 && (
            <>
              <Divider />
              <Box>
                <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1.5 }}>Rejections</Typography>
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {p.rejections.map((r, i) => (
                    <Box key={i}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <XCircle size={14} color="#f44336" />
                        <Typography variant="body2">{r.rejector}</Typography>
                        <Typography variant="caption" color="text.disabled">{new Date(r.at).toLocaleString()}</Typography>
                      </Box>
                      {r.reason && <Typography variant="caption" color="text.disabled" sx={{ pl: 3 }}>{r.reason}</Typography>}
                    </Box>
                  ))}
                </Stack>
              </Box>
            </>
          )}

          {/* ── Execution Result ── */}
          {(p.executionResult || p.executionError) && (
            <>
              <Divider />
              <Box>
                <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1.5 }}>Execution Result</Typography>
                {p.executionError && (
                  <Alert severity="error" variant="outlined" sx={{ mt: 0.5, fontSize: 12 }}>{p.executionError}</Alert>
                )}
                {p.executionResult && (
                  <Stack spacing={1.5} sx={{ mt: 0.5 }}>
                    {/* Summary */}
                    {p.executionResult.summary && (
                      <Alert severity={p.executionResult.verified === false ? 'warning' : 'success'} variant="outlined" sx={{ fontSize: 12 }}>
                        {p.executionResult.summary}
                      </Alert>
                    )}
                    {/* Structured fields */}
                    <Field icon={Zap} label="Action">
                      <Chip label={p.executionResult.action?.replace(/_/g, ' ')} size="small" variant="outlined" color="primary" sx={{ fontSize: 11, height: 22 }} />
                    </Field>
                    {p.executionResult.nodeName && (
                      <Field icon={Tag} label="Target Node">{p.executionResult.nodeName} ({p.executionResult.nodeLabel || ''})</Field>
                    )}
                    {p.executionResult.fromName && p.executionResult.toName && (
                      <Field icon={ExternalLink} label="Edge Created">{p.executionResult.fromName} → {p.executionResult.toName}</Field>
                    )}
                    {p.executionResult.mappingRule && (
                      <Field icon={FileText} label="Mapping Rule" mono>{p.executionResult.mappingRule}</Field>
                    )}
                    {p.executionResult.changes && (
                      <Field icon={FileText} label="Changes Applied" mono>{JSON.stringify(p.executionResult.changes, null, 2)}</Field>
                    )}
                    {p.executionResult.verified != null && (
                      <Field icon={p.executionResult.verified ? CheckCircle : AlertTriangle} label="Verified">
                        <Chip label={p.executionResult.verified ? 'Confirmed' : 'Unverified'} size="small"
                          sx={{ bgcolor: p.executionResult.verified ? '#4caf5018' : '#ff980018',
                            color: p.executionResult.verified ? '#4caf50' : '#ff9800', fontSize: 11, height: 22 }} />
                      </Field>
                    )}
                    {p.executionResult.status === 'requires_manual' && (
                      <ManualActionPanel proposal={p} onClose={onClose} />
                    )}
                  </Stack>
                )}
              </Box>
            </>
          )}

          {/* ── Inline Reject Form ── */}
          {rejectMode && (
            <>
              <Divider />
              <Box>
                <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1.5 }}>Reject Reason</Typography>
                <TextField autoFocus fullWidth multiline rows={3} size="small" placeholder="Explain why this proposal should be rejected..."
                  value={reason} onChange={e => setReason(e.target.value)} sx={{ mt: 0.5 }} />
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {rejectMode ? (
          <>
            <Button onClick={() => { setRejectMode(false); setReason(''); }}>Cancel</Button>
            <Button color="error" variant="contained" disabled={!reason.trim() || acting}
              onClick={() => handleAction(onReject, p.id, 'user', reason)}>
              Confirm Reject
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onClose}>Close</Button>
            <Box sx={{ flex: 1 }} />
            {canApprove && (
              <>
                <Button color="error" variant="outlined" startIcon={<X size={15} />} disabled={acting}
                  onClick={() => setRejectMode(true)}>
                  Reject
                </Button>
                <Button color="success" variant="contained" startIcon={<Check size={15} />} disabled={acting}
                  onClick={() => handleAction(onApprove, p.id)}>
                  Approve
                </Button>
              </>
            )}
            {canExecute && (
              <Button color="primary" variant="contained" startIcon={<Play size={15} />} disabled={acting}
                onClick={() => handleAction(onExecute, p.id)}>
                Execute
              </Button>
            )}
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

/* ── Proposal Card (list item) ────────────────────────────────────── */
function ProposalCard({ p, onClick }) {
  const cfg = LEVEL_CFG[p.autonomyLevel] || LEVEL_CFG.L2;
  const LevelIcon = cfg.Icon;

  return (
    <Card
      sx={{ mb: 1, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderLeft: `3px solid ${cfg.color}`,
        cursor: 'pointer', transition: 'box-shadow 0.15s', '&:hover': { boxShadow: 3, borderColor: cfg.color } }}
      onClick={() => onClick(p)}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LevelIcon size={18} color={cfg.color} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" noWrap>{p.issue?.message || p.issue?.type}</Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace' }}>{p.id}</Typography>
          </Box>
          <Chip label={p.autonomyLevel} size="small" sx={{ bgcolor: `${cfg.color}20`, color: cfg.color, fontWeight: 'bold' }} />
          <Chip label={p.status.replace('_', ' ')} size="small" color={STATUS_COLOR[p.status] || 'default'} sx={{ fontSize: 10 }} />
          <Tooltip title="Open details">
            <ChevronRight size={16} style={{ opacity: 0.4, flexShrink: 0 }} />
          </Tooltip>
        </Box>
      </CardContent>
    </Card>
  );
}

/* ── Main Panel ───────────────────────────────────────────────────── */
export default function ProposalsPanel() {
  const [tab, setTab] = useState('');
  const [selected, setSelected] = useState(null);
  const { proposals, loading, approve, reject, execute, runDetection } = useProposals(tab || undefined);

  const pendingCount = proposals.filter(p => p.status === 'PENDING').length;

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Proposals</Typography>
        <Button size="small" variant="outlined" startIcon={<Radar size={16} />} onClick={runDetection}>
          Run Detection
        </Button>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        {STATUS_TABS.map(t => (
          <Tab key={t.value} value={t.value} label={
            t.value === 'PENDING' ? <Badge badgeContent={pendingCount} color="warning">{t.label}</Badge> : t.label
          } sx={{ textTransform: 'none', minHeight: 36 }} />
        ))}
      </Tabs>

      {proposals.length === 0 ? (
        <Typography color="text.disabled" sx={{ textAlign: 'center', py: 4 }}>No proposals</Typography>
      ) : (
        <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
          {proposals.map(p => (
            <ProposalCard key={p.id} p={p} onClick={setSelected} />
          ))}
        </Box>
      )}

      <ProposalDetailDialog
        proposal={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        onApprove={approve}
        onReject={reject}
        onExecute={execute}
      />
    </Box>
  );
}
