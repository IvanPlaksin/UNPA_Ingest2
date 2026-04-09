/**
 * GNN Dashboard Page
 * Страница управления и мониторинга GNN сервиса
 */
import React, { useState, useCallback } from 'react';
import {
  Box,
  Container,
  Grid,
  Typography,
  Paper,
  Alert,
  Snackbar,
  Breadcrumbs,
  Link,
} from '@mui/material';
import {
  Hub as HubIcon,
  Home as HomeIcon,
  NavigateNext as NavigateNextIcon,
} from '@mui/icons-material';

import {
  GNNControlPanel,
  GNNInsightsPanel,
  PredictedLinksOverlay,
} from '../components/GNN';
import { gnnService } from '../services/gnn.service';

const GNNDashboardPage = () => {
  // State
  const [predictions, setPredictions] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [graphStats, setGraphStats] = useState(null);
  const [nodeTypes, setNodeTypes] = useState([]);
  const [error, setError] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // Overlay state
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [selectedPrediction, setSelectedPrediction] = useState(null);

  // Handle predictions from control panel
  const handlePredictionsReady = useCallback((result) => {
    if (result.type === 'link') {
      setPredictions(result.predictions || []);
      setSnackbar({
        open: true,
        message: `Generated ${result.predictions?.length || 0} link predictions`,
        severity: 'success',
      });
    } else if (result.type === 'classification') {
      setClassifications(result.classifications || []);
      setSnackbar({
        open: true,
        message: `Classified ${result.classifications?.length || 0} nodes`,
        severity: 'success',
      });
    }
  }, []);

  // Handle errors
  const handleError = useCallback((err) => {
    setError(err.message);
    setSnackbar({
      open: true,
      message: err.message,
      severity: 'error',
    });
  }, []);

  // Handle node click from insights panel
  const handleNodeClick = useCallback((nodeId) => {
    console.log('Node clicked:', nodeId);
    // Could navigate to node details or highlight in graph
    setSnackbar({
      open: true,
      message: `Selected node: ${nodeId}`,
      severity: 'info',
    });
  }, []);

  // Handle prediction selection
  const handleSelectPrediction = useCallback((prediction) => {
    setSelectedPrediction(prediction);
    console.log('Selected prediction:', prediction);
  }, []);

  // Close snackbar
  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', py: 3 }}>
      <Container maxWidth="xl">
        {/* Breadcrumbs */}
        <Breadcrumbs
          separator={<NavigateNextIcon fontSize="small" />}
          sx={{ mb: 3 }}
        >
          <Link
            color="inherit"
            href="/"
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            <HomeIcon sx={{ mr: 0.5 }} fontSize="small" />
            Home
          </Link>
          <Typography
            color="text.primary"
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            <HubIcon sx={{ mr: 0.5 }} fontSize="small" />
            GNN Dashboard
          </Typography>
        </Breadcrumbs>

        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            <HubIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            GNN Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Graph Neural Network management - link prediction, node classification, and model training
          </Typography>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3 }}
            onClose={() => setError(null)}
          >
            {error}
          </Alert>
        )}

        {/* Main Content */}
        <Grid container spacing={3}>
          {/* Left Column - Control Panel */}
          <Grid item xs={12} lg={6}>
            <Paper sx={{ height: '100%' }}>
              <GNNControlPanel
                onPredictionsReady={handlePredictionsReady}
                onError={handleError}
              />
            </Paper>
          </Grid>

          {/* Right Column - Insights */}
          <Grid item xs={12} lg={6}>
            <GNNInsightsPanel
              predictions={predictions}
              classifications={classifications}
              graphStats={graphStats}
              nodeTypes={nodeTypes}
              onNodeClick={handleNodeClick}
            />
          </Grid>

          {/* Full Width - Predictions Visualization */}
          {predictions.length > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 2, position: 'relative', minHeight: 300 }}>
                <Typography variant="h6" gutterBottom>
                  Predicted Links Visualization
                </Typography>

                {/* Placeholder for graph visualization */}
                <Box
                  sx={{
                    height: 400,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'grey.100',
                    borderRadius: 1,
                    position: 'relative',
                  }}
                >
                  <Typography color="text.secondary">
                    Graph visualization placeholder - integrate with your graph component
                  </Typography>

                  {/* Predictions Overlay */}
                  <PredictedLinksOverlay
                    predictions={predictions}
                    visible={overlayVisible}
                    onVisibilityChange={setOverlayVisible}
                    confidenceThreshold={confidenceThreshold}
                    onThresholdChange={setConfidenceThreshold}
                    selectedPrediction={selectedPrediction}
                    onSelectPrediction={handleSelectPrediction}
                    maxDisplay={100}
                  />
                </Box>

                {/* Integration hint */}
                <Alert severity="info" sx={{ mt: 2 }}>
                  To display predicted links on your graph, use the{' '}
                  <code>predictionsToEdges()</code> helper function from the
                  PredictedLinksOverlay component.
                </Alert>
              </Paper>
            </Grid>
          )}

          {/* Quick Stats Row */}
          <Grid item xs={12}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h3" color="primary">
                    {predictions.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Link Predictions
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h3" color="secondary">
                    {classifications.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Classifications
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h3" color="success.main">
                    {predictions.filter((p) => p.confidence >= 0.9).length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    High Confidence
                  </Typography>
                </Paper>
              </Grid>

              <Grid item xs={12} sm={6} md={3}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="h3" color="warning.main">
                    {classifications.filter((c) => c.confidence < 0.7).length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Need Review
                  </Typography>
                </Paper>
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert
            onClose={handleCloseSnackbar}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Container>
    </Box>
  );
};

export default GNNDashboardPage;
