/**
 * SaveGraphDialog Component
 * Dialog for saving GXE graphs to the knowledge base with label selection
 * Supports inheritance of parameters from parent graph for sub-graphs
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Box,
  Typography,
  Autocomplete,
  CircularProgress,
  Alert,
  Stack,
  IconButton,
  Divider
} from '@mui/material';
import {
  Save,
  X,
  Tag,
  Plus,
  Folder,
  FileCode,
  Atom,
  Wrench,
  Briefcase,
  Layers,
  GitBranch
} from 'lucide-react';
import {
  createGraph,
  getLabels,
  getNamespaces,
  GRAPH_TYPES,
  GRAPH_TYPE_INFO
} from '../../services/graphCatalog.service';

// Type icons mapping
const TYPE_ICONS = {
  atomic: Atom,
  tool: Wrench,
  business: Briefcase,
  composite: Layers,
  template: FileCode
};

const SaveGraphDialog = ({
  open,
  onClose,
  onSaved,
  graphData,      // { nodes, edges, requiredParams, taskText, parentContext }
  parentContext,  // { nodeId, nodeLabel, parentGraphInfo: { catalogGraphId, namespace, tags, type } }
  prefill         // { name, description, type, namespace, tags, version } — AI-suggested values
}) => {
  // Determine if this is a sub-graph
  const isSubGraph = Boolean(parentContext?.parentGraphInfo?.catalogGraphId);
  const parentGraphInfo = parentContext?.parentGraphInfo || {};

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState(GRAPH_TYPES.ATOMIC);
  const [namespace, setNamespace] = useState('default');
  const [selectedLabels, setSelectedLabels] = useState([]);
  const [newLabel, setNewLabel] = useState('');

  // Data state
  const [availableLabels, setAvailableLabels] = useState([]);
  const [availableNamespaces, setAvailableNamespaces] = useState([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Extract primitive values for dependency array to avoid infinite loops
  const parentNodeLabel = parentContext?.nodeLabel;
  const parentNodeDescription = parentContext?.nodeDescription;
  const parentNamespace = parentGraphInfo.namespace;
  const parentType = parentGraphInfo.type;
  const parentTags = parentGraphInfo.tags;
  const taskText = graphData?.taskText;

  // Initialize form with inherited values when dialog opens
  useEffect(() => {
    if (open) {
      loadData();

      // Priority: AI prefill > parent context > defaults
      if (prefill) {
        setName(prefill.name || '');
        setDescription(prefill.description || '');
        setType(prefill.type || GRAPH_TYPES.BUSINESS);
        setNamespace(prefill.namespace || 'default');
        setSelectedLabels([...(prefill.tags || [])]);
      } else if (isSubGraph) {
        // Inherit name from parent node
        setName(parentNodeLabel ? `${parentNodeLabel} - Implementation` : '');
        // Inherit namespace from parent graph
        setNamespace(parentNamespace || 'default');
        // Inherit type from parent graph
        setType(parentType || GRAPH_TYPES.ATOMIC);
        // Inherit labels from parent graph
        setSelectedLabels([...(parentTags || [])]);
      } else {
        // Reset for new graphs
        setName('');
        setType(GRAPH_TYPES.ATOMIC);
        setNamespace('default');
        setSelectedLabels([]);
      }

      // Pre-fill description (AI prefill already handled above)
      if (!prefill) {
        if (taskText) {
          setDescription(taskText);
        } else if (parentNodeDescription) {
          setDescription(parentNodeDescription);
        } else {
          setDescription('');
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskText, isSubGraph, parentNodeLabel, parentNodeDescription, parentNamespace, parentType, prefill]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [labelsData, namespacesData] = await Promise.all([
        getLabels(),
        getNamespaces()
      ]);
      setAvailableLabels(labelsData.map(l => l.label));
      setAvailableNamespaces(namespacesData.map(n => n.namespace));
    } catch (err) {
      console.error('Failed to load labels/namespaces:', err);
      setError('Failed to load options');
    } finally {
      setLoading(false);
    }
  };

  // Handle adding a new label
  const handleAddNewLabel = useCallback(() => {
    const trimmed = newLabel.trim().toLowerCase();
    if (trimmed && !selectedLabels.includes(trimmed)) {
      setSelectedLabels(prev => [...prev, trimmed]);
      // Add to available labels if not already there
      if (!availableLabels.includes(trimmed)) {
        setAvailableLabels(prev => [...prev, trimmed]);
      }
    }
    setNewLabel('');
  }, [newLabel, selectedLabels, availableLabels]);

  // Handle removing a label
  const handleRemoveLabel = useCallback((labelToRemove) => {
    setSelectedLabels(prev => prev.filter(l => l !== labelToRemove));
  }, []);

  // Handle save
  const handleSave = async () => {
    if (!name.trim()) {
      setError('Graph name is required');
      return;
    }

    if (!graphData?.nodes?.length) {
      setError('No graph data to save');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        type,
        namespace,
        tags: selectedLabels,
        nodes: graphData.nodes,
        edges: graphData.edges || [],
        requiredParams: graphData.requiredParams || {}
      };

      // Add parent relationship info for sub-graphs
      if (isSubGraph) {
        payload.parentGraphId = parentGraphInfo.catalogGraphId;
        payload.parentNodeId = parentContext?.nodeId;
      }

      const created = await createGraph(payload);

      // Reset form
      setName('');
      setDescription('');
      setType(GRAPH_TYPES.ATOMIC);
      setNamespace('default');
      setSelectedLabels([]);

      // Notify parent with created graph and relationship info
      onSaved?.({
        ...created,
        isSubGraph,
        parentGraphId: payload.parentGraphId,
        parentNodeId: payload.parentNodeId
      });
      onClose();
    } catch (err) {
      console.error('Failed to save graph:', err);
      setError(err.message || 'Failed to save graph');
    } finally {
      setSaving(false);
    }
  };

  // Handle dialog close
  const handleClose = () => {
    if (!saving) {
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#161b22',
          color: '#e6edf3',
          border: '1px solid #30363d'
        }
      }}
    >
      <DialogTitle sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderBottom: '1px solid #30363d',
        pb: 2
      }}>
        <Save size={20} className="text-green-400" />
        <span>{isSubGraph ? 'Save Sub-Graph' : 'Save Graph'} to Knowledge Base</span>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton
          size="small"
          onClick={handleClose}
          disabled={saving}
          sx={{ color: '#8b949e' }}
        >
          <X size={18} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ mt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2, bgcolor: '#3d1f1f', color: '#f85149' }}>
            {error}
          </Alert>
        )}

        {/* Sub-graph indicator */}
        {isSubGraph && (
          <Alert
            severity="info"
            icon={<GitBranch size={20} />}
            sx={{
              mb: 2,
              bgcolor: 'rgba(88, 166, 255, 0.1)',
              color: '#58a6ff',
              border: '1px solid rgba(88, 166, 255, 0.3)',
              '& .MuiAlert-icon': { color: '#58a6ff' }
            }}
          >
            <Typography variant="body2">
              This sub-graph will be linked to node <strong>"{parentContext?.nodeLabel}"</strong> in the parent graph.
              Parameters are inherited from the parent graph.
            </Typography>
          </Alert>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Stack spacing={3}>
            {/* Graph Name */}
            <TextField
              label="Graph Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              fullWidth
              required
              placeholder={isSubGraph ? "Name for the sub-graph implementation" : "Enter a descriptive name for the graph"}
              InputProps={{
                sx: { bgcolor: '#0d1117', color: '#e6edf3' }
              }}
              InputLabelProps={{
                sx: { color: '#8b949e' }
              }}
            />

            {/* Description */}
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={3}
              placeholder="Describe what this graph does"
              InputProps={{
                sx: { bgcolor: '#0d1117', color: '#e6edf3' }
              }}
              InputLabelProps={{
                sx: { color: '#8b949e' }
              }}
            />

            {/* Type Selection */}
            <FormControl fullWidth>
              <InputLabel sx={{ color: '#8b949e' }}>Graph Type</InputLabel>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                label="Graph Type"
                sx={{ bgcolor: '#0d1117', color: '#e6edf3' }}
              >
                {Object.entries(GRAPH_TYPE_INFO).map(([key, info]) => {
                  const Icon = TYPE_ICONS[key] || FileCode;
                  return (
                    <MenuItem key={key} value={key}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Icon size={16} />
                        <span>{info.label}</span>
                        {isSubGraph && key === parentGraphInfo.type && (
                          <Chip label="inherited" size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
                        )}
                      </Box>
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>

            {/* Namespace Selection */}
            <Autocomplete
              freeSolo
              options={availableNamespaces}
              value={namespace}
              onChange={(e, newValue) => setNamespace(newValue || 'default')}
              onInputChange={(e, newValue) => setNamespace(newValue || 'default')}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Namespace"
                  placeholder="Select or enter namespace"
                  InputProps={{
                    ...params.InputProps,
                    sx: { bgcolor: '#0d1117', color: '#e6edf3' },
                    startAdornment: (
                      <>
                        <Folder size={16} style={{ marginRight: 8, color: '#8b949e' }} />
                        {params.InputProps.startAdornment}
                      </>
                    )
                  }}
                  InputLabelProps={{
                    sx: { color: '#8b949e' }
                  }}
                  helperText={isSubGraph && namespace === parentGraphInfo.namespace ? 'Inherited from parent graph' : ''}
                />
              )}
            />

            <Divider sx={{ borderColor: '#30363d' }} />

            {/* Labels Section */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Tag size={16} />
                Labels (Tags)
                {isSubGraph && parentGraphInfo.tags?.length > 0 && (
                  <Chip
                    label={`${parentGraphInfo.tags.length} inherited`}
                    size="small"
                    sx={{ ml: 1, height: 18, fontSize: '0.65rem', bgcolor: '#238636' }}
                  />
                )}
              </Typography>

              {/* Selected Labels */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, minHeight: 32 }}>
                {selectedLabels.length === 0 ? (
                  <Typography variant="body2" sx={{ color: '#8b949e', fontStyle: 'italic' }}>
                    No labels selected
                  </Typography>
                ) : (
                  selectedLabels.map((label) => (
                    <Chip
                      key={label}
                      label={label}
                      onDelete={() => handleRemoveLabel(label)}
                      size="small"
                      sx={{
                        bgcolor: parentGraphInfo.tags?.includes(label) ? '#1f6feb' : '#238636',
                        color: '#fff',
                        '& .MuiChip-deleteIcon': {
                          color: 'rgba(255,255,255,0.7)',
                          '&:hover': { color: '#fff' }
                        }
                      }}
                    />
                  ))
                )}
              </Box>

              {/* Existing Labels Selection */}
              <Autocomplete
                multiple
                options={availableLabels.filter(l => !selectedLabels.includes(l))}
                value={[]}
                onChange={(e, newValues) => {
                  if (newValues.length > 0) {
                    const newLabel = newValues[newValues.length - 1];
                    if (!selectedLabels.includes(newLabel)) {
                      setSelectedLabels(prev => [...prev, newLabel]);
                    }
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Select from existing labels"
                    placeholder="Choose labels..."
                    InputProps={{
                      ...params.InputProps,
                      sx: { bgcolor: '#0d1117', color: '#e6edf3' }
                    }}
                    InputLabelProps={{
                      sx: { color: '#8b949e' }
                    }}
                  />
                )}
                renderOption={(props, option) => (
                  <li {...props}>
                    <Chip
                      label={option}
                      size="small"
                      sx={{ bgcolor: '#30363d', color: '#e6edf3' }}
                    />
                  </li>
                )}
                sx={{ mb: 2 }}
              />

              {/* Add New Label */}
              <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                  label="Add new label"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddNewLabel();
                    }
                  }}
                  placeholder="Type a new label"
                  size="small"
                  sx={{ flexGrow: 1 }}
                  InputProps={{
                    sx: { bgcolor: '#0d1117', color: '#e6edf3' }
                  }}
                  InputLabelProps={{
                    sx: { color: '#8b949e' }
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={handleAddNewLabel}
                  disabled={!newLabel.trim()}
                  startIcon={<Plus size={16} />}
                  sx={{
                    borderColor: '#30363d',
                    color: '#e6edf3',
                    '&:hover': { borderColor: '#58a6ff', bgcolor: 'rgba(88,166,255,0.1)' }
                  }}
                >
                  Add
                </Button>
              </Box>
            </Box>

            {/* Graph Preview Info */}
            <Box sx={{ p: 2, bgcolor: '#0d1117', borderRadius: 1, border: '1px solid #30363d' }}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: '#8b949e' }}>
                Graph Preview
              </Typography>
              <Typography variant="body2">
                Nodes: <strong>{graphData?.nodes?.length || 0}</strong>
              </Typography>
              <Typography variant="body2">
                Edges: <strong>{graphData?.edges?.length || 0}</strong>
              </Typography>
              {isSubGraph && (
                <Typography variant="body2" sx={{ mt: 1, color: '#58a6ff' }}>
                  <GitBranch size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Will be linked to parent node: <strong>{parentContext?.nodeId}</strong>
                </Typography>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #30363d' }}>
        <Button
          onClick={handleClose}
          disabled={saving}
          sx={{ color: '#8b949e' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || loading || !name.trim()}
          startIcon={saving ? <CircularProgress size={16} /> : <Save size={16} />}
          sx={{
            bgcolor: '#238636',
            '&:hover': { bgcolor: '#2ea043' },
            '&:disabled': { bgcolor: '#21262d', color: '#484f58' }
          }}
        >
          {saving ? 'Saving...' : (isSubGraph ? 'Save Sub-Graph' : 'Save Graph')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SaveGraphDialog;
