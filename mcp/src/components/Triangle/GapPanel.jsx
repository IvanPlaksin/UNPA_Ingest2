/**
 * GapPanel — Knowledge Gap detail and management
 *
 * Displays full gap details and allows status transitions:
 *   OPEN → ACKNOWLEDGED → ADDRESSED → CLOSED
 *
 * Features:
 *   - Status radio buttons (visual flow)
 *   - Gap metadata: type, severity, age, stale warning
 *   - Source document and affected process links
 *   - Recommendation text
 *   - Resolution notes textarea
 *   - Action buttons: Update Status, Close Gap
 *   - Stale threshold warning (> 90 days)
 *
 * Props:
 *   gap            { id, gapType, severity, status, title, description,
 *                    identifiedBy, identifiedAt, ageDays, isStale,
 *                    recommendation }
 *   onStatusChange (gapId, newStatus, resolution) => void
 *   onClose        () => void
 */
import React, { useState } from 'react';
import {
    Box, Typography, Stack, Chip, Button, TextField,
    Alert, Divider, RadioGroup, FormControlLabel, Radio,
    LinearProgress
} from '@mui/material';
import { AlertTriangle, Clock, CheckCircle, XCircle } from 'lucide-react';

const STATUS_FLOW  = ['OPEN', 'ACKNOWLEDGED', 'ADDRESSED', 'CLOSED'];
const SEVERITY_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e' };
const STATUS_COLORS   = {
    OPEN:         '#ef4444',
    ACKNOWLEDGED: '#f59e0b',
    ADDRESSED:    '#3b82f6',
    CLOSED:       '#22c55e'
};

function SeverityBar({ severity }) {
    const color  = SEVERITY_COLORS[severity] || '#94a3b8';
    const widths = { HIGH: 100, MEDIUM: 65, LOW: 30 };
    return (
        <Stack direction="row" spacing={1} alignItems="center">
            <LinearProgress
                variant="determinate" value={widths[severity] || 50}
                sx={{ width: 80, height: 5, borderRadius: 3,
                      bgcolor: `${color}22`,
                      '& .MuiLinearProgress-bar': { bgcolor: color } }}
            />
            <Typography variant="body2" fontWeight={600} color={color}>{severity}</Typography>
        </Stack>
    );
}

