/**
 * DocumentVertex — Triangle vertex document list
 *
 * Displays documents linked to a process via a specific triangle edge type.
 * Features:
 *   - Color-coded by vertex type (normative/operational/empirical)
 *   - Each document: icon, name, layer chip, KQS bar, edge date
 *   - Actions: View document, Remove link
 *   - "Add document" button for empty state
 *   - Empty state with guidance
 *
 * Props:
 *   vertexType     'normative' | 'operational' | 'empirical'
 *   documents      array of { id, name, layer, kqsScore, documentType, edgeCreatedAt }
 *   processId      string
 *   onViewDocument (docId) => void
 *   onRemoveLink   (docId) => void
 *   onAddDocument  () => void
 *   readonly       boolean
 */
import React from 'react';
import {
    Box, Typography, Stack, Chip, Button, Tooltip,
    LinearProgress, IconButton, Divider
} from '@mui/material';
import { FileText, Trash2, PlusCircle, ExternalLink } from 'lucide-react';

const VERTEX_META = {
    normative:   { color: '#7c3aed', label: 'Normative', edgeLabel: 'GOVERNS',          layers: 'L0, L1, L2', bg: '#7c3aed11' },
    operational: { color: '#059669', label: 'Operational', edgeLabel: 'OPERATIONALIZES', layers: 'L3',         bg: '#05966911' },
    empirical:   { color: '#ef4444', label: 'Empirical',   edgeLabel: 'REVEALS_GAP_IN',  layers: 'L4',         bg: '#ef444411' },
};

const LAYER_COLORS = {
    L0: '#7c3aed', L1: '#2563eb', L2: '#0891b2',
    L3: '#059669', L4: '#d97706', L5: '#9333ea'
};

function KQSBar({ score }) {
    if (score == null) return <Typography variant="caption" color="text.disabled">—</Typography>;
    const pct   = Math.round(score * 100);
    const color = score >= 0.7 ? '#22c55e' : score >= 0.4 ? '#f59e0b' : '#ef4444';
    return (
        <Stack direction="row" spacing={0.5} alignItems="center">
            <LinearProgress
                variant="determinate" value={pct}
                sx={{ width: 44, height: 4, borderRadius: 2,
                      bgcolor: `${color}22`,
                      '& .MuiLinearProgress-bar': { bgcolor: color } }}
            />
            <Typography variant="caption" color="text.secondary">{pct}</Typography>
        </Stack>
    );
}

export default function DocumentVertex({ vertexType, documents = [], processId, onViewDocument, onRemoveLink, onAddDocument, readonly }) {
    const meta = VERTEX_META[vertexType] || VERTEX_META.normative;

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: meta.color }} />
                    <Typography variant="subtitle2" fontWeight={700} color={meta.color}>
                        {meta.label} Documents
                    </Typography>
                    <Chip label={`${meta.edgeLabel}`} size="small" variant="outlined"
                        sx={{ fontSize: 10, height: 18, color: meta.color, borderColor: meta.color + '66' }} />
                    <Typography variant="caption" color="text.disabled">{meta.layers}</Typography>
                </Stack>
                {!readonly && (
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PlusCircle size={13} />}
                        onClick={onAddDocument}
                        sx={{ borderColor: meta.color, color: meta.color, '&:hover': { bgcolor: meta.bg } }}
                    >
                        Add
                    </Button>
                )}
            </Stack>

            {/* Empty state */}
            {documents.length === 0 && (
                <Box sx={{ p: 2.5, textAlign: 'center', borderRadius: 2,
                           border: '2px dashed', borderColor: meta.color + '33', bgcolor: meta.bg }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        No {meta.label.toLowerCase()} documents linked
                    </Typography>
                    <Typography variant="caption" color="text.disabled" display="block" sx={{ mb: 1.5 }}>
                        {vertexType === 'normative'   && 'Link L0-L2 documents (UN Charter, Resolutions, Staff Rules, Administrative Instructions)'}
                        {vertexType === 'operational' && 'Link L3 documents (SOPs, Guidelines, Manuals, Procedures)'}
                        {vertexType === 'empirical'   && 'Link L4 documents (Audit Reports, Evaluation Reports, Inspection Reports)'}
                    </Typography>
                    {!readonly && (
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<PlusCircle size={13} />}
                            onClick={onAddDocument}
                            sx={{ borderColor: meta.color, color: meta.color }}
                        >
                            Link {meta.label} Document
                        </Button>
                    )}
                </Box>
            )}

            {/* Document list */}
            <Stack spacing={0.75}>
                {documents.map((doc, i) => (
                    <Box key={doc.id || i} sx={{
                        p: 1.25, borderRadius: 1.5,
                        border: '1px solid', borderColor: meta.color + '33',
                        bgcolor: meta.bg,
                        '&:hover': { borderColor: meta.color + '66' }
                    }}>
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                            <FileText size={16} color={meta.color} style={{ flexShrink: 0, marginTop: 2 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                                    <Tooltip title={doc.name}>
                                        <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 240 }}>
                                            {doc.name || doc.id}
                                        </Typography>
                                    </Tooltip>
                                    {doc.layer && (
                                        <Chip label={doc.layer} size="small"
                                            sx={{ height: 16, fontSize: 10,
                                                  bgcolor: LAYER_COLORS[doc.layer] || '#64748b',
                                                  color: '#fff' }} />
                                    )}
                                </Stack>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                    <KQSBar score={doc.kqsScore} />
                                    {doc.documentType && (
                                        <Typography variant="caption" color="text.disabled">{doc.documentType}</Typography>
                                    )}
                                    {doc.edgeCreatedAt && (
                                        <Typography variant="caption" color="text.disabled">
                                            {new Date(doc.edgeCreatedAt).toLocaleDateString()}
                                        </Typography>
                                    )}
                                </Stack>
                            </Box>
                            <Stack direction="row" spacing={0.25}>
                                {onViewDocument && (
                                    <Tooltip title="View document">
                                        <IconButton size="small" onClick={() => onViewDocument(doc.id)}>
                                            <ExternalLink size={13} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                                {!readonly && onRemoveLink && (
                                    <Tooltip title="Remove link">
                                        <IconButton size="small" color="error" onClick={() => onRemoveLink(doc.id)}>
                                            <Trash2 size={13} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Stack>
                        </Stack>
                    </Box>
                ))}
            </Stack>
        </Box>
    );
}
