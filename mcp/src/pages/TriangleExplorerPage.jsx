/**
 * TriangleExplorerPage  /knowledge-triangle
 *
 * Two-panel Knowledge Triangle Explorer:
 *   Left  (350px) — ProcessList: searchable/filterable process table with completeness
 *   Right (flex)  — TriangleDetail: full triangle view for selected process
 *
 * Accepts navigation state from DocumentProcessingPage:
 *   { highlightDocumentId }  — future use (highlight processes linked to a document)
 *
 * URL state: ?process=:id preserved on selection
 */
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Box, Typography, Stack, Chip, Divider, FormControl,
    InputLabel, Select, MenuItem, Paper, Alert
} from '@mui/material';
import { GitBranch } from 'lucide-react';

import ProcessList from '../components/Triangle/ProcessList';
import TriangleDetail from '../components/Triangle/TriangleDetail';
import DocumentPicker from '../components/Triangle/DocumentPicker';

const NAMESPACES = ['', 'DEFAULT', 'KM', 'HR', 'FINANCE', 'PROCUREMENT', 'LEGAL', 'IT', 'AUDIT', 'CORE'];

export default function TriangleExplorerPage() {
    const location       = useLocation();
    const navigate       = useNavigate();
    const [params, setParams] = useSearchParams();

    const [namespace,        setNamespace]        = useState(params.get('namespace') || '');
    const [selectedProcess,  setSelectedProcess]  = useState(null);
    const [linkTarget,       setLinkTarget]       = useState(null);  // { processId, vertexType }
    const [pickerOpen,       setPickerOpen]       = useState(false);
    const [detailKey,        setDetailKey]        = useState(0);     // bump to refresh TriangleDetail

    // Restore selected process from URL
    useEffect(() => {
        const pid = params.get('process');
        if (pid && (!selectedProcess || selectedProcess.id !== pid)) {
            setSelectedProcess({ id: pid });
        }
    }, []);

    // Incoming state from DocumentProcessingPage (e.g. "view triangle for doc X")
    const incomingDocId = location.state?.highlightDocumentId;

    function handleSelectProcess(proc) {
        setSelectedProcess(proc);
        const next = new URLSearchParams(params);
        next.set('process', proc.id);
        setParams(next, { replace: true });
    }

    function handleViewDocument(docId) {
        navigate('/documents');
    }

    function handleLinkDocument(processId, vertexType) {
        setLinkTarget({ processId, vertexType });
        setPickerOpen(true);
    }

    async function handlePickerConfirm(docId, edgeType) {
        const axios = (await import('axios')).default;
        const { API_BASE_URL } = await import('../config/api.config');
        await axios.post(`${API_BASE_URL}/explorer/processes/${linkTarget.processId}/link`, {
            documentId: docId,
            edgeType
        });
        setDetailKey(k => k + 1);  // refresh TriangleDetail
    }

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ── Header ── */}
            <Stack direction="row" alignItems="center" justifyContent="space-between"
                sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <GitBranch size={20} />
                    <Typography variant="h6" fontWeight={700}>Knowledge Triangle Explorer</Typography>
                    <Chip label="Beta" size="small" color="info" variant="outlined" />
                </Stack>
                <FormControl size="small" sx={{ minWidth: 160 }}>
                    <InputLabel>Namespace</InputLabel>
                    <Select value={namespace} label="Namespace" onChange={e => setNamespace(e.target.value)}>
                        <MenuItem value=""><em>All namespaces</em></MenuItem>
                        {NAMESPACES.filter(Boolean).map(ns => (
                            <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </Stack>

            {incomingDocId && (
                <Alert severity="info" sx={{ mx: 2.5, mt: 1.5 }} onClose={() => navigate('/knowledge-triangle', { replace: true })}>
                    Showing knowledge triangle — document link context from Document Processing.
                </Alert>
            )}

            {/* ── Two-panel layout ── */}
            <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 0 }}>

                {/* Left: Process list */}
                <Paper
                    variant="outlined"
                    square
                    sx={{
                        width: 350,
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        borderLeft: 0,
                        borderTop: 0,
                        borderBottom: 0,
                        borderRadius: 0
                    }}
                >
                    <Box sx={{ px: 1.5, pt: 1.5, pb: 0.5, flexShrink: 0 }}>
                        <Typography variant="subtitle2" fontWeight={700}>Processes</Typography>
                        <Typography variant="caption" color="text.secondary">
                            Select a process to view its Knowledge Triangle
                        </Typography>
                    </Box>
                    <Box sx={{ flex: 1, overflow: 'hidden' }}>
                        <ProcessList
                            namespace={namespace || undefined}
                            selectedId={selectedProcess?.id}
                            onSelect={handleSelectProcess}
                        />
                    </Box>
                </Paper>

                <Divider orientation="vertical" flexItem />

                {/* Right: Triangle detail */}
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                    {selectedProcess ? (
                        <TriangleDetail
                            key={`${selectedProcess.id}-${detailKey}`}
                            processId={selectedProcess.id}
                            onClose={() => {
                                setSelectedProcess(null);
                                const next = new URLSearchParams(params);
                                next.delete('process');
                                setParams(next, { replace: true });
                            }}
                            onViewDocument={handleViewDocument}
                            onLinkDocument={handleLinkDocument}
                        />
                    ) : (
                        <Box sx={{
                            height: '100%', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            flexDirection: 'column', gap: 1, color: 'text.secondary'
                        }}>
                            <GitBranch size={48} opacity={0.2} />
                            <Typography variant="body1" color="text.secondary">
                                Select a process to view its Knowledge Triangle
                            </Typography>
                            <Typography variant="caption" color="text.disabled" sx={{ maxWidth: 360, textAlign: 'center' }}>
                                The Knowledge Triangle shows normative, operational, and empirical
                                document coverage for each UN process, along with any detected gaps.
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>

        {/* Document Picker modal */}
        <DocumentPicker
            open={pickerOpen}
            processId={linkTarget?.processId}
            vertexType={linkTarget?.vertexType}
            onConfirm={handlePickerConfirm}
            onClose={() => setPickerOpen(false)}
        />
        </Box>
    );
}