export default function GapPanel({ gap, onStatusChange, onClose }) {
    const [status,     setStatus]     = useState(gap?.status || 'OPEN');
    const [resolution, setResolution] = useState('');
    const [saving,     setSaving]     = useState(false);

    if (!gap) return null;

    const currentIdx = STATUS_FLOW.indexOf(status);

    async function handleUpdate() {
        setSaving(true);
        try {
            await onStatusChange?.(gap.id, status, resolution);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
                        <AlertTriangle size={16} color={SEVERITY_COLORS[gap.severity] || '#94a3b8'} />
                        <Typography variant="subtitle2" fontWeight={700}>{gap.title || 'Knowledge Gap'}</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        {gap.gapType && <Chip label={gap.gapType} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />}
                        <Chip
                            label={status}
                            size="small"
                            sx={{ fontSize: 10, height: 18,
                                  bgcolor: STATUS_COLORS[status] + '22',
                                  color: STATUS_COLORS[status],
                                  border: `1px solid ${STATUS_COLORS[status]}66` }}
                        />
                    </Stack>
                </Box>
            </Stack>

            {/* Stale warning */}
            {gap.isStale && (
                <Alert severity="warning" sx={{ mb: 1.5 }} icon={<Clock size={16} />}>
                    This gap is {gap.ageDays} days old — approaching stale threshold (90 days).
                </Alert>
            )}

            {/* Details */}
            <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover', mb: 1.5 }}>
                <Stack spacing={0.75}>
                    <Stack direction="row" spacing={2} flexWrap="wrap">
                        <Box>
                            <Typography variant="caption" color="text.disabled" display="block">Severity</Typography>
                            <SeverityBar severity={gap.severity} />
                        </Box>
                        {gap.ageDays != null && (
                            <Box>
                                <Typography variant="caption" color="text.disabled" display="block">Age</Typography>
                                <Typography variant="body2" color={gap.isStale ? 'warning.main' : 'text.primary'}>
                                    {gap.ageDays} days
                                </Typography>
                            </Box>
                        )}
                        {gap.identifiedAt && (
                            <Box>
                                <Typography variant="caption" color="text.disabled" display="block">Identified</Typography>
                                <Typography variant="body2">{new Date(gap.identifiedAt).toLocaleDateString()}</Typography>
                            </Box>
                        )}
                    </Stack>

                    {gap.identifiedBy && (
                        <Box>
                            <Typography variant="caption" color="text.disabled" display="block">Source Document</Typography>
                            <Typography variant="body2">{gap.identifiedBy}</Typography>
                        </Box>
                    )}

                    {gap.description && (
                        <Box>
                            <Typography variant="caption" color="text.disabled" display="block">Description</Typography>
                            <Typography variant="body2" color="text.secondary">{gap.description}</Typography>
                        </Box>
                    )}
                </Stack>
            </Box>

            {/* Recommendation */}
            {gap.recommendation && (
                <Box sx={{ p: 1.25, borderRadius: 1, border: '1px solid', borderColor: 'warning.main' + '44',
                           bgcolor: 'warning.main' + '0a', mb: 1.5 }}>
                    <Typography variant="caption" fontWeight={600} color="warning.main" display="block" sx={{ mb: 0.5 }}>
                        RECOMMENDATION
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        "{gap.recommendation}"
                    </Typography>
                </Box>
            )}

            <Divider sx={{ my: 1.5 }} />

            {/* Status flow */}
            <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 1 }}>
                UPDATE STATUS
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mb: 1.5 }}>
                {STATUS_FLOW.map((s, i) => {
                    const isActive   = s === status;
                    const isComplete = i < currentIdx;
                    const color      = STATUS_COLORS[s];
                    return (
                        <Box
                            key={s}
                            onClick={() => setStatus(s)}
                            sx={{
                                flex: 1, p: 0.75, borderRadius: 1, textAlign: 'center', cursor: 'pointer',
                                border: '1px solid',
                                borderColor: isActive ? color : isComplete ? color + '44' : 'divider',
                                bgcolor:     isActive ? color + '18' : isComplete ? color + '08' : 'transparent',
                                transition: 'all 0.15s'
                            }}
                        >
                            {isComplete && <CheckCircle size={12} color={color} />}
                            <Typography variant="caption" fontWeight={isActive ? 700 : 400}
                                color={isActive ? color : 'text.secondary'}
                                display="block" sx={{ fontSize: 10 }}>
                                {s}
                            </Typography>
                        </Box>
                    );
                })}
            </Stack>

            {/* Resolution notes */}
            <TextField
                size="small"
                fullWidth
                multiline
                rows={2}
                label="Resolution notes"
                placeholder="Describe how this gap was or will be addressed…"
                value={resolution}
                onChange={e => setResolution(e.target.value)}
                sx={{ mb: 1.5 }}
            />

            {/* Action buttons */}
            <Stack direction="row" spacing={1}>
                <Button
                    variant="contained"
                    size="small"
                    onClick={handleUpdate}
                    disabled={saving || (status === gap.status && !resolution)}
                    sx={{ flex: 1 }}
                >
                    {saving ? 'Saving…' : 'Update Status'}
                </Button>
                {status !== 'CLOSED' && (
                    <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => { setStatus('CLOSED'); }}
                    >
                        Close Gap
                    </Button>
                )}
                <Button variant="outlined" size="small" onClick={onClose}>
                    Cancel
                </Button>
            </Stack>
        </Box>
    );
}
