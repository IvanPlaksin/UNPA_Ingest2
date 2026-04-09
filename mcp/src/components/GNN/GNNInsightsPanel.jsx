/**
 * GNN Insights Panel Component
 * Панель аналитики и инсайтов от GNN
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  LinearProgress,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Alert,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Link as LinkIcon,
  Category as CategoryIcon,
  Insights as InsightsIcon,
  PieChart as PieChartIcon,
  ShowChart as ShowChartIcon,
  OpenInNew as OpenInNewIcon,
} from '@mui/icons-material';

// Simple bar chart component
const SimpleBarChart = ({ data, maxValue, color = '#1976d2' }) => {
  return (
    <Box sx={{ width: '100%' }}>
      {data.map((item, idx) => (
        <Box key={idx} sx={{ mb: 1 }}>
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}
          >
            <Typography variant="caption" noWrap sx={{ maxWidth: '60%' }}>
              {item.label}
            </Typography>
            <Typography variant="caption" fontWeight="bold">
              {item.value}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={(item.value / maxValue) * 100}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: 'rgba(0,0,0,0.1)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: color,
                borderRadius: 4,
              },
            }}
          />
        </Box>
      ))}
    </Box>
  );
};

// Tab panel component
const TabPanel = ({ children, value, index }) => (
  <div hidden={value !== index}>{value === index && <Box sx={{ p: 2 }}>{children}</Box>}</div>
);

const GNNInsightsPanel = ({
  predictions = [],
  classifications = [],
  graphStats = null,
  nodeTypes = [],
  onNodeClick,
}) => {
  const [tabValue, setTabValue] = useState(0);

  // Link prediction insights
  const linkInsights = useMemo(() => {
    if (!predictions || predictions.length === 0) return null;

    // Confidence distribution
    const confidenceBuckets = {
      '90-100%': 0,
      '80-90%': 0,
      '70-80%': 0,
      '60-70%': 0,
      '50-60%': 0,
      '<50%': 0,
    };

    predictions.forEach((p) => {
      const conf = p.confidence * 100;
      if (conf >= 90) confidenceBuckets['90-100%']++;
      else if (conf >= 80) confidenceBuckets['80-90%']++;
      else if (conf >= 70) confidenceBuckets['70-80%']++;
      else if (conf >= 60) confidenceBuckets['60-70%']++;
      else if (conf >= 50) confidenceBuckets['50-60%']++;
      else confidenceBuckets['<50%']++;
    });

    // Top connected nodes (most predictions)
    const nodeCounts = {};
    predictions.forEach((p) => {
      nodeCounts[p.source_id] = (nodeCounts[p.source_id] || 0) + 1;
      nodeCounts[p.target_id] = (nodeCounts[p.target_id] || 0) + 1;
    });

    const topNodes = Object.entries(nodeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ id, count }));

    // Average confidence
    const avgConfidence =
      predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length;

    return {
      total: predictions.length,
      avgConfidence,
      confidenceDistribution: Object.entries(confidenceBuckets).map(
        ([label, value]) => ({ label, value })
      ),
      topNodes,
    };
  }, [predictions]);

  // Classification insights
  const classInsights = useMemo(() => {
    if (!classifications || classifications.length === 0) return null;

    // Class distribution
    const classCounts = {};
    classifications.forEach((c) => {
      classCounts[c.predicted_class] = (classCounts[c.predicted_class] || 0) + 1;
    });

    const classDistribution = Object.entries(classCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));

    // Confidence stats
    const confidences = classifications.map((c) => c.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const minConfidence = Math.min(...confidences);
    const maxConfidence = Math.max(...confidences);

    // Low confidence items (might need review)
    const lowConfidence = classifications
      .filter((c) => c.confidence < 0.7)
      .slice(0, 10);

    return {
      total: classifications.length,
      numClasses: Object.keys(classCounts).length,
      avgConfidence,
      minConfidence,
      maxConfidence,
      classDistribution,
      lowConfidence,
    };
  }, [classifications]);

  return (
    <Paper sx={{ p: 2 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <InsightsIcon sx={{ mr: 1 }} />
        <Typography variant="h6">GNN Insights</Typography>
      </Box>

      {/* Tabs */}
      <Tabs
        value={tabValue}
        onChange={(e, v) => setTabValue(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}
      >
        <Tab label="Link Predictions" icon={<LinkIcon />} iconPosition="start" />
        <Tab
          label="Classifications"
          icon={<CategoryIcon />}
          iconPosition="start"
        />
        <Tab label="Graph Stats" icon={<PieChartIcon />} iconPosition="start" />
      </Tabs>

      {/* Link Predictions Tab */}
      <TabPanel value={tabValue} index={0}>
        {linkInsights ? (
          <Grid container spacing={2}>
            {/* Summary Cards */}
            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    Total Predictions
                  </Typography>
                  <Typography variant="h4">{linkInsights.total}</Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    Avg Confidence
                  </Typography>
                  <Typography variant="h4">
                    {(linkInsights.avgConfidence * 100).toFixed(1)}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    High Confidence (≥90%)
                  </Typography>
                  <Typography variant="h4">
                    {linkInsights.confidenceDistribution.find(
                      (d) => d.label === '90-100%'
                    )?.value || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Confidence Distribution */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Confidence Distribution
              </Typography>
              <SimpleBarChart
                data={linkInsights.confidenceDistribution}
                maxValue={Math.max(
                  ...linkInsights.confidenceDistribution.map((d) => d.value)
                )}
                color="#1976d2"
              />
            </Grid>

            {/* Top Connected Nodes */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Most Connected Nodes
              </Typography>
              <List dense>
                {linkInsights.topNodes.slice(0, 5).map((node) => (
                  <ListItem
                    key={node.id}
                    button
                    onClick={() => onNodeClick?.(node.id)}
                  >
                    <ListItemIcon>
                      <TrendingUpIcon color="primary" />
                    </ListItemIcon>
                    <ListItemText
                      primary={node.id}
                      secondary={`${node.count} predictions`}
                    />
                  </ListItem>
                ))}
              </List>
            </Grid>
          </Grid>
        ) : (
          <Alert severity="info">
            No link predictions available. Run link prediction from the Control
            Panel.
          </Alert>
        )}
      </TabPanel>

      {/* Classifications Tab */}
      <TabPanel value={tabValue} index={1}>
        {classInsights ? (
          <Grid container spacing={2}>
            {/* Summary Cards */}
            <Grid item xs={12} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    Classified
                  </Typography>
                  <Typography variant="h4">{classInsights.total}</Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    Classes
                  </Typography>
                  <Typography variant="h4">{classInsights.numClasses}</Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    Avg Confidence
                  </Typography>
                  <Typography variant="h4">
                    {(classInsights.avgConfidence * 100).toFixed(1)}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={3}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    Min Confidence
                  </Typography>
                  <Typography variant="h4">
                    {(classInsights.minConfidence * 100).toFixed(1)}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Class Distribution */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Class Distribution
              </Typography>
              <SimpleBarChart
                data={classInsights.classDistribution}
                maxValue={Math.max(
                  ...classInsights.classDistribution.map((d) => d.value)
                )}
                color="#9c27b0"
              />
            </Grid>

            {/* Low Confidence Items */}
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" gutterBottom>
                Low Confidence (Review Needed)
              </Typography>
              {classInsights.lowConfidence.length > 0 ? (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Node</TableCell>
                        <TableCell>Class</TableCell>
                        <TableCell>Confidence</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {classInsights.lowConfidence.map((item) => (
                        <TableRow
                          key={item.node_id}
                          hover
                          onClick={() => onNodeClick?.(item.node_id)}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>{item.node_id}</TableCell>
                          <TableCell>
                            <Chip
                              label={item.predicted_class}
                              size="small"
                              color="warning"
                            />
                          </TableCell>
                          <TableCell>
                            {(item.confidence * 100).toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Alert severity="success" sx={{ mt: 1 }}>
                  All classifications have high confidence!
                </Alert>
              )}
            </Grid>
          </Grid>
        ) : (
          <Alert severity="info">
            No classifications available. Run node classification from the
            Control Panel.
          </Alert>
        )}
      </TabPanel>

      {/* Graph Stats Tab */}
      <TabPanel value={tabValue} index={2}>
        {graphStats ? (
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    Total Nodes
                  </Typography>
                  <Typography variant="h4">
                    {graphStats.num_nodes?.toLocaleString() || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    Total Edges
                  </Typography>
                  <Typography variant="h4">
                    {graphStats.num_edges?.toLocaleString() || 0}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle2" color="textSecondary">
                    Node Types
                  </Typography>
                  <Typography variant="h4">{nodeTypes.length}</Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Node Type Distribution */}
            {graphStats.node_type_counts && (
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Node Type Distribution
                </Typography>
                <SimpleBarChart
                  data={Object.entries(graphStats.node_type_counts).map(
                    ([label, value]) => ({ label, value })
                  )}
                  maxValue={Math.max(
                    ...Object.values(graphStats.node_type_counts)
                  )}
                  color="#4caf50"
                />
              </Grid>
            )}
          </Grid>
        ) : (
          <Alert severity="info">
            Graph statistics not available. Connect to the GNN service first.
          </Alert>
        )}
      </TabPanel>
    </Paper>
  );
};

export default GNNInsightsPanel;
