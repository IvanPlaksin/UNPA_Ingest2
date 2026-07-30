/**
 * SyncToInstancePanel — push the CURRENT selection to another UNPA instance
 * (API-API sync). Reuses the page's buildRequest() for the selection; adds peer
 * management, a plan/apply mode + conflict policy, a live SSE progress view, and
 * a diff/result summary.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box, Paper, Typography, Stack, Divider, Button, TextField, Chip, Alert, AlertTitle,
    Select, MenuItem, FormControl, InputLabel, FormControlLabel, Checkbox, LinearProgress,
    IconButton, Tooltip, Table, TableBody, TableRow, TableCell,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';

import {
    listPeers, addPeer, deletePeer, testPeer, startSync, syncJobEventsUrl,
} from '../../services/graphSync.service';

const MODES = [
    { v: 'plan-apply', label: 'Plan + Apply' },
    { v: 'plan', label: 'Plan only (dry-run)' },
    { v: 'apply', label: 'Apply only' },
];
const CONFLICTS = ['skip', 'overwrite', 'newer-wins'];

export default function SyncToInstancePanel({ buildRequest }) {
    const [peers, setPeers] = useState([]);
    const [peerId, setPeerId] = useState('');
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [adding, setAdding] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const [mode, setMode] = useState('plan-apply');
    const [conflict, setConflict] = useState('skip');
    const [skipVectors, setSkipVectors] = useState(false);
    const [force, setForce] = useState(false);

    const [jobId, setJobId] = useState(null);
    const [status, setStatus] = useState('idle'); // idle|running|completed|failed
    const [phase, setPhase] = useState('');
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const esRef = useRef(null);

    const loadPeers = useCallback(async () => {
        try {
            const { peers: p } = await listPeers();
            setPeers(p || []);
            if (!peerId && p?.length) setPeerId(p[0].id);
        } catch (e) { /* surface via error area on action */ }
    }, [peerId]);

    useEffect(() => { loadPeers(); }, [loadPeers]);

    // SSE progress
    useEffect(() => {
        if (!jobId) return;
        const es = new EventSource(syncJobEventsUrl(jobId));
        esRef.current = es;
        es.onmessage = (e) => {
            let evt; try { evt = JSON.parse(e.data); } catch { return; }
            if (evt.phase) setPhase(evt.phase);
            if (typeof evt.progress === 'number') setProgress(evt.progress);
            if (evt.phase === 'completed') { setStatus('completed'); setResult(evt.result || null); es.close(); }
            if (evt.phase === 'failed') { setStatus('failed'); setError(evt.error || 'sync failed'); es.close(); }
        };
        es.onerror = () => { es.close(); };
        return () => es.close();
    }, [jobId]);

    const handleAddPeer = async () => {
        if (!newUrl.trim()) return;
        setAdding(true);
        try {
            await addPeer({ name: newName.trim() || newUrl.trim(), baseUrl: newUrl.trim() });
            setNewName(''); setNewUrl('');
            await loadPeers();
        } catch (e) { setError(e.response?.data?.error || e.message); }
        finally { setAdding(false); }
    };

    const handleDeletePeer = async (id) => {
        await deletePeer(id).catch(() => {});
        if (peerId === id) setPeerId('');
        loadPeers();
    };

    const handleTest = async () => {
        setTestResult(null);
        if (!peerId) return;
        try { setTestResult(await testPeer(peerId)); }
        catch (e) { setTestResult({ ok: false, error: e.response?.data?.error || e.message }); }
    };

    const handleStart = async () => {
        setError(null); setResult(null); setStatus('running'); setPhase('queued'); setProgress(0);
        try {
            const { jobId: id } = await startSync({
                peerId, request: buildRequest(), mode, conflict, skipVectors, force,
            });
            setJobId(id);
        } catch (e) {
            setStatus('failed');
            setError(e.response?.data?.error || e.message);
        }
    };

    const selectedPeer = peers.find((p) => p.id === peerId);
    const plan = result?.plan?.summary;
    const apply = result?.apply;

    return (
        <Paper variant="outlined" sx={{ p: 2, mt: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <SyncIcon color="primary" />
                <Typography variant="h6">Sync to Instance (API-API)</Typography>
                <Chip size="small" label="uses the selection above" variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Push the current selection to another instance. The peer stages + integrity-verifies the
                package before any write, then plans and idempotently applies it — a failed transfer is safe to retry.
            </Typography>

            {/* Peer registry */}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Target peer</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} sx={{ mb: 1 }}>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                    <InputLabel>Peer</InputLabel>
                    <Select label="Peer" value={peerId} onChange={(e) => { setPeerId(e.target.value); setTestResult(null); }}>
                        {peers.length === 0 && <MenuItem value="" disabled>No peers — add one →</MenuItem>}
                        {peers.map((p) => (
                            <MenuItem key={p.id} value={p.id}>
                                {p.name} {p.keyConfigured ? '' : '(no key)'}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                {selectedPeer && (
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>{selectedPeer.baseUrl}</Typography>
                )}
                <Tooltip title="Test connectivity + auth to the peer receiver">
                    <span><Button size="small" startIcon={<NetworkCheckIcon />} disabled={!peerId} onClick={handleTest}>Test</Button></span>
                </Tooltip>
                {selectedPeer && (
                    <IconButton size="small" color="error" onClick={() => handleDeletePeer(peerId)}><DeleteIcon fontSize="small" /></IconButton>
                )}
            </Stack>
            {testResult && (
                <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ mb: 1 }}>
                    {testResult.ok
                        ? `Reachable — receiver enabled=${String(testResult.receiver?.enabled)}, maxBytes=${testResult.receiver?.maxBytes}`
                        : `Unreachable: ${testResult.error || testResult.status}`}
                </Alert>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
                <TextField size="small" label="Name" value={newName} onChange={(e) => setNewName(e.target.value)} sx={{ width: 160 }} />
                <TextField size="small" label="Base URL (https://…)" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
                <Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={adding || !newUrl.trim()} onClick={handleAddPeer}>Add peer</Button>
            </Stack>

            <Divider sx={{ my: 2 }} />

            {/* Sync options */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ md: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 170 }}>
                    <InputLabel>Mode</InputLabel>
                    <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                        {MODES.map((m) => <MenuItem key={m.v} value={m.v}>{m.label}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Conflict</InputLabel>
                    <Select label="Conflict" value={conflict} onChange={(e) => setConflict(e.target.value)}>
                        {CONFLICTS.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                    </Select>
                </FormControl>
                <FormControlLabel control={<Checkbox size="small" checked={skipVectors} onChange={(e) => setSkipVectors(e.target.checked)} />} label="Skip vectors" />
                <FormControlLabel control={<Checkbox size="small" checked={force} onChange={(e) => setForce(e.target.checked)} />} label="Force (bypass idempotency/conflict gate)" />
                <Box sx={{ flex: 1 }} />
                <Button
                    variant="contained" startIcon={<SyncIcon />}
                    disabled={!peerId || status === 'running'}
                    onClick={handleStart}
                >
                    {status === 'running' ? 'Syncing…' : (mode === 'plan' ? 'Run plan' : 'Push to instance')}
                </Button>
            </Stack>

            {/* Progress */}
            {status === 'running' && (
                <Box sx={{ mb: 2 }}>
                    <Stack direction="row" justifyContent="space-between"><Typography variant="caption">{phase}</Typography><Typography variant="caption">{progress}%</Typography></Stack>
                    <LinearProgress variant="determinate" value={progress} />
                </Box>
            )}
            {error && <Alert severity="error" icon={<ErrorOutlineIcon />} sx={{ mb: 2 }}><AlertTitle>Sync failed</AlertTitle>{error}</Alert>}

            {/* Result */}
            {result && (
                <Alert severity={apply?.status === 'failed' ? 'warning' : 'success'} icon={<CheckCircleIcon />} sx={{ mb: 1 }}>
                    <AlertTitle>{mode === 'plan' ? 'Plan complete (no write)' : (apply?.idempotent ? 'Already up to date (idempotent)' : 'Sync applied')}</AlertTitle>
                    {plan && (
                        <Table size="small" sx={{ mt: 1, '& td': { border: 0, py: 0.25 } }}>
                            <TableBody>
                                <TableRow><TableCell>Nodes</TableCell><TableCell>+{plan.nodes.create} create · {plan.nodes.update} update · {plan.nodes.skip} skip · {plan.nodes.conflict} conflict</TableCell></TableRow>
                                <TableRow><TableCell>Relationships</TableCell><TableCell>+{plan.relationships.create} create · {plan.relationships.skip} skip · {plan.relationships.orphan} orphan</TableCell></TableRow>
                                <TableRow><TableCell>Vectors</TableCell><TableCell>{plan.vectors.upsert} upsert · {plan.vectors.skip} skip</TableCell></TableRow>
                            </TableBody>
                        </Table>
                    )}
                    {apply && !apply.idempotent && apply.stats && (
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            Applied → nodes {apply.stats.nodes.created}c/{apply.stats.nodes.updated}u/{apply.stats.nodes.skipped}s ·
                            rels {apply.stats.relationships.created}c ·
                            vectors {apply.stats.vectors.upserted} · importId {String(apply.importId).slice(0, 8)}
                        </Typography>
                    )}
                    {result.ingest?.contentHash && (
                        <Typography variant="caption" color="text.secondary">contentHash {String(result.ingest.contentHash).slice(0, 16)}…</Typography>
                    )}
                </Alert>
            )}
        </Paper>
    );
}
