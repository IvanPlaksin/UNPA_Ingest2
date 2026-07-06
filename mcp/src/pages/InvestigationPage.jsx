import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Stack, Chip, CircularProgress, Alert,
  Card, CardContent, CardActionArea, Grid, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Tooltip, IconButton,
} from '@mui/material';
import { Search, Plus, X, Clock, CheckCircle, Archive, FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useInvestigationStore } from '../stores/investigationStore';

const STATUS_COLOR = {
  ACTIVE: 'success',
  CLOSED: 'default',
  ARCHIVED: 'warning',
};

const STATUS_ICON = {
  ACTIVE: <Clock size={14} />,
  CLOSED: <CheckCircle size={14} />,
  ARCHIVED: <Archive size={14} />,
};

function SessionCard({ session, onClose }) {
  const navigate = useNavigate();
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardActionArea sx={{ flex: 1 }} onClick={() => navigate(`/investigation/${session.sessionId}`)}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ pr: 1 }}>
              {session.name}
            </Typography>
            <Chip
              size="small"
              icon={STATUS_ICON[session.status]}
              label={session.status}
              color={STATUS_COLOR[session.status] || 'default'}
            />
          </Stack>
          {session.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {session.description}
            </Typography>
          )}
          <Typography variant="caption" color="text.disabled">
            {new Date(session.createdAt).toLocaleString()}
          </Typography>
        </CardContent>
      </CardActionArea>
      {session.status === 'ACTIVE' && (
        <Box sx={{ px: 2, pb: 1 }}>
          <Tooltip title="Close session">
            <IconButton size="small" onClick={() => onClose(session.sessionId)}>
              <X size={16} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </Card>
  );
}

function CreateSessionDialog({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate({ name: name.trim(), description: description.trim() });
      setName('');
      setDescription('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>New Investigation Session</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            required
            autoFocus
          />
          <TextField
            label="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
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

export default function InvestigationPage() {
  const {
    sessions, loading, error,
    fetchSessions, createSession, closeSession,
    createDialogOpen, setCreateDialogOpen, clearError,
  } = useInvestigationStore();

  const [filter, setFilter] = useState('ACTIVE');

  useEffect(() => {
    fetchSessions({ status: filter || undefined });
  }, [filter]);

  const filteredSessions = filter
    ? sessions.filter(s => s.status === filter)
    : sessions;

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <FlaskConical size={28} />
          <Box>
            <Typography variant="h5" fontWeight={700}>Investigation</Typography>
            <Typography variant="body2" color="text.secondary">
              Reproducible graph-programs for knowledge exploration
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setCreateDialogOpen(true)}
        >
          New Session
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>{error}</Alert>
      )}

      {/* Status filter */}
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        {['ACTIVE', 'CLOSED', 'ARCHIVED', ''].map(s => (
          <Chip
            key={s || 'all'}
            label={s || 'All'}
            variant={filter === s ? 'filled' : 'outlined'}
            color={filter === s ? 'primary' : 'default'}
            onClick={() => setFilter(s)}
          />
        ))}
      </Stack>

      {/* Sessions grid */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : filteredSessions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Search size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <Typography color="text.secondary">
            No {filter ? filter.toLowerCase() : ''} investigation sessions
          </Typography>
          <Button
            variant="outlined"
            startIcon={<Plus size={16} />}
            sx={{ mt: 2 }}
            onClick={() => setCreateDialogOpen(true)}
          >
            Start your first investigation
          </Button>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {filteredSessions.map(session => (
            <Grid item xs={12} sm={6} md={4} key={session.sessionId}>
              <SessionCard session={session} onClose={closeSession} />
            </Grid>
          ))}
        </Grid>
      )}

      <CreateSessionDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={createSession}
      />
    </Box>
  );
}
