import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Stack, Chip, Grid, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  InputAdornment,
} from '@mui/material';
import { Plus, Search, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { listMethodologies, createMethodology, setMethodologyStatus } from '../../services/methodology.api';
import MethodologyCard from './MethodologyCard';

const STATUSES = ['', 'DRAFT', 'ACTIVE', 'DEPRECATED'];

function CreateDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [userCase, setUserCase] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const reset = () => { setName(''); setUserCase(''); setDescription(''); setError(null); };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const m = await createMethodology({ name: name.trim(), userCase: userCase.trim(), description: description.trim() });
      reset();
      onCreate(m);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle>New Methodology</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />
          <TextField
            label="Use case (short headline)"
            value={userCase}
            onChange={e => setUserCase(e.target.value)}
            fullWidth
            placeholder="e.g. Research a UN service or programme"
          />
          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => { reset(); onClose(); }} disabled={loading}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!name.trim() || loading}
          startIcon={loading ? <CircularProgress size={16} /> : null}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function MethodologyLibraryPage() {
  const navigate = useNavigate();
  const [methodologies, setMethodologies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMethodologies({ status: statusFilter || null });
      setMethodologies(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleCreate = (m) => {
    setCreateOpen(false);
    navigate(`/investigation/methodologies/${m.id}/edit`);
  };

  const handleStatusChange = async (id, currentStatus) => {
    const next = currentStatus === 'DRAFT' ? 'ACTIVE' : currentStatus === 'ACTIVE' ? 'DEPRECATED' : 'DRAFT';
    try {
      await setMethodologyStatus(id, next);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const filtered = methodologies.filter(m => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (m.name || '').toLowerCase().includes(q) || (m.userCase || '').toLowerCase().includes(q);
  });

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <BookOpen size={28} />
          <Box>
            <Typography variant="h5" fontWeight={700}>Methodology Library</Typography>
            <Typography variant="body2" color="text.secondary">
              Reusable graph-backed investigation recipes
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setCreateOpen(true)}
        >
          New Methodology
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
      )}

      {/* Filters */}
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1}>
          {STATUSES.map(s => (
            <Chip
              key={s || 'all'}
              label={s || 'All'}
              variant={statusFilter === s ? 'filled' : 'outlined'}
              color={statusFilter === s ? 'primary' : 'default'}
              onClick={() => setStatusFilter(s)}
            />
          ))}
        </Stack>
        <TextField
          size="small"
          placeholder="Filter by name or use case…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} /></InputAdornment> }}
          sx={{ minWidth: 240 }}
        />
      </Stack>

      {/* Grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <BookOpen size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <Typography color="text.secondary">
            No methodologies found
          </Typography>
          <Button
            variant="outlined"
            startIcon={<Plus size={16} />}
            sx={{ mt: 2 }}
            onClick={() => setCreateOpen(true)}
          >
            Create the first one
          </Button>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {filtered.map(m => (
            <Grid item xs={12} sm={6} md={4} key={m.id}>
              <MethodologyCard methodology={m} onStatusChange={handleStatusChange} />
            </Grid>
          ))}
        </Grid>
      )}

      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreate}
      />
    </Box>
  );
}
