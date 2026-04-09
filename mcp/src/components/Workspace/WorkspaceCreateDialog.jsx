import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, MenuItem, Stack, Chip, Box, Typography } from '@mui/material';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const DOMAINS = ['IT', 'HR', 'FINANCE', 'LEGAL', 'PROCUREMENT', 'LOGISTICS', 'ADMINISTRATION', 'OTHER'];

const WorkspaceCreateDialog = () => {
  const { createDialogOpen, setCreateDialogOpen, createWorkspace, loading } = useWorkspaceStore();
  const [form, setForm] = useState({ name: '', description: '', domain: '', tagInput: '', tags: [] });
  const [error, setError] = useState('');

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && form.tagInput.trim()) {
      e.preventDefault();
      if (!form.tags.includes(form.tagInput.trim())) {
        setForm({ ...form, tags: [...form.tags, form.tagInput.trim()], tagInput: '' });
      }
    }
  };

  const handleRemoveTag = (tag) => {
    setForm({ ...form, tags: form.tags.filter(t => t !== tag) });
  };

  const handleCreate = async () => {
    if (!form.name.trim() || form.name.length < 3) {
      setError('Name must be at least 3 characters');
      return;
    }
    setError('');
    try {
      await createWorkspace({
        name: form.name.trim(),
        description: form.description.trim(),
        domain: form.domain,
        tags: form.tags
      });
      setForm({ name: '', description: '', domain: '', tagInput: '', tags: [] });
    } catch (err) {
      setError(err.message || 'Failed to create workspace');
    }
  };

  const handleClose = () => {
    setCreateDialogOpen(false);
    setForm({ name: '', description: '', domain: '', tagInput: '', tags: [] });
    setError('');
  };

  return (
    <Dialog open={createDialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create WorkSpace</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <TextField
            label="Name"
            value={form.name}
            onChange={handleChange('name')}
            required
            autoFocus
            fullWidth
            helperText="Display name for the workspace"
            error={!!error && !form.name}
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={handleChange('description')}
            fullWidth
            multiline
            rows={3}
            helperText="Optional description of workspace purpose"
          />
          <TextField
            label="Domain"
            value={form.domain}
            onChange={handleChange('domain')}
            select
            fullWidth
            helperText="Knowledge domain"
          >
            <MenuItem value="">None</MenuItem>
            {DOMAINS.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
          <Box>
            <TextField
              label="Tags"
              value={form.tagInput}
              onChange={handleChange('tagInput')}
              onKeyDown={handleAddTag}
              fullWidth
              helperText="Press Enter to add tags"
              size="small"
            />
            {form.tags.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 1, flexWrap: 'wrap', gap: 0.5 }}>
                {form.tags.map(tag => (
                  <Chip key={tag} label={tag} size="small" onDelete={() => handleRemoveTag(tag)} />
                ))}
              </Stack>
            )}
          </Box>
          {error && (
            <Typography color="error" variant="body2">{error}</Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} color="inherit">Cancel</Button>
        <Button onClick={handleCreate} variant="contained" disabled={loading || !form.name.trim()}>
          {loading ? 'Creating...' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WorkspaceCreateDialog;
