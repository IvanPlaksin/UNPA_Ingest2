import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Alert, Chip, Divider, CircularProgress,
  ToggleButtonGroup, ToggleButton,
  List, ListItemButton, ListItemText, ListItemIcon,
} from '@mui/material';
import { Description, Rule, CheckCircle } from '@mui/icons-material';
import FormRenderer from '../components/Forms/FormRenderer';
import { listStructuralGraphs } from '../services/api';

export default function StructuralFormDemoPage() {
  const [graphs, setGraphs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGraphId, setSelectedGraphId] = useState(null);
  const [locale, setLocale] = useState('en');
  const [submittedData, setSubmittedData] = useState(null);

  // Load STRUCTURAL graphs from Memgraph
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await listStructuralGraphs();
        if (!cancelled) {
          setGraphs(data || []);
          if (data?.length > 0) setSelectedGraphId(data[0].graphId);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load graphs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedGraph = graphs.find(g => g.graphId === selectedGraphId);

  const structuralNodeData = selectedGraph ? {
    structuralGraphId: selectedGraph.graphId,
    constraintGraphId: selectedGraph.constraint?.graphId,
  } : null;

  return (
    <Box sx={{ height: '100vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ maxWidth: 1100, width: '100%', mx: 'auto', p: 3, pb: 8 }}>
        <Typography variant="h5" gutterBottom>
          STRUCTURAL Form Builder
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Select a STRUCTURAL graph from the knowledge base. The form is dynamically compiled from
          STRUCTURAL (schema) + CONSTRAINT (validation rules) graphs stored in Memgraph.
        </Typography>

        <Divider sx={{ my: 2 }} />

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        )}

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && graphs.length === 0 && (
          <Alert severity="info">
            No STRUCTURAL graphs found in Memgraph. Run seed scripts to create some.
          </Alert>
        )}

        {!loading && graphs.length > 0 && (
          <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
            {/* Left panel: graph selector */}
            <Paper variant="outlined" sx={{ minWidth: 300, flexShrink: 0 }}>
              <Box sx={{ p: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  STRUCTURAL Graphs ({graphs.length})
                </Typography>
              </Box>
              <List dense disablePadding>
                {graphs.map(g => (
                  <ListItemButton
                    key={g.graphId}
                    selected={g.graphId === selectedGraphId}
                    onClick={() => { setSelectedGraphId(g.graphId); setSubmittedData(null); }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Description fontSize="small" color={g.graphId === selectedGraphId ? 'primary' : 'action'} />
                    </ListItemIcon>
                    <ListItemText
                      primary={g.name}
                      secondary={
                        <Box component="span" sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                          <Chip label={g.namespace} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                          <Chip label={`${g.nodeCount} fields`} size="small" variant="outlined" sx={{ height: 18, fontSize: 10 }} />
                          {g.constraint && (
                            <Chip
                              icon={<Rule sx={{ fontSize: '12px !important' }} />}
                              label={`${g.constraint.ruleCount} rules`}
                              size="small"
                              color="secondary"
                              variant="outlined"
                              sx={{ height: 18, fontSize: 10 }}
                            />
                          )}
                        </Box>
                      }
                      primaryTypographyProps={{ fontSize: 13, fontWeight: g.graphId === selectedGraphId ? 600 : 400 }}
                    />
                  </ListItemButton>
                ))}
              </List>

              {/* Locale selector */}
              <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">Locale:</Typography>
                <ToggleButtonGroup
                  value={locale}
                  exclusive
                  onChange={(_, v) => { if (v) { setLocale(v); setSubmittedData(null); } }}
                  size="small"
                >
                  <ToggleButton value="en" sx={{ px: 1, py: 0.25, fontSize: 11 }}>EN</ToggleButton>
                  <ToggleButton value="fr" sx={{ px: 1, py: 0.25, fontSize: 11 }}>FR</ToggleButton>
                  <ToggleButton value="ru" sx={{ px: 1, py: 0.25, fontSize: 11 }}>RU</ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Paper>

            {/* Right panel: form */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {selectedGraph && (
                <>
                  <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip label={`STRUCTURAL: ${selectedGraph.graphId}`} size="small" color="primary" variant="outlined" />
                    {selectedGraph.constraint && (
                      <Chip label={`CONSTRAINT: ${selectedGraph.constraint.graphId}`} size="small" color="secondary" variant="outlined" />
                    )}
                    {!selectedGraph.constraint && (
                      <Chip label="No CONSTRAINT linked" size="small" color="warning" variant="outlined" />
                    )}
                  </Box>

                  <Paper elevation={2} sx={{ p: 3 }}>
                    <FormRenderer
                      key={`${selectedGraphId}-${locale}`}
                      structuralNodeData={structuralNodeData}
                      mode="EMBEDDED"
                      onSubmit={(data) => setSubmittedData(data)}
                      submitLabel="Submit"
                      showCancel
                      onCancel={() => setSubmittedData(null)}
                      cancelLabel="Clear"
                      locale={locale}
                      layout="vertical"
                      spacing={2}
                    />
                  </Paper>

                  {submittedData && (
                    <Alert
                      severity="success"
                      icon={<CheckCircle fontSize="small" />}
                      sx={{ mt: 2 }}
                    >
                      <Typography variant="subtitle2" gutterBottom>Submitted data:</Typography>
                      <Box component="pre" sx={{ fontSize: 11, maxHeight: 250, overflow: 'auto', m: 0, whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(submittedData, null, 2)}
                      </Box>
                    </Alert>
                  )}
                </>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
