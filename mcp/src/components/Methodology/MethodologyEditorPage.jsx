import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Stack, Button, TextField, Alert, CircularProgress,
  Divider, Chip, Paper, Select, MenuItem, FormControl, InputLabel, Tabs, Tab,
} from '@mui/material';
import { ArrowLeft, Save, PlayCircle, BookOpen } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { getMethodology, updateMethodology, setMethodologyStatus } from '../../services/methodology.api';
import ParameterSchemaBuilder from './ParameterSchemaBuilder';
import QualityRubricEditor from './QualityRubricEditor';
import GraphSelector from './GraphSelector';
import AIGraphBuilderDialog from './AIGraphBuilderDialog';

const STATUS_OPTIONS = ['DRAFT', 'ACTIVE', 'DEPRECATED'];
const STATUS_COLOR = { DRAFT: 'default', ACTIVE: 'success', DEPRECATED: 'error' };

export default function MethodologyEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState(0);
  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);

  const [name, setName] = useState('');
  const [userCase, setUserCase] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [status, setStatus] = useState('DRAFT');
  const [graphId, setGraphId] = useState(null);
  const [parameterSchema, setParameterSchema] = useState({});
  const [qualityRubric, setQualityRubric] = useState({});

  useEffect(() => {
    load();
  }, [id]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const m = await getMethodology(id);
      if (!m) { setError('Methodology not found'); return; }
      setName(m.name || '');
      setUserCase(m.userCase || '');
      setDescription(m.description || '');
      setVersion(m.version || '1.0.0');
      setStatus(m.status || 'DRAFT');
      setGraphId(m.graphId || null);
      setParameterSchema(m.parameterSchema || {});
      setQualityRubric(m.qualityRubric || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateMethodology(id, { name, userCase, description, version, graphId, parameterSchema, qualityRubric });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (newStatus) => {
    try {
      await setMethodologyStatus(id, newStatus);
      setStatus(newStatus);
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 960, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate('/investigation/methodologies')}>
          Library
        </Button>
        <BookOpen size={22} />
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>{name || 'Methodology Editor'}</Typography>
        <Chip size="small" label={status} color={STATUS_COLOR[status] || 'default'} />
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {saved && <Alert severity="success" sx={{ mb: 2 }}>Saved successfully</Alert>}

      {/* Status controls */}
      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="subtitle2" sx={{ mr: 1 }}>Status:</Typography>
          {STATUS_OPTIONS.map(s => (
            <Button
              key={s}
              size="small"
              variant={status === s ? 'contained' : 'outlined'}
              color={STATUS_COLOR[s] || 'primary'}
              onClick={() => changeStatus(s)}
              disabled={status === s}
            >
              {s}
            </Button>
          ))}
          <Box sx={{ flex: 1 }} />
          {graphId && status === 'ACTIVE' && (
            <Button
              variant="outlined"
              color="primary"
              startIcon={<PlayCircle size={16} />}
              onClick={() => navigate(`/investigation/methodologies/${id}/run`)}
            >
              Run
            </Button>
          )}
        </Stack>
      </Paper>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Details" />
        <Tab label="Parameters" />
        <Tab label="Quality Rubric" />
        <Tab label="Graph" />
      </Tabs>

      {/* Tab: Details */}
      {tab === 0 && (
        <Stack spacing={2.5}>
          <TextField
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            required
          />
          <TextField
            label="Use case"
            value={userCase}
            onChange={e => setUserCase(e.target.value)}
            fullWidth
            placeholder="Short headline: what does this methodology accomplish?"
          />
          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={4}
          />
          <TextField
            label="Version"
            value={version}
            onChange={e => setVersion(e.target.value)}
            sx={{ maxWidth: 160 }}
            placeholder="1.0.0"
          />
        </Stack>
      )}

      {/* Tab: Parameters */}
      {tab === 1 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Define parameters the user must supply when running this methodology.
            These are injected as the graph's <code>input.*</code> values.
          </Typography>
          <ParameterSchemaBuilder value={parameterSchema} onChange={setParameterSchema} />
        </Box>
      )}

      {/* Tab: Quality Rubric */}
      {tab === 2 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Set quality gates that are automatically checked after execution.
            A violation does not block the artifact, but is reported in the results.
          </Typography>
          <QualityRubricEditor value={qualityRubric} onChange={setQualityRubric} />
        </Box>
      )}

      {/* Tab: Graph */}
      {tab === 3 && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select the GXE graph that implements this methodology's logic.
            Nodes with type <code>investigation.*</code> are available as executors.
          </Typography>
          <GraphSelector
          value={graphId}
          onChange={setGraphId}
          onCreateNew={() => setAiBuilderOpen(true)}
        />
        </Box>
      )}

      <Divider sx={{ my: 3 }} />

      <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
        <Button onClick={() => navigate('/investigation/methodologies')}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} /> : <Save size={16} />}
          onClick={save}
          disabled={saving || !name.trim()}
        >
          Save
        </Button>
      </Stack>

      <AIGraphBuilderDialog
        open={aiBuilderOpen}
        onClose={() => setAiBuilderOpen(false)}
        methodologyName={name}
        onGraphSaved={(entryId, graphNameLabel) => {
          setGraphId(entryId);
          setAiBuilderOpen(false);
          // Auto-save so the graphId persists
          setSaved(false);
        }}
      />
    </Box>
  );
}
