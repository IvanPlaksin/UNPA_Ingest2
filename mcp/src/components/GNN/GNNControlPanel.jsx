/**
 * GNN Control Panel Component
 * Управление GNN моделями и просмотр предсказаний
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  Chip,
  LinearProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tooltip,
  CircularProgress,
  Collapse,
  TextField,
} from '@mui/material';
import {
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  CloudUpload as UploadIcon,
  Timeline as TimelineIcon,
  Hub as HubIcon,
  Category as CategoryIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';

import { gnnService } from '../../services/gnn.service';

// Status indicator component
const StatusIndicator = ({ status }) => {
  const getColor = () => {
    switch (status) {
      case 'loaded': return 'success';
      case 'loading': return 'warning';
      case 'error': return 'error';
      default: return 'default';
    }
  };

  const getIcon = () => {
    switch (status) {
      case 'loaded': return <CheckIcon fontSize="small" />;
      case 'loading': return <CircularProgress size={16} />;
      case 'error': return <ErrorIcon fontSize="small" />;
      default: return <WarningIcon fontSize="small" />;
    }
  };

  return (
    <Chip
      icon={getIcon()}
      label={status || 'Not loaded'}
      color={getColor()}
      size="small"
      variant="outlined"
    />
  );
};

const GNNControlPanel = ({ onPredictionsReady, onError }) => {
  // State
  const [modelStatus, setModelStatus] = useState({
    link_model: null,
    classification_model: null,
    graph_loaded: false,
  });
  const [graphStats, setGraphStats] = useState(null);
  const [nodeTypes, setNodeTypes] = useState([]);
  const [edgeTypes, setEdgeTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Link prediction settings
  const [linkSettings, setLinkSettings] = useState({
    sourceType: '',
    targetType: '',
    topK: 100,
    minConfidence: 0.7,
    excludeExisting: true,
  });

  // Classification settings
  const [classSettings, setClassSettings] = useState({
    minConfidence: 0.5,
    limit: 1000,
  });

  // Results
  const [predictions, setPredictions] = useState([]);
  const [classifications, setClassifications] = useState([]);

  // UI state
  const [expandedSection, setExpandedSection] = useState('link');
  const [trainingJob, setTrainingJob] = useState(null);

  // Load initial data
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);

    try {
      const [status, stats, types, edges] = await Promise.all([
        gnnService.getModelStatus(),
        gnnService.getGraphStats(),
        gnnService.getNodeTypes(),
        gnnService.getEdgeTypes(),
      ]);

      setModelStatus(status);
      setGraphStats(stats);
      setNodeTypes(types.node_types || []);
      setEdgeTypes(edges.edge_types || []);

      // Set default types
      if (types.node_types?.length > 0) {
        setLinkSettings((prev) => ({
          ...prev,
          sourceType: prev.sourceType || types.node_types[0],
          targetType: prev.targetType || types.node_types[0],
        }));
      }
    } catch (err) {
      setError(err.message);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  // Link Prediction
  const runLinkPrediction = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await gnnService.predictLinks(
        linkSettings.sourceType,
        linkSettings.targetType,
        {
          topK: linkSettings.topK,
          minConfidence: linkSettings.minConfidence,
          excludeExisting: linkSettings.excludeExisting,
        }
      );

      setPredictions(result.predictions || []);
      onPredictionsReady?.({
        type: 'link',
        predictions: result.predictions,
        settings: linkSettings,
      });
    } catch (err) {
      setError(err.message);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  // Node Classification
  const runClassification = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await gnnService.classifyAll(
        classSettings.minConfidence,
        classSettings.limit
      );

      setClassifications(result.classifications || []);
      onPredictionsReady?.({
        type: 'classification',
        classifications: result.classifications,
        settings: classSettings,
      });
    } catch (err) {
      setError(err.message);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  };

  // Write predictions to graph
  const writePredictions = async () => {
    if (predictions.length === 0) return;

    setLoading(true);
    try {
      await gnnService.writePredictions(predictions, 'PREDICTED_LINK');
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Start training
  const startTraining = async (task) => {
    setLoading(true);
    try {
      const result = await gnnService.startTraining(task, 100, 0.001);
      setTrainingJob(result.job_id);

      // Poll for status
      pollTrainingStatus(result.job_id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pollTrainingStatus = async (jobId) => {
    try {
      const status = await gnnService.getTrainingStatus(jobId);

      if (status.status === 'running') {
        setTimeout(() => pollTrainingStatus(jobId), 5000);
      } else {
        setTrainingJob(null);
        loadStatus();
      }
    } catch (err) {
      console.error('Training status error:', err);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" component="h2">
          <HubIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          GNN Control Panel
        </Typography>
        <Button
          startIcon={<RefreshIcon />}
          onClick={loadStatus}
          disabled={loading}
        >
          Refresh
        </Button>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Status Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Model Status */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary">
                Link Model
              </Typography>
              <StatusIndicator status={modelStatus.link_model} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary">
                Classification Model
              </Typography>
              <StatusIndicator status={modelStatus.classification_model} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle2" color="textSecondary">
                Graph
              </Typography>
              {graphStats ? (
                <Typography variant="body2">
                  {graphStats.num_nodes} nodes, {graphStats.num_edges} edges
                </Typography>
              ) : (
                <Typography variant="body2" color="textSecondary">
                  Not loaded
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Link Prediction Section */}
      <Paper sx={{ mb: 2 }}>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
          }}
          onClick={() =>
            setExpandedSection(expandedSection === 'link' ? '' : 'link')
          }
        >
          <Typography variant="h6">
            <TimelineIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Link Prediction
          </Typography>
          {expandedSection === 'link' ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </Box>

        <Collapse in={expandedSection === 'link'}>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Source Type</InputLabel>
                  <Select
                    value={linkSettings.sourceType}
                    label="Source Type"
                    onChange={(e) =>
                      setLinkSettings((prev) => ({
                        ...prev,
                        sourceType: e.target.value,
                      }))
                    }
                  >
                    {nodeTypes.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Target Type</InputLabel>
                  <Select
                    value={linkSettings.targetType}
                    label="Target Type"
                    onChange={(e) =>
                      setLinkSettings((prev) => ({
                        ...prev,
                        targetType: e.target.value,
                      }))
                    }
                  >
                    {nodeTypes.map((type) => (
                      <MenuItem key={type} value={type}>
                        {type}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={4}>
                <Typography gutterBottom>Top K: {linkSettings.topK}</Typography>
                <Slider
                  value={linkSettings.topK}
                  onChange={(e, v) =>
                    setLinkSettings((prev) => ({ ...prev, topK: v }))
                  }
                  min={10}
                  max={500}
                  step={10}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <Typography gutterBottom>
                  Min Confidence: {linkSettings.minConfidence}
                </Typography>
                <Slider
                  value={linkSettings.minConfidence}
                  onChange={(e, v) =>
                    setLinkSettings((prev) => ({ ...prev, minConfidence: v }))
                  }
                  min={0.1}
                  max={0.99}
                  step={0.05}
                />
              </Grid>

              <Grid item xs={12} md={4}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={linkSettings.excludeExisting}
                      onChange={(e) =>
                        setLinkSettings((prev) => ({
                          ...prev,
                          excludeExisting: e.target.checked,
                        }))
                      }
                    />
                  }
                  label="Exclude Existing"
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<PlayIcon />}
                onClick={runLinkPrediction}
                disabled={loading || !modelStatus.link_model}
              >
                Predict Links
              </Button>

              {predictions.length > 0 && (
                <Button
                  variant="outlined"
                  startIcon={<UploadIcon />}
                  onClick={writePredictions}
                  disabled={loading}
                >
                  Write to Graph ({predictions.length})
                </Button>
              )}
            </Box>

            {/* Results Preview */}
            {predictions.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2">
                  Top Predictions ({predictions.length} total)
                </Typography>
                <List dense>
                  {predictions.slice(0, 5).map((pred, idx) => (
                    <ListItem key={idx}>
                      <ListItemText
                        primary={`${pred.source_id} → ${pred.target_id}`}
                        secondary={`Confidence: ${(pred.confidence * 100).toFixed(1)}%`}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Classification Section */}
      <Paper sx={{ mb: 2 }}>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
          }}
          onClick={() =>
            setExpandedSection(expandedSection === 'class' ? '' : 'class')
          }
        >
          <Typography variant="h6">
            <CategoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Node Classification
          </Typography>
          {expandedSection === 'class' ? (
            <ExpandLessIcon />
          ) : (
            <ExpandMoreIcon />
          )}
        </Box>

        <Collapse in={expandedSection === 'class'}>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography gutterBottom>
                  Min Confidence: {classSettings.minConfidence}
                </Typography>
                <Slider
                  value={classSettings.minConfidence}
                  onChange={(e, v) =>
                    setClassSettings((prev) => ({ ...prev, minConfidence: v }))
                  }
                  min={0.1}
                  max={0.99}
                  step={0.05}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  size="small"
                  label="Limit"
                  type="number"
                  value={classSettings.limit}
                  onChange={(e) =>
                    setClassSettings((prev) => ({
                      ...prev,
                      limit: parseInt(e.target.value) || 1000,
                    }))
                  }
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                startIcon={<PlayIcon />}
                onClick={runClassification}
                disabled={loading || !modelStatus.classification_model}
              >
                Classify Nodes
              </Button>
            </Box>

            {/* Classification Results */}
            {classifications.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2">
                  Classifications ({classifications.length} total)
                </Typography>
                <List dense>
                  {classifications.slice(0, 5).map((cls, idx) => (
                    <ListItem key={idx}>
                      <ListItemText
                        primary={cls.node_id}
                        secondary={`${cls.predicted_class} (${(cls.confidence * 100).toFixed(1)}%)`}
                      />
                      <Chip
                        label={cls.predicted_class}
                        size="small"
                        color="primary"
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>

      {/* Training Section */}
      <Paper>
        <Box
          sx={{
            p: 2,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
          }}
          onClick={() =>
            setExpandedSection(expandedSection === 'train' ? '' : 'train')
          }
        >
          <Typography variant="h6">
            <SettingsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Training
          </Typography>
          {expandedSection === 'train' ? (
            <ExpandLessIcon />
          ) : (
            <ExpandMoreIcon />
          )}
        </Box>

        <Collapse in={expandedSection === 'train'}>
          <Divider />
          <Box sx={{ p: 2 }}>
            {trainingJob ? (
              <Alert severity="info">
                Training in progress (Job: {trainingJob})
                <LinearProgress sx={{ mt: 1 }} />
              </Alert>
            ) : (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  onClick={() => startTraining('link_prediction')}
                  disabled={loading}
                >
                  Train Link Prediction
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => startTraining('classification')}
                  disabled={loading}
                >
                  Train Classification
                </Button>
              </Box>
            )}
          </Box>
        </Collapse>
      </Paper>
    </Box>
  );
};

export default GNNControlPanel;
