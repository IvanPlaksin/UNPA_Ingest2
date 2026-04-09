/**
 * Knowledge Reconstruction Component
 *
 * Compares original input with reconstructed knowledge from the database.
 * Tests the round-trip: Input -> Process -> Store -> Retrieve -> Reconstruct -> Compare
 *
 * @module components/PipelineLab/KnowledgeReconstruction
 */

import React, { useState } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Grid,
    Stack,
    Chip,
    Alert,
    CircularProgress,
    Card,
    CardContent,
    LinearProgress,
    Divider,
    Tooltip,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Collapse
} from '@mui/material';
import {
    Search,
    RefreshCw,
    ArrowRight,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Database,
    GitCompare,
    BarChart3,
    ChevronDown,
    ChevronUp,
    Info,
    Zap,
    Copy
} from 'lucide-react';
import api from '../../services/api';

const MetricCard = ({ label, value, max = 100, color = 'primary', icon: Icon }) => {
    const percentage = typeof value === 'number' ? (value / max) * 100 : 0;

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    {Icon && <Icon size={16} />}
                    <Typography variant="caption" color="text.secondary">
                        {label}
                    </Typography>
                </Stack>
                <Typography variant="h4" fontWeight={700} color={`${color}.main`}>
                    {typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : value}
                </Typography>
                {typeof value === 'number' && (
                    <LinearProgress
                        variant="determinate"
                        value={percentage}
                        color={percentage >= 80 ? 'success' : percentage >= 60 ? 'warning' : 'error'}
                        sx={{ mt: 1, height: 6, borderRadius: 1 }}
                    />
                )}
            </CardContent>
        </Card>
    );
};

const ComparisonPanel = ({ title, original, reconstructed, similarity }) => {
    const [showDiff, setShowDiff] = useState(false);

    const getHighlightedText = (text, isOriginal) => {
        if (!showDiff || !original || !reconstructed) return text;

        const words1 = new Set(original.toLowerCase().split(/\s+/));
        const words2 = new Set(reconstructed.toLowerCase().split(/\s+/));
        const targetSet = isOriginal ? words2 : words1;

        return text.split(/\s+/).map((word, i) => {
            const inOther = targetSet.has(word.toLowerCase());
            return (
                <span
                    key={i}
                    style={{
                        backgroundColor: inOther ? 'transparent' : 'rgba(239, 68, 68, 0.3)',
                        padding: inOther ? 0 : '0 2px',
                        borderRadius: 2
                    }}
                >
                    {word}{' '}
                </span>
            );
        });
    };

    return (
        <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                    {title}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center">
                    {similarity !== undefined && (
                        <Chip
                            label={`${(similarity * 100).toFixed(0)}% similar`}
                            size="small"
                            color={similarity >= 0.8 ? 'success' : similarity >= 0.6 ? 'warning' : 'error'}
                        />
                    )}
                    <Tooltip title={showDiff ? "Hide differences" : "Show differences"}>
                        <IconButton size="small" onClick={() => setShowDiff(!showDiff)}>
                            <GitCompare size={16} />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Stack>

            <Grid container spacing={2} sx={{ flex: 1 }}>
                <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
                        Original
                    </Typography>
                    <Box
                        sx={{
                            p: 2,
                            bgcolor: 'background.default',
                            borderRadius: 1,
                            height: 200,
                            overflow: 'auto',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            whiteSpace: 'pre-wrap'
                        }}
                    >
                        {showDiff ? getHighlightedText(original || '', true) : original}
                    </Box>
                </Grid>
                <Grid item xs={6}>
                    <Typography variant="caption" color="text.secondary" gutterBottom sx={{ display: 'block' }}>
                        Reconstructed
                    </Typography>
                    <Box
                        sx={{
                            p: 2,
                            bgcolor: 'background.default',
                            borderRadius: 1,
                            height: 200,
                            overflow: 'auto',
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            whiteSpace: 'pre-wrap'
                        }}
                    >
                        {showDiff ? getHighlightedText(reconstructed || '', false) : reconstructed}
                    </Box>
                </Grid>
            </Grid>
        </Paper>
    );
};

