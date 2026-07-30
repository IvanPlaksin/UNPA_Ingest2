/**
 * DataSyncPage — human-oriented console for API-API data synchronization.
 * Flow: Compare instances by domain → pick what's out of sync → review a
 * human-readable plan → apply (gated) → verify. Plus domain-based New Sync,
 * Peers, Jobs, History.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box, Paper, Typography, Tabs, Tab, Stack, Divider, Button, TextField, Chip, Alert, AlertTitle,
    Select, MenuItem, FormControl, InputLabel, FormControlLabel, Checkbox, LinearProgress, Card,
    CardContent, IconButton, Tooltip, Table, TableBody, TableHead, TableRow, TableCell, CircularProgress,
    ToggleButtonGroup, ToggleButton, Collapse, Radio, RadioGroup,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import NetworkCheckIcon from '@mui/icons-material/NetworkCheck';
import RefreshIcon from '@mui/icons-material/Refresh';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

import gs from '../services/graphSync.service';

const CONFLICT_MODES = [
    { v: 'skip', label: 'Only add what\'s missing', hint: 'Safe — never changes existing data on the target.', sev: 'success' },
    { v: 'newer-wins', label: 'Keep the newest version', hint: 'Updates the target only where the source copy is newer.', sev: 'info' },
    { v: 'overwrite', label: 'Make target match source', hint: 'Overwrites existing entities on the target with the source version.', sev: 'warning' },
];
const splitList = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);
const short = (s, n = 8) => (s ? String(s).slice(0, n) : '');
const errMsg = (e) => {
    const d = e?.response?.data?.error;
    if (typeof d === 'string' && d) return d;
    if (d && typeof d === 'object') return d.message || JSON.stringify(d);
    return e?.message || 'Request failed';
};
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : n);

// ── Live job (plan/apply) with a human-readable diff ────────────────────────
function JobLive({ jobId, onDone }) {
    const [phase, setPhase] = useState('queued');
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('running');
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const doneRef = useRef(false);
    useEffect(() => {
        if (!jobId) return;
        setStatus('running'); setPhase('queued'); setProgress(0); setResult(null); setError(null); doneRef.current = false;
        const es = new EventSource(gs.syncJobEventsUrl(jobId));
        es.onmessage = (e) => {
            let evt; try { evt = JSON.parse(e.data); } catch { return; }
            if (evt.phase) setPhase(evt.phase);
            if (typeof evt.progress === 'number') setProgress(evt.progress);
            if (evt.phase === 'completed') { setStatus('completed'); setResult(evt.result || null); es.close(); if (!doneRef.current) { doneRef.current = true; onDone?.(evt.result || null); } }
            if (evt.phase === 'failed') { setStatus('failed'); setError(evt.error || 'failed'); es.close(); }
        };
        es.onerror = () => es.close();
        return () => es.close();
    }, [jobId]); // eslint-disable-line
    const plan = result?.plan?.summary;
    const apply = result?.apply;
    return (
        <Box sx={{ mt: 1 }}>
            {status === 'running' && (<>
                <Stack direction="row" justifyContent="space-between"><Typography variant="caption">{phase}</Typography><Typography variant="caption">{progress}%</Typography></Stack>
                <LinearProgress variant="determinate" value={progress} />
            </>)}
            {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
            {plan && (
                <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">This will:</Typography>
                    <Stack direction="row" spacing={1} sx={{ my: 0.5 }} flexWrap="wrap">
                        <Chip size="small" color="success" label={`add ${fmt(plan.nodes.create)} + ${fmt(plan.relationships.create)} links + ${fmt(plan.vectors.upsert)} vectors`} />
                        {plan.nodes.update > 0 && <Chip size="small" color="warning" label={`change ${fmt(plan.nodes.update)} existing`} />}
                        <Chip size="small" variant="outlined" label={`leave ${fmt(plan.nodes.skip)} unchanged`} />
                        {plan.nodes.conflict > 0 && <Chip size="small" color="error" label={`${plan.nodes.conflict} conflicts`} />}
                        {plan.relationships.orphan > 0 && <Chip size="small" variant="outlined" label={`${plan.relationships.orphan} orphan links skipped`} />}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">Nothing is ever deleted on the target.</Typography>
                </Box>
            )}
            {apply && (
                <Alert severity={apply.status === 'failed' ? 'warning' : 'success'} icon={<CheckCircleIcon />} sx={{ mt: 1 }}>
                    {apply.idempotent ? 'Target was already up to date (idempotent — nothing changed).' :
                        `Applied → added/updated ${fmt((apply.stats?.nodes.created || 0) + (apply.stats?.nodes.updated || 0))} nodes, ${fmt(apply.stats?.relationships.created)} links, ${fmt(apply.stats?.vectors.upserted)} vectors · importId ${short(apply.importId)}`}
                </Alert>
            )}
        </Box>
    );
}

// ── Reusable plan→(gate)→apply runner ───────────────────────────────────────
function SyncRunner({ peerId, spec, conflict, onApplied }) {
    // spec: { domains:[] } or { request:{} }
    const [planJob, setPlanJob] = useState(null);
    const [staging, setStaging] = useState(null);
    const [applyJob, setApplyJob] = useState(null);
    const [err, setErr] = useState(null);
    const overwrite = conflict === 'overwrite';

    const runPlan = async () => {
        setErr(null); setStaging(null); setApplyJob(null); setPlanJob(null);
        try { const { jobId } = await gs.startSync({ peerId, ...spec, mode: 'plan', conflict }); setPlanJob(jobId); }
        catch (e) { setErr(errMsg(e)); }
    };
    const onPlanDone = (r) => { if (r?.stagingId) setStaging(r.stagingId); };
    const runApply = async () => {
        setErr(null); setApplyJob(null);
        try { const { jobId } = await gs.applyStaged({ peerId, stagingId: staging, conflict }); setApplyJob(jobId); }
        catch (e) { setErr(errMsg(e)); }
    };

    return (
        <Box>
            <Button variant="contained" startIcon={<CompareArrowsIcon />} disabled={!peerId || (planJob && !staging && !applyJob)} onClick={runPlan}>
                Preview changes (dry-run)
            </Button>
            {err && <Alert severity="error" sx={{ mt: 1 }}>{err}</Alert>}
            {planJob && (
                <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                    <Typography variant="subtitle2">Preview</Typography>
                    <JobLive jobId={planJob} onDone={onPlanDone} />
                    {staging && !applyJob && (
                        <Box sx={{ mt: 1 }}>
                            {overwrite && <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 1 }}>“Make target match source” overwrites existing entities. Review the preview above before applying.</Alert>}
                            <Button variant="contained" color={overwrite ? 'warning' : 'primary'} startIcon={<PlayArrowIcon />} onClick={runApply}>
                                {overwrite ? 'Apply (overwrite)' : 'Apply changes'}
                            </Button>
                        </Box>
                    )}
                </Paper>
            )}
            {applyJob && (
                <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                    <Typography variant="subtitle2">Apply</Typography>
                    <JobLive jobId={applyJob} onDone={onApplied} />
                </Paper>
            )}
        </Box>
    );
}

function ConflictModeSelect({ value, onChange }) {
    const m = CONFLICT_MODES.find((x) => x.v === value) || CONFLICT_MODES[0];
    return (
        <Box>
            <RadioGroup value={value} onChange={(e) => onChange(e.target.value)}>
                {CONFLICT_MODES.map((c) => (
                    <FormControlLabel key={c.v} value={c.v} control={<Radio size="small" />}
                        label={<span>{c.label} <Typography variant="caption" color="text.secondary">— {c.hint}</Typography></span>} />
                ))}
            </RadioGroup>
        </Box>
    );
}

// ── Compare (landing) ───────────────────────────────────────────────────────
function CompareTab({ peers }) {
    const [peerId, setPeerId] = useState('');
    const [cmp, setCmp] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [selected, setSelected] = useState({}); // domainId -> bool
    const [conflict, setConflict] = useState('skip');
    const [applied, setApplied] = useState(false);
    useEffect(() => { if (!peerId && peers.length) setPeerId(peers[0].id); }, [peers, peerId]);

    const runCompare = useCallback(async () => {
        if (!peerId) return;
        setLoading(true); setErr(null); setApplied(false);
        try {
            const c = await gs.comparePeer(peerId); setCmp(c);
            const sel = {}; (c.domains || []).forEach((d) => { if (d.category === 'significant' && !d.inSync) sel[d.id] = true; });
            setSelected(sel);
        } catch (e) { setErr(errMsg(e)); setCmp(null); } finally { setLoading(false); }
    }, [peerId]);
    useEffect(() => { setCmp(null); }, [peerId]);

    const chosen = Object.keys(selected).filter((k) => selected[k]);
    const target = peers.find((p) => p.id === peerId);

    return (
        <Box>
            <Typography variant="h6" sx={{ mb: 1 }}>Compare instances</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                See what differs between <b>this instance</b> and a peer, by meaning-domain, then reconcile only what you choose.
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }} flexWrap="wrap">
                <Chip label="this instance" color="primary" variant="outlined" />
                <CompareArrowsIcon color="action" />
                <FormControl size="small" sx={{ minWidth: 220 }}>
                    <InputLabel>Peer (target)</InputLabel>
                    <Select label="Peer (target)" value={peerId} onChange={(e) => setPeerId(e.target.value)}>
                        {peers.length === 0 && <MenuItem value="" disabled>No peers — add one in Peers</MenuItem>}
                        {peers.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}{p.keyConfigured ? '' : ' (no key)'}</MenuItem>)}
                    </Select>
                </FormControl>
                <Button variant="contained" startIcon={<CompareArrowsIcon />} disabled={!peerId || loading} onClick={runCompare}>Compare</Button>
                {loading && <CircularProgress size={20} />}
            </Stack>
            {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

            {cmp && (
                <>
                    <Table size="small" sx={{ mb: 2 }}>
                        <TableHead><TableRow>
                            <TableCell padding="checkbox" /><TableCell>Domain</TableCell><TableCell>Kind</TableCell>
                            <TableCell align="right">This</TableCell><TableCell align="right">{target?.name || 'Target'}</TableCell>
                            <TableCell align="right">Difference</TableCell><TableCell>Status</TableCell>
                        </TableRow></TableHead>
                        <TableBody>
                            {cmp.domains.map((d) => {
                                const drift = !d.inSync;
                                const dn = d.nodesDelta, dv = d.vectorsDelta;
                                return (
                                    <TableRow key={d.id} hover selected={!!selected[d.id]}>
                                        <TableCell padding="checkbox">
                                            <Checkbox size="small" checked={!!selected[d.id]} disabled={!drift}
                                                onChange={(e) => setSelected((s) => ({ ...s, [d.id]: e.target.checked }))} />
                                        </TableCell>
                                        <TableCell><Tooltip title={d.description}><span>{d.label}</span></Tooltip></TableCell>
                                        <TableCell><Chip size="small" variant="outlined" label={d.category} color={d.category === 'significant' ? 'primary' : 'default'} /></TableCell>
                                        <TableCell align="right">{fmt(d.source.nodes)}{d.source.vectors ? ` · ${fmt(d.source.vectors)}v` : ''}</TableCell>
                                        <TableCell align="right">{fmt(d.target.nodes)}{d.target.vectors ? ` · ${fmt(d.target.vectors)}v` : ''}</TableCell>
                                        <TableCell align="right" sx={{ color: drift ? 'warning.main' : 'text.disabled' }}>
                                            {drift ? `${dn > 0 ? '+' : ''}${fmt(dn)}${dv ? ` · ${dv > 0 ? '+' : ''}${fmt(dv)}v` : ''}` : '—'}
                                        </TableCell>
                                        <TableCell>{d.inSync
                                            ? <Chip size="small" color="success" icon={<CheckCircleIcon />} label="in sync" />
                                            : <Chip size="small" color="warning" label="out of sync" />}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>

                    {chosen.length > 0 ? (
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Reconcile {chosen.length} domain(s) → {target?.name}</Typography>
                            <Typography variant="caption" color="text.secondary">How to handle entities that already exist on the target:</Typography>
                            <ConflictModeSelect value={conflict} onChange={setConflict} />
                            <Divider sx={{ my: 1 }} />
                            <SyncRunner peerId={peerId} spec={{ domains: chosen }} conflict={conflict} onApplied={() => setApplied(true)} />
                            {applied && <Button sx={{ mt: 2 }} size="small" startIcon={<RefreshIcon />} onClick={runCompare}>Re-compare to verify</Button>}
                        </Paper>
                    ) : (
                        <Alert severity={cmp.significantDrift?.length ? 'info' : 'success'}>
                            {cmp.significantDrift?.length ? 'Select the out-of-sync domains above to reconcile them.' : 'All significant domains are in sync. ✔'}
                        </Alert>
                    )}
                </>
            )}
        </Box>
    );
}

// ── New Sync (domain-based + advanced) ──────────────────────────────────────
function NewSyncTab({ peers, domains }) {
    const [peerId, setPeerId] = useState('');
    const [picked, setPicked] = useState([]); // domain ids
    const [advanced, setAdvanced] = useState(false);
    const [mode, setMode] = useState('LABELS');
    const [labels, setLabels] = useState('SlotKnowledge, ServiceKnowledge');
    const [cypher, setCypher] = useState('MATCH (n:ServiceDef) RETURN n LIMIT 100');
    const [collections, setCollections] = useState('flowdesk_services, knowledge_entities');
    const [conflict, setConflict] = useState('skip');
    useEffect(() => { if (!peerId && peers.length) setPeerId(peers[0].id); }, [peers, peerId]);

    const spec = advanced
        ? { request: (() => {
            const selectedCollections = {}; splitList(collections).forEach((c) => { selectedCollections[c] = true; });
            const r = { selectionMode: mode, boundaryPolicy: 'STUB', vectorPolicy: 'EMBED_POINTS', selectedCollections };
            if (mode === 'LABELS') r.labels = splitList(labels);
            if (mode === 'CYPHER') r.cypher = cypher;
            return r;
        })() }
        : { domains: picked };
    const canRun = !!peerId && (advanced || picked.length > 0);

    return (
        <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>New sync</Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>What to sync</Typography>
                    {!advanced ? (
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            {domains.map((d) => (
                                <Chip key={d.id} label={d.label} color={picked.includes(d.id) ? (d.category === 'significant' ? 'primary' : 'default') : 'default'}
                                    variant={picked.includes(d.id) ? 'filled' : 'outlined'}
                                    onClick={() => setPicked((p) => p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id])} />
                            ))}
                            {domains.length === 0 && <Typography variant="caption" color="text.secondary">Loading domains…</Typography>}
                        </Stack>
                    ) : (
                        <Box>
                            <Tabs value={mode} onChange={(_, v) => setMode(v)} sx={{ mb: 1 }} variant="scrollable">
                                {['LABELS', 'CYPHER'].map((m) => <Tab key={m} value={m} label={m} />)}
                            </Tabs>
                            {mode === 'LABELS' && <TextField fullWidth size="small" label="Labels (comma)" value={labels} onChange={(e) => setLabels(e.target.value)} sx={{ mb: 1 }} />}
                            {mode === 'CYPHER' && <TextField fullWidth multiline minRows={2} size="small" label="Cypher (RETURN n)" value={cypher} onChange={(e) => setCypher(e.target.value)} sx={{ mb: 1 }} />}
                            <TextField fullWidth size="small" label="Vector collections (comma)" value={collections} onChange={(e) => setCollections(e.target.value)} />
                        </Box>
                    )}
                    <Button size="small" sx={{ mt: 1 }} onClick={() => setAdvanced((a) => !a)}>{advanced ? '← Use domains' : 'Advanced (labels / Cypher)'}</Button>
                </Paper>
                <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Target + how to merge</Typography>
                    <FormControl size="small" fullWidth sx={{ mb: 1 }}><InputLabel>Peer</InputLabel>
                        <Select label="Peer" value={peerId} onChange={(e) => setPeerId(e.target.value)}>
                            {peers.length === 0 && <MenuItem value="" disabled>No peers</MenuItem>}
                            {peers.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}{p.keyConfigured ? '' : ' (no key)'}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <ConflictModeSelect value={conflict} onChange={setConflict} />
                </Paper>
            </Stack>
            <Box sx={{ mt: 2 }}>
                {canRun ? <SyncRunner peerId={peerId} spec={spec} conflict={conflict} />
                    : <Alert severity="info">Pick at least one domain (or switch to Advanced) and a target peer.</Alert>}
            </Box>
        </Box>
    );
}

// ── Peers ───────────────────────────────────────────────────────────────────
function PeersTab({ peers, reload }) {
    const [name, setName] = useState(''); const [url, setUrl] = useState(''); const [key, setKey] = useState('');
    const [busy, setBusy] = useState(false); const [probe, setProbe] = useState({}); const [err, setErr] = useState(null);
    const add = async () => { if (!url.trim()) return; setBusy(true); setErr(null);
        try { await gs.addPeer({ name: name.trim() || url.trim(), baseUrl: url.trim(), key: key.trim() || undefined }); setName(''); setUrl(''); setKey(''); reload(); }
        catch (e) { setErr(errMsg(e)); } finally { setBusy(false); } };
    const test = async (id) => { setProbe((s) => ({ ...s, [id]: { loading: true } })); try { const r = await gs.testPeer(id); setProbe((s) => ({ ...s, [id]: r })); } catch (e) { setProbe((s) => ({ ...s, [id]: { ok: false, error: errMsg(e) } })); } };
    const del = async (id) => { await gs.deletePeer(id).catch(() => {}); reload(); };
    return (
        <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>Peers</Typography>
            {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
            <Table size="small" sx={{ mb: 2 }}>
                <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Base URL</TableCell><TableCell>Key</TableCell><TableCell>Receiver</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                <TableBody>
                    {peers.map((p) => { const h = probe[p.id]; return (
                        <TableRow key={p.id} hover>
                            <TableCell>{p.name}</TableCell>
                            <TableCell><Typography variant="caption">{p.baseUrl}</Typography></TableCell>
                            <TableCell><Chip size="small" label={p.keyConfigured ? 'yes' : 'no'} color={p.keyConfigured ? 'success' : 'default'} variant="outlined" /></TableCell>
                            <TableCell>{h?.loading ? <CircularProgress size={16} /> : h ? (h.ok ? <Chip size="small" color="success" label={`enabled=${h.receiver?.enabled}`} /> : <Chip size="small" color="error" label={h.error || `HTTP ${h.status}`} />) : <Typography variant="caption" color="text.secondary">—</Typography>}</TableCell>
                            <TableCell align="right">
                                <Tooltip title="Test"><IconButton size="small" onClick={() => test(p.id)}><NetworkCheckIcon fontSize="small" /></IconButton></Tooltip>
                                <Tooltip title="Delete"><IconButton size="small" color="error" onClick={() => del(p.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                            </TableCell>
                        </TableRow>); })}
                    {peers.length === 0 && <TableRow><TableCell colSpan={5}><Typography variant="body2" color="text.secondary">No peers.</Typography></TableCell></TableRow>}
                </TableBody>
            </Table>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Add peer</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} sx={{ width: 160 }} />
                <TextField size="small" label="Base URL (https://…)" value={url} onChange={(e) => setUrl(e.target.value)} sx={{ flex: 1, minWidth: 220 }} />
                <TextField size="small" type="password" label="Sync key" value={key} onChange={(e) => setKey(e.target.value)} sx={{ minWidth: 200 }} placeholder="GRAPH_SYNC_KEY of the peer" />
                <Button variant="outlined" startIcon={<AddIcon />} disabled={busy || !url.trim()} onClick={add}>Add</Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                The sync key must match the peer's <code>GRAPH_SYNC_KEY</code>. It's stored server-side only (never returned to the browser). Leave blank to use this instance's <code>GRAPH_SYNC_KEY</code> env.
            </Typography>
        </Box>
    );
}

function RecentJobsTable({ jobs, onSelect }) {
    if (!jobs.length) return <Typography variant="body2" color="text.secondary">No jobs yet.</Typography>;
    return (
        <Table size="small">
            <TableHead><TableRow><TableCell>Peer</TableCell><TableCell>Mode</TableCell><TableCell>Status</TableCell><TableCell>Phase</TableCell><TableCell>Created</TableCell></TableRow></TableHead>
            <TableBody>
                {jobs.map((j) => (
                    <TableRow key={j.id} hover sx={{ cursor: onSelect ? 'pointer' : 'default' }} onClick={() => onSelect?.(j)}>
                        <TableCell>{j.peer}</TableCell><TableCell>{j.mode}</TableCell>
                        <TableCell><Chip size="small" label={j.status} color={j.status === 'completed' ? 'success' : j.status === 'failed' ? 'error' : 'warning'} /></TableCell>
                        <TableCell>{j.phase} {typeof j.progress === 'number' ? `(${j.progress}%)` : ''}</TableCell>
                        <TableCell>{new Date(j.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

function JobsTab({ jobs, reload }) {
    const [sel, setSel] = useState(null);
    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}><Typography variant="h6">Jobs</Typography><Button size="small" startIcon={<RefreshIcon />} onClick={reload}>Refresh</Button></Stack>
            <RecentJobsTable jobs={jobs} onSelect={setSel} />
            {sel && <Paper variant="outlined" sx={{ p: 2, mt: 2 }}><Typography variant="subtitle2">Job {short(sel.id)} · {sel.peer} · {sel.mode}</Typography><JobLive jobId={sel.id} /></Paper>}
        </Box>
    );
}

function HistoryTab({ peers }) {
    const [peerId, setPeerId] = useState(''); const [records, setRecords] = useState([]); const [loading, setLoading] = useState(false); const [err, setErr] = useState(null);
    useEffect(() => { if (!peerId && peers.length) setPeerId(peers[0].id); }, [peers, peerId]);
    const load = useCallback(async () => { if (!peerId) return; setLoading(true); setErr(null);
        try { const { records: r } = await gs.peerRecords(peerId, 100); setRecords(r || []); } catch (e) { setErr(errMsg(e)); setRecords([]); } finally { setLoading(false); } }, [peerId]);
    useEffect(() => { load(); }, [load]);
    return (
        <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ mr: 2 }}>Import history</Typography>
                <FormControl size="small" sx={{ minWidth: 200 }}><InputLabel>Peer</InputLabel><Select label="Peer" value={peerId} onChange={(e) => setPeerId(e.target.value)}>{peers.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}</Select></FormControl>
                <Button size="small" startIcon={<RefreshIcon />} onClick={load}>Refresh</Button>{loading && <CircularProgress size={18} />}
            </Stack>
            {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}
            <Table size="small">
                <TableHead><TableRow><TableCell>When</TableCell><TableCell>Status</TableCell><TableCell>Via</TableCell><TableCell>Nodes (add/upd/skip)</TableCell><TableCell>Links</TableCell><TableCell>Vectors</TableCell></TableRow></TableHead>
                <TableBody>
                    {records.map((r) => (
                        <TableRow key={r.id} hover>
                            <TableCell>{new Date(r.finishedAt || r.appliedAt || r.startedAt).toLocaleString()}</TableCell>
                            <TableCell><Chip size="small" label={r.status} color={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'error' : 'warning'} /></TableCell>
                            <TableCell>{r.transport || '—'}</TableCell>
                            <TableCell>{r.counts_nodesCreated || 0}/{r.counts_nodesUpdated || 0}/{r.counts_nodesSkipped || 0}</TableCell>
                            <TableCell>{r.counts_relsCreated || 0}</TableCell><TableCell>{r.counts_vectorsUpserted || 0}</TableCell>
                        </TableRow>
                    ))}
                    {records.length === 0 && !loading && <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">No import records.</Typography></TableCell></TableRow>}
                </TableBody>
            </Table>
        </Box>
    );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function DataSyncPage() {
    const [tab, setTab] = useState(0);
    const [peers, setPeers] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [domains, setDomains] = useState([]);
    const reloadPeers = useCallback(async () => { try { const { peers: p } = await gs.listPeers(); setPeers(p || []); } catch { /* */ } }, []);
    const reloadJobs = useCallback(async () => { try { const { jobs: j } = await gs.listSyncJobs(50); setJobs(j || []); } catch { /* */ } }, []);
    useEffect(() => { reloadPeers(); reloadJobs(); gs.getDomains().then((d) => setDomains(d.domains || [])).catch(() => {}); }, [reloadPeers, reloadJobs]);
    useEffect(() => { const t = setInterval(reloadJobs, 5000); return () => clearInterval(t); }, [reloadJobs]);

    return (
        <Box sx={{ p: 3, maxWidth: 1200, mx: 'auto' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <SyncIcon color="primary" fontSize="large" /><Typography variant="h5">Data Sync</Typography><Chip size="small" label="API-API" variant="outlined" />
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Keep instances consistent by meaning-domain. Compare → pick what's out of sync → preview → apply (nothing is ever deleted) → verify.
            </Typography>
            <Paper variant="outlined" sx={{ mb: 2 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
                    <Tab icon={<CompareArrowsIcon />} iconPosition="start" label="Compare" />
                    <Tab icon={<SyncIcon />} iconPosition="start" label="New Sync" />
                    <Tab icon={<NetworkCheckIcon />} iconPosition="start" label="Peers" />
                    <Tab icon={<PlayArrowIcon />} iconPosition="start" label="Jobs" />
                    <Tab icon={<HistoryIcon />} iconPosition="start" label="History" />
                </Tabs>
            </Paper>
            {tab === 0 && <CompareTab peers={peers} />}
            {tab === 1 && <NewSyncTab peers={peers} domains={domains} />}
            {tab === 2 && <PeersTab peers={peers} reload={reloadPeers} />}
            {tab === 3 && <JobsTab jobs={jobs} reload={reloadJobs} />}
            {tab === 4 && <HistoryTab peers={peers} />}
        </Box>
    );
}
