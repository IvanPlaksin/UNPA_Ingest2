/**
 * IndexerControls — compact, self-contained control bar for the background
 * document indexer. Renders as a single horizontal line (state + start/pause/
 * resume/stop/refresh + live worker count) so it fits in the page header without
 * taking vertical space. Polls /status independently.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Stack, Chip, IconButton, Tooltip, TextField, Typography, Box, CircularProgress,
} from '@mui/material';
import { Activity, Play, Pause, Square, RefreshCw } from 'lucide-react';
import { getIndexerStatus, controlIndexer, setIndexerConfig } from '../../../services/documentIndex.service';

const STATE_META = {
  RUNNING: { color: 'success', label: 'Running' },
  PAUSED:  { color: 'warning', label: 'Paused' },
  STOPPED: { color: 'error',   label: 'Stopped' },
  IDLE:    { color: 'default', label: 'Idle' },
};

export default function IndexerControls() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [workers, setWorkers] = useState('');
  const workersInit = useRef(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const st = await getIndexerStatus();
      setStatus(st.data);
      if (!workersInit.current && st.data?.stats?.concurrency != null) {
        setWorkers(String(st.data.stats.concurrency)); workersInit.current = true;
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); timer.current = setInterval(load, 4000); return () => clearInterval(timer.current); }, [load]);

  const state = status?.state || 'IDLE';
  const concurrency = status?.stats?.concurrency;
  const active = status?.stats?.activeCount || 0;

  const control = async (action) => {
    setBusy(true);
    try { await controlIndexer(action); await load(); } catch { /* ignore */ }
    setBusy(false);
  };
  const applyWorkers = async () => {
    const n = parseInt(workers, 10);
    if (!Number.isFinite(n) || n < 1) return;
    try { const r = await setIndexerConfig({ concurrency: n }); if (r?.data?.status) setStatus(r.data.status); }
    catch { /* ignore */ }
  };

  const m = STATE_META[state] || STATE_META.IDLE;
  const dirty = concurrency != null && String(concurrency) !== String(workers);

  return (
    <Stack direction="row" spacing={0.5} alignItems="center"
      sx={{ px: 1, py: 0.25, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
      <Activity size={15} style={{ opacity: 0.6 }} />
      <Typography variant="caption" fontWeight={700}
        sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem', display: { xs: 'none', md: 'block' } }}>
        Indexer
      </Typography>
      <Chip label={m.label} color={m.color} size="small" sx={{ height: 20, fontSize: '0.62rem' }} />
      {active > 0 && (
        <Tooltip title="Active page-tasks in the pool">
          <Chip icon={<CircularProgress size={9} />} label={`${active}/${concurrency}`} size="small" variant="outlined"
            sx={{ height: 20, fontSize: '0.6rem' }} />
        </Tooltip>
      )}
      <Box sx={{ width: '1px', height: 20, bgcolor: 'divider', mx: 0.25 }} />
      <Tooltip title="Start"><span><IconButton size="small" disabled={busy || state === 'RUNNING'} onClick={() => control('start')}><Play size={15} /></IconButton></span></Tooltip>
      <Tooltip title="Pause"><span><IconButton size="small" disabled={busy || state !== 'RUNNING'} onClick={() => control('pause')}><Pause size={15} /></IconButton></span></Tooltip>
      <Tooltip title="Resume"><span><IconButton size="small" disabled={busy || state !== 'PAUSED'} onClick={() => control('resume')}><Play size={15} /></IconButton></span></Tooltip>
      <Tooltip title="Stop"><span><IconButton size="small" disabled={busy || ['STOPPED', 'IDLE'].includes(state)} onClick={() => control('stop')}><Square size={15} /></IconButton></span></Tooltip>
      <Tooltip title="Refresh"><IconButton size="small" onClick={load}><RefreshCw size={14} /></IconButton></Tooltip>
      <Box sx={{ width: '1px', height: 20, bgcolor: 'divider', mx: 0.25 }} />
      <Tooltip title="Number of parallel indexing workers — press Enter to apply instantly">
        <TextField
          label="Workers" size="small" type="number" value={workers}
          onChange={e => setWorkers(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyWorkers(); } }}
          onBlur={applyWorkers}
          inputProps={{ min: 1 }}
          sx={{ width: 84, '& input': { py: 0.4, fontSize: '0.8rem' } }}
        />
      </Tooltip>
      {dirty && <Typography variant="caption" color="warning.main" title={`${concurrency} now`}>↵</Typography>}
    </Stack>
  );
}