const EntityComparisonTable = ({ originalEntities, retrievedEntities }) => {
    const [expanded, setExpanded] = useState(true);

    // Group entities by type
    const groupByType = (entities) => {
        return (entities || []).reduce((acc, e) => {
            const type = e.type || 'unknown';
            if (!acc[type]) acc[type] = [];
            acc[type].push(e.name || e.text || e);
            return acc;
        }, {});
    };

    const originalGrouped = groupByType(originalEntities);
    const retrievedGrouped = groupByType(retrievedEntities);
    const allTypes = [...new Set([...Object.keys(originalGrouped), ...Object.keys(retrievedGrouped)])];

    return (
        <Paper sx={{ p: 2 }}>
            <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                sx={{ cursor: 'pointer' }}
                onClick={() => setExpanded(!expanded)}
            >
                <Typography variant="subtitle2" fontWeight={600}>
                    Entity Preservation Analysis
                </Typography>
                {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </Stack>

            <Collapse in={expanded}>
                <TableContainer sx={{ mt: 2 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Entity Type</TableCell>
                                <TableCell>Original</TableCell>
                                <TableCell>Retrieved</TableCell>
                                <TableCell>Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {allTypes.map(type => {
                                const original = originalGrouped[type] || [];
                                const retrieved = retrievedGrouped[type] || [];
                                const preserved = original.filter(o =>
                                    retrieved.some(r => r.toLowerCase().includes(o.toLowerCase()) ||
                                        o.toLowerCase().includes(r.toLowerCase()))
                                );
                                const preservationRate = original.length > 0
                                    ? preserved.length / original.length
                                    : retrieved.length > 0 ? 0 : 1;

                                return (
                                    <TableRow key={type}>
                                        <TableCell>
                                            <Chip label={type} size="small" variant="outlined" />
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                                {original.map((e, i) => (
                                                    <Chip key={i} label={e} size="small" />
                                                ))}
                                                {original.length === 0 && (
                                                    <Typography variant="caption" color="text.disabled">None</Typography>
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                                {retrieved.map((e, i) => (
                                                    <Chip
                                                        key={i}
                                                        label={e}
                                                        size="small"
                                                        color={original.some(o =>
                                                            o.toLowerCase().includes(e.toLowerCase()) ||
                                                            e.toLowerCase().includes(o.toLowerCase())
                                                        ) ? 'success' : 'default'}
                                                    />
                                                ))}
                                                {retrieved.length === 0 && (
                                                    <Typography variant="caption" color="text.disabled">None</Typography>
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            {preservationRate >= 0.8 ? (
                                                <CheckCircle size={16} color="#22c55e" />
                                            ) : preservationRate >= 0.5 ? (
                                                <AlertTriangle size={16} color="#eab308" />
                                            ) : (
                                                <XCircle size={16} color="#ef4444" />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Collapse>
        </Paper>
    );
};

const KnowledgeReconstruction = () => {
    const [inputText, setInputText] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [results, setResults] = useState(null);

    const runReconstruction = async () => {
        if (!inputText.trim()) {
            setError('Please enter text to test');
            return;
        }

        setProcessing(true);
        setError(null);

        try {
            // Step 1: Process the input text
            const analyzeResponse = await api.post('/knowledge/analyze', {
                text: inputText,
                options: { chunk: true }
            });

            // Step 2: Search for similar content in the knowledge base
            const searchResponse = await api.post('/knowledge/search/enhanced', {
                query: inputText.substring(0, 500), // Use first 500 chars as query
                options: {
                    maxResults: 5,
                    expandQuery: true,
                    enableReranking: true
                }
            });

            // Step 3: Calculate similarity metrics
            const originalText = analyzeResponse.data.sanitized?.text || inputText;
            const retrievedTexts = searchResponse.data.results?.map(r => r.content || r.title || '').join(' ') || '';

            // Jaccard similarity
            const words1 = new Set(originalText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
            const words2 = new Set(retrievedTexts.toLowerCase().split(/\s+/).filter(w => w.length > 2));
            const intersection = new Set([...words1].filter(x => words2.has(x)));
            const union = new Set([...words1, ...words2]);
            const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;

            // Term overlap
            const criticalTerms = [...words1].filter(w => w.length > 4).slice(0, 20);
            const preservedTerms = criticalTerms.filter(t => words2.has(t));
            const termPreservation = criticalTerms.length > 0 ? preservedTerms.length / criticalTerms.length : 1;

            // Entity comparison
            const originalEntities = analyzeResponse.data.entities || [];
            const retrievedEntities = searchResponse.data.results?.flatMap(r =>
                (r.entities || []).concat(r.payload?.entities || [])
            ).filter(Boolean) || [];

            setResults({
                original: {
                    text: originalText,
                    language: analyzeResponse.data.language,
                    entities: originalEntities,
                    chunks: analyzeResponse.data.chunks
                },
                search: {
                    query: searchResponse.data.expandedQuery || searchResponse.data.query,
                    results: searchResponse.data.results || [],
                    metadata: searchResponse.data.metadata
                },
                reconstruction: {
                    text: retrievedTexts,
                    entities: retrievedEntities
                },
                metrics: {
                    jaccardSimilarity,
                    termPreservation,
                    entityPreservation: originalEntities.length > 0
                        ? retrievedEntities.filter(re =>
                            originalEntities.some(oe =>
                                (oe.name || oe.text || '').toLowerCase().includes((re.name || re.text || '').toLowerCase()) ||
                                (re.name || re.text || '').toLowerCase().includes((oe.name || oe.text || '').toLowerCase())
                            )
                        ).length / originalEntities.length
                        : 1,
                    searchScore: searchResponse.data.results?.[0]?.score || 0,
                    resultsFound: searchResponse.data.results?.length || 0
                }
            });

        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Reconstruction failed');
        } finally {
            setProcessing(false);
        }
    };

    const getOverallScore = () => {
        if (!results) return 0;
        const m = results.metrics;
        return (
            m.jaccardSimilarity * 0.3 +
            m.termPreservation * 0.3 +
            m.entityPreservation * 0.2 +
            Math.min(1, m.searchScore) * 0.2
        );
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography variant="h6" fontWeight={700}>
                            <Database size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                            Knowledge Reconstruction Test
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Compare original input with knowledge retrieved from the database
                        </Typography>
                    </Box>
                    <Button
                        variant="contained"
                        startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <Search size={16} />}
                        onClick={runReconstruction}
                        disabled={processing || !inputText.trim()}
                    >
                        {processing ? 'Testing...' : 'Run Test'}
                    </Button>
                </Stack>
            </Paper>

            {/* Input Section */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom>
                    Test Input
                </Typography>
                <TextField
                    fullWidth
                    multiline
                    rows={4}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Enter text to test knowledge reconstruction...

Example: Paste a document or query that should be findable in your knowledge base.
The system will process it, search for related content, and compare the results."
                    sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                    disabled={processing}
                />
            </Paper>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                    {error}
                </Alert>
            )}

            {/* Results */}
            {results && (
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                    {/* Metrics Overview */}
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={12}>
                            <Paper sx={{ p: 2 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Typography variant="subtitle1" fontWeight={600}>
                                        <BarChart3 size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                                        Overall Reconstruction Score
                                    </Typography>
                                    <Typography
                                        variant="h4"
                                        fontWeight={700}
                                        color={
                                            getOverallScore() >= 0.7 ? 'success.main' :
                                            getOverallScore() >= 0.5 ? 'warning.main' : 'error.main'
                                        }
                                    >
                                        {(getOverallScore() * 100).toFixed(0)}%
                                    </Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    value={getOverallScore() * 100}
                                    color={
                                        getOverallScore() >= 0.7 ? 'success' :
                                        getOverallScore() >= 0.5 ? 'warning' : 'error'
                                    }
                                    sx={{ mt: 2, height: 10, borderRadius: 1 }}
                                />
                            </Paper>
                        </Grid>

                        <Grid item xs={3}>
                            <MetricCard
                                label="Jaccard Similarity"
                                value={results.metrics.jaccardSimilarity}
                                icon={GitCompare}
                            />
                        </Grid>
                        <Grid item xs={3}>
                            <MetricCard
                                label="Term Preservation"
                                value={results.metrics.termPreservation}
                                icon={Zap}
                            />
                        </Grid>
                        <Grid item xs={3}>
                            <MetricCard
                                label="Entity Preservation"
                                value={results.metrics.entityPreservation}
                                color="secondary"
                            />
                        </Grid>
                        <Grid item xs={3}>
                            <MetricCard
                                label="Top Result Score"
                                value={results.metrics.searchScore}
                                color="info"
                            />
                        </Grid>
                    </Grid>

                    {/* Text Comparison */}
                    <ComparisonPanel
                        title="Text Comparison"
                        original={results.original.text}
                        reconstructed={results.reconstruction.text}
                        similarity={results.metrics.jaccardSimilarity}
                    />

                    <Box sx={{ mt: 2 }}>
                        <EntityComparisonTable
                            originalEntities={results.original.entities}
                            retrievedEntities={results.reconstruction.entities}
                        />
                    </Box>

                    {/* Search Results */}
                    <Paper sx={{ p: 2, mt: 2 }}>
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                            Search Results ({results.search.results.length} found)
                        </Typography>
                        {results.search.query && (
                            <Alert severity="info" sx={{ mb: 2 }}>
                                <Typography variant="caption">
                                    <strong>Expanded Query:</strong> {results.search.query}
                                </Typography>
                            </Alert>
                        )}
                        <Stack spacing={1}>
                            {results.search.results.map((r, i) => (
                                <Paper key={i} sx={{ p: 2, bgcolor: 'background.default' }}>
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="subtitle2">
                                                {r.title || `Result ${i + 1}`}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                                {(r.content || '').substring(0, 200)}...
                                            </Typography>
                                        </Box>
                                        <Stack alignItems="flex-end" spacing={0.5}>
                                            <Chip
                                                label={`Score: ${(r.score * 100).toFixed(0)}%`}
                                                size="small"
                                                color={r.score >= 0.7 ? 'success' : 'default'}
                                            />
                                            <Chip label={r.type || 'unknown'} size="small" variant="outlined" />
                                            <Chip label={r.source || 'unknown'} size="small" variant="outlined" />
                                        </Stack>
                                    </Stack>
                                </Paper>
                            ))}
                        </Stack>
                    </Paper>
                </Box>
            )}
        </Box>
    );
};

export default KnowledgeReconstruction;
