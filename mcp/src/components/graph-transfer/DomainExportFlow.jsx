/**
 * DomainExportFlow — the map-first export experience: DomainMap → preview results
 * → export options → job progress. Wraps useDomainExport and the real /preview
 * response shape ({ valid, errors, warnings, counts, vectors }).
 */

import { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Alert, Button, TextField, Stack, Chip,
    FormControl, FormLabel, RadioGroup, FormControlLabel, Radio,
    LinearProgress, Divider, Collapse,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import SettingsIcon from '@mui/icons-material/Settings';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DomainMap from './DomainMap';
import useDomainExport from '../../hooks/useDomainExport';
import { jobEventsUrl, jobDownloadUrl } from '../../services/graphTransfer.service';

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : (n ?? '0'));
const vectorPoints = (preview) => (preview?.vectors?.collections || []).reduce((s, c) => s + (c.pointsInSlice || 0), 0);

export default function DomainExportFlow({ disabled }) {
    const flow = useDomainExport();
    const {
        selectedDomains, preview, previewLoading, previewError, currentJobId, jobStatus, options,
        handleSelectionChange, previewDomains, updateOptions, startExport, setJobStatus, reset, canExport,
    } = flow;

    const [showOptions, setShowOptions] = useState(false);
    const [exportError, setExportError] = useState(null);
    const [progress, setProgress] = useState(0);
    const [phase, setPhase] = useState('');

    // Live job progress via SSE.
    useEffect(() => {
        if (!currentJobId) return undefined;
        const es = new EventSource(jobEventsUrl(currentJobId));
        es.onmessage = (e) => {
            let data; try { data = JSON.parse(e.data); } catch { return; }
            if (typeof data.progress === 'number') setProgress(data.progress);
            if (data.phase) setPhase(data.phase);
            const type = data.type || data.phase;
            if (type === 'completed' || (type === 'state' && data.status === 'completed')) { setJobStatus('completed'); es.close(); }
            else if (type === 'failed' || (type === 'state' && data.status === 'failed')) { setJobStatus('failed'); setExportError(data.error || 'Export failed'); es.close(); }
        };
        es.onerror = () => es.close();
        return () => es.close();
    }, [currentJobId, setJobStatus]);

    const handleExport = async () => {
        setExportError(null);
        try { await startExport(); } catch (e) { setExportError(e.message); }
    };

    return (
        <Box>
            <DomainMap
                selectedDomains={selectedDomains}
                onSelectionChange={handleSelectionChange}
                onPreview={previewDomains}
                disabled={disabled || !!currentJobId}
            />

            {/* Preview results */}
            {(previewLoading || preview || previewError) && (
                <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>Preview</Typography>
                    {previewLoading && <LinearProgress sx={{ my: 2 }} />}
                    {previewError && <Alert severity="error" sx={{ mb: 2 }}>{previewError}</Alert>}
                    {preview && (
                        <>
                            <Stack direction="row" spacing={4} sx={{ mb: 2 }}>
                                <Box><Typography variant="h5">{fmt(preview.counts?.nodes)}</Typography><Typography variant="caption" color="text.secondary">Nodes</Typography></Box>
                                <Box><Typography variant="h5">{fmt(preview.counts?.relationships)}</Typography><Typography variant="caption" color="text.secondary">Relationships</Typography></Box>
                                <Box><Typography variant="h5">{fmt(preview.counts?.stubNodes)}</Typography><Typography variant="caption" color="text.secondary">Stub nodes</Typography></Box>
                                <Box><Typography variant="h5">{fmt(vectorPoints(preview))}</Typography><Typography variant="caption" color="text.secondary">Vector points</Typography></Box>
                            </Stack>
                            {preview.warnings?.length > 0 && <Alert severity="warning" sx={{ mb: 1 }}>{preview.warnings.map((w, i) => <div key={i}>{w}</div>)}</Alert>}
                            {preview.errors?.length > 0 && <Alert severity="error" sx={{ mb: 1 }}>{preview.errors.map((e, i) => <div key={i}>{e}</div>)}</Alert>}
                            {preview.containsExecutableGraphs && <Chip size="small" color="warning" label="Contains executable graphs" />}
                        </>
                    )}
                </Paper>
            )}

            {/* Export options + start */}
            {preview && canExport && !currentJobId && (
                <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                        <Typography variant="subtitle2">Export</Typography>
                        <Button size="small" startIcon={<SettingsIcon />} onClick={() => setShowOptions((s) => !s)}>
                            {showOptions ? 'Hide options' : 'Options'}
                        </Button>
                    </Stack>

                    <Collapse in={showOptions}>
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <TextField label="Export name" size="small" fullWidth value={options.name} onChange={(e) => updateOptions({ name: e.target.value })} />
                            <TextField label="Notes" size="small" fullWidth multiline rows={2} value={options.notes} onChange={(e) => updateOptions({ notes: e.target.value })} />
                            <FormControl>
                                <FormLabel sx={{ fontSize: 13 }}>Boundary policy</FormLabel>
                                <RadioGroup row value={options.boundaryPolicy} onChange={(e) => updateOptions({ boundaryPolicy: e.target.value }, true)}>
                                    {['STUB', 'EXCLUDE', 'CLOSURE'].map((v) => <FormControlLabel key={v} value={v} control={<Radio size="small" />} label={v} />)}
                                </RadioGroup>
                            </FormControl>
                            <FormControl>
                                <FormLabel sx={{ fontSize: 13 }}>Vector policy</FormLabel>
                                <RadioGroup row value={options.vectorPolicy} onChange={(e) => updateOptions({ vectorPolicy: e.target.value }, true)}>
                                    {['EMBED_POINTS', 'MANIFEST_ONLY', 'NONE'].map((v) => <FormControlLabel key={v} value={v} control={<Radio size="small" />} label={v} />)}
                                </RadioGroup>
                            </FormControl>
                        </Stack>
                    </Collapse>

                    {exportError && <Alert severity="error" sx={{ mt: 2 }}>{exportError}</Alert>}
                    <Divider sx={{ my: 2 }} />
                    <Stack direction="row" justifyContent="flex-end" spacing={1}>
                        <Button variant="outlined" onClick={reset}>Reset</Button>
                        <Button variant="contained" color="success" startIcon={<PlayArrowIcon />} onClick={handleExport}>Start export</Button>
                    </Stack>
                </Paper>
            )}

            {/* Job progress */}
            {currentJobId && (
                <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>Export job</Typography>
                    {jobStatus === 'running' && (
                        <>
                            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                <Typography variant="body2">{phase || 'working'}…</Typography>
                                <Typography variant="body2">{progress}%</Typography>
                            </Stack>
                            <LinearProgress variant="determinate" value={progress} />
                        </>
                    )}
                    {jobStatus === 'completed' && (
                        <Alert severity="success" action={<Button color="inherit" size="small" startIcon={<DownloadIcon />} href={jobDownloadUrl(currentJobId)}>Download</Button>}>
                            Export completed.
                        </Alert>
                    )}
                    {jobStatus === 'failed' && <Alert severity="error">Export failed: {exportError}</Alert>}
                    {(jobStatus === 'completed' || jobStatus === 'failed') && (
                        <Button sx={{ mt: 2 }} startIcon={<RefreshIcon />} onClick={reset}>New export</Button>
                    )}
                </Paper>
            )}
        </Box>
    );
}
