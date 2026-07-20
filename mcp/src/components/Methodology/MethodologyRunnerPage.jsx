import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Button, Alert, CircularProgress,
  Paper, Divider, Select, MenuItem, FormControl, InputLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Chip,
} from '@mui/material';
import { ArrowLeft, PlayCircle, BookOpen, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMethodology, executeMethodology, evaluateMethodology } from '../../services/methodology.api';
import ParameterForm from './ParameterForm';
import ExecutionProgress from './ExecutionProgress';
import ProposedArtifactPreview from './ProposedArtifactPreview';

const API = '/api/v1/investigation';

async function fetchActiveSessions() {
  const res = await fetch(`${API}/sessions?status=ACTIVE&parentSessionId=null&limit=50`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data || [];
}

async function createSession(name, description = '') {
  const res = await fetch(`${API}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
}

function NewSessionDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const s = await createSession(name.trim());
      setName('');
      onCreate(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>New Investigation Session</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        <TextField
          label="Session name"
          value={name}
          onChange={e => setName(e.target.value)}
          fullWidth
          autoFocus
          sx={{ mt: 1 }}
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button onClick={submit} variant="contained" disabled={!name.trim() || loading}
          startIcon={loading ? <CircularProgress size={14} /> : null}>
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function MethodologyRunnerPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [methodology, setMethodology] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [parameters, setParameters] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [runStatus, setRunStatus] = useState(null); // null | 'running' | 'completed' | 'failed'
  const [runError, setRunError] = useState(null);
  const [result, setResult] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);

  useEffect(() => { loadAll(); }, [id]);

  async function loadAll() {
    setLoadError(null);
    try {
      const [m, slist] = await Promise.all([
        getMethodology(id),
        fetchActiveSessions(),
      ]);
      if (!m) { setLoadError('Methodology not found'); return; }
      setMethodology(m);
      setSessions(slist);
      // Pre-fill defaults
      const defaults = {};
      Object.entries(m.parameterSchema || {}).forEach(([k, def]) => {
        if (def.default !== undefined) defaults[k] = def.default;
      });
      setParameters(defaults);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  const handleNewSession = (s) => {
    setSessions(prev => [s, ...prev]);
    setSessionId(s.sessionId);
    setNewSessionOpen(false);
  };

  const run = async () => {
    if (!sessionId) return;
    setRunStatus('running');
    setRunError(null);
    setResult(null);
    setEvaluation(null);
    try {
      const res = await executeMethodology(id, { parameters, sessionId });
      setResult(res);
      setRunStatus('completed');
      // Auto-evaluate
      if (methodology?.qualityRubric && Object.keys(methodology.qualityRubric).length > 0) {
        try {
          const content = res.artifact?.content?.executionResult || {};
          const ev = await evaluateMethodology(id, content);
          setEvaluation(ev);
        } catch { /* evaluation is non-fatal */ }
      }
    } catch (e) {
      setRunError(e.message);
      setRunStatus('failed');
    }
  };

  const reset = () => {
    setRunStatus(null);
    setResult(null);
    setEvaluation(null);
    setRunError(null);
  };

  if (loadError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{loadError}</Alert>
      </Box>
    );
  }

  if (!methodology) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const canRun = !!sessionId && methodology.graphId && methodology.status !== 'DEPRECATED';

  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate('/investigation/methodologies')}>
          Library
        </Button>
        <BookOpen size={22} />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" fontWeight={700}>{methodology.name}</Typography>
          {methodology.userCase && (
            <Typography variant="caption" color="text.secondary">{methodology.userCase}</Typography>
          )}
        </Box>
        <Chip size="small" label={`v${methodology.version}`} variant="outlined" />
        <Chip size="small" label={methodology.status} color={methodology.status === 'ACTIVE' ? 'success' : 'default'} />
      </Stack>

      {!methodology.graphId && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          This methodology has no graph linked. Open the editor to assign one.
          <Button size="small" sx={{ ml: 1 }} onClick={() => navigate(`/investigation/methodologies/${id}/edit`)}>Edit</Button>
        </Alert>
      )}

      {runStatus !== 'completed' && (
        <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
          {/* Session selector */}
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Investigation session</Typography>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Select session</InputLabel>
              <Select
                label="Select session"
                value={sessionId}
                onChange={e => setSessionId(e.target.value)}
              >
                {sessions.length === 0 && (
                  <MenuItem disabled value="">No active sessions — create one</MenuItem>
                )}
                {sessions.map(s => (
                  <MenuItem key={s.sessionId} value={s.sessionId}>
                    {s.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              startIcon={<Plus size={16} />}
              onClick={() => setNewSessionOpen(true)}
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              New
            </Button>
          </Stack>

          <Divider sx={{ mb: 3 }} />

          {/* Parameters */}
          <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Parameters</Typography>
          <ParameterForm
            schema={methodology.parameterSchema || {}}
            values={parameters}
            onChange={setParameters}
          />
        </Paper>
      )}

      {/* Execution progress / error */}
      {runStatus === 'running' && (
        <ExecutionProgress status="running" methodology={methodology} />
      )}
      {runStatus === 'failed' && runError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={reset}>{runError}</Alert>
      )}

      {/* Result */}
      {runStatus === 'completed' && result && (
        <ProposedArtifactPreview result={result} evaluation={evaluation} onReset={reset} />
      )}

      {/* Run button */}
      {runStatus !== 'completed' && (
        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
          <Button
            variant="contained"
            size="large"
            startIcon={runStatus === 'running' ? <CircularProgress size={18} /> : <PlayCircle size={20} />}
            onClick={run}
            disabled={!canRun || runStatus === 'running'}
          >
            {runStatus === 'running' ? 'Running…' : 'Run Methodology'}
          </Button>
        </Stack>
      )}

      <NewSessionDialog
        open={newSessionOpen}
        onClose={() => setNewSessionOpen(false)}
        onCreate={handleNewSession}
      />
    </Box>
  );
}
