/**
 * E2E Auto Validator Component
 *
 * Automatically validates the entire pipeline by:
 * 1. Processing input through full pipeline (sanitize -> detect -> chunk -> extract -> embed)
 * 2. Storing in knowledge base (simulated/real)
 * 3. Retrieving via enhanced search
 * 4. Comparing and calculating quality metrics
 * 5. Providing pass/fail verdict with detailed breakdown
 *
 * @module components/PipelineLab/E2EAutoValidator
 */

import React, { useState, useCallback, useRef } from 'react';
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
    Collapse,
    Stepper,
    Step,
    StepLabel,
    StepContent,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Switch,
    FormControlLabel,
    Accordion,
    AccordionSummary,
    AccordionDetails
} from '@mui/material';
import {
    Play,
    CheckCircle,
    XCircle,
    AlertTriangle,
    RefreshCw,
    ChevronDown,
    ChevronUp,
    Zap,
    Database,
    Search,
    GitCompare,
    BarChart3,
    Clock,
    Award,
    Target,
    FileText,
    Layers,
    Copy,
    Download,
    Settings,
    PlayCircle,
    StopCircle
} from 'lucide-react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import api from '../../services/api';

// Quality thresholds for pass/fail
const QUALITY_THRESHOLDS = {
    excellent: 0.85,
    good: 0.70,
    acceptable: 0.55,
    poor: 0.40
};

// Sample UN-specific test cases
const GOLDEN_DATASET = [
    {
        id: 'UN-001',
        name: 'UNICEF Programme',
        text: `UNICEF is working with partners to deliver essential health services in remote areas.
The programme targets 50,000 children under five years of age and focuses on immunization,
nutrition screening, and primary healthcare. Budget allocation is $2.5 million from the
emergency response fund. Key partners include WHO, local health ministries, and NGOs.`,
        expectedEntities: ['UNICEF', 'WHO', 'children', 'health services', 'immunization'],
        expectedConcepts: ['healthcare', 'programme', 'emergency response', 'partnership']
    },
    {
        id: 'UN-002',
        name: 'SDG Implementation',
        text: `The implementation of Sustainable Development Goal 13 on Climate Action requires
coordinated efforts across all UN agencies. The Paris Agreement sets the framework for
reducing greenhouse gas emissions by 45% by 2030. Member states have committed to
Nationally Determined Contributions (NDCs) and climate finance mechanisms.`,
        expectedEntities: ['SDG 13', 'Paris Agreement', 'UN agencies', 'NDCs', '2030'],
        expectedConcepts: ['climate change', 'emissions', 'sustainability', 'global cooperation']
    },
    {
        id: 'UN-003',
        name: 'Peacekeeping Operations',
        text: `MINUSMA peacekeeping mission in Mali faces significant security challenges.
The force comprises 13,000 troops from 60 contributing countries. Priority tasks include
protection of civilians, support for political reconciliation, and human rights monitoring.
The mandate was renewed by Security Council Resolution 2640.`,
        expectedEntities: ['MINUSMA', 'Mali', 'Security Council', 'Resolution 2640'],
        expectedConcepts: ['peacekeeping', 'security', 'protection', 'mandate']
    },
    {
        id: 'UN-004',
        name: 'Humanitarian Response',
        text: `The Office for the Coordination of Humanitarian Affairs (OCHA) has launched a
flash appeal for $150 million to respond to the flooding crisis. The response plan
covers shelter, food security, WASH, and protection sectors. An estimated 2.3 million
people are affected, with 500,000 requiring immediate assistance.`,
        expectedEntities: ['OCHA', '150 million', '2.3 million', '500,000'],
        expectedConcepts: ['humanitarian', 'emergency', 'flash appeal', 'crisis response']
    },
    {
        id: 'UN-005',
        name: 'Human Rights Report',
        text: `The Human Rights Council has documented systematic violations in the region,
including arbitrary detention, torture, and restrictions on freedom of expression.
The Special Rapporteur recommends immediate independent investigation and
accountability measures. Civil society organizations report increased repression.`,
        expectedEntities: ['Human Rights Council', 'Special Rapporteur'],
        expectedConcepts: ['human rights', 'violations', 'accountability', 'civil society']
    }
];

// Metric calculation utilities
const calculateJaccardSimilarity = (set1, set2) => {
    if (set1.size === 0 && set2.size === 0) return 1;
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
};

const calculateTermPreservation = (original, retrieved) => {
    const originalTerms = new Set(
        original.toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 4)
            .slice(0, 30)
    );
    const retrievedTerms = new Set(
        retrieved.toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 4)
    );
    return calculateJaccardSimilarity(originalTerms, retrievedTerms);
};

const calculateEntityPreservation = (originalEntities, retrievedEntities) => {
    if (!originalEntities || originalEntities.length === 0) return 1;

    const originalNames = new Set(
        originalEntities.map(e => (e.name || e.text || e).toLowerCase())
    );
    const retrievedNames = new Set(
        (retrievedEntities || []).map(e => (e.name || e.text || e).toLowerCase())
    );

    let matches = 0;
    originalNames.forEach(orig => {
        for (const ret of retrievedNames) {
            if (orig.includes(ret) || ret.includes(orig)) {
                matches++;
                break;
            }
        }
    });

    return originalNames.size > 0 ? matches / originalNames.size : 1;
};

const calculateSemanticOverlap = (original, retrieved, expectedConcepts) => {
    if (!expectedConcepts || expectedConcepts.length === 0) return 0.5;

    const combinedText = (original + ' ' + retrieved).toLowerCase();
    const foundConcepts = expectedConcepts.filter(concept =>
        combinedText.includes(concept.toLowerCase())
    );

    return foundConcepts.length / expectedConcepts.length;
};

// Metric card component
const MetricCard = ({ label, value, icon: Icon, status, description }) => {
    const getStatusColor = (val) => {
        if (val >= QUALITY_THRESHOLDS.excellent) return 'success';
        if (val >= QUALITY_THRESHOLDS.good) return 'info';
        if (val >= QUALITY_THRESHOLDS.acceptable) return 'warning';
        return 'error';
    };

    const color = getStatusColor(value);

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2 }}>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                    {Icon && <Icon size={16} />}
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                        {label}
                    </Typography>
                    {status && (
                        status === 'pass' ?
                            <CheckCircle size={14} color="#22c55e" /> :
                            <XCircle size={14} color="#ef4444" />
                    )}
                </Stack>
                <Typography variant="h5" fontWeight={700} color={`${color}.main`}>
                    {(value * 100).toFixed(1)}%
                </Typography>
                <LinearProgress
                    variant="determinate"
                    value={value * 100}
                    color={color}
                    sx={{ mt: 1, height: 6, borderRadius: 1 }}
                />
                {description && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                        {description}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
};

// Test result row component
const TestResultRow = ({ result, onExpand, expanded }) => {
    const getOverallStatus = (metrics) => {
        const overall = (
            metrics.jaccardSimilarity * 0.25 +
            metrics.termPreservation * 0.25 +
            metrics.entityPreservation * 0.25 +
            metrics.semanticOverlap * 0.25
        );
        return overall >= QUALITY_THRESHOLDS.acceptable ? 'pass' : 'fail';
    };

    const status = getOverallStatus(result.metrics);
    const overallScore = (
        result.metrics.jaccardSimilarity * 0.25 +
        result.metrics.termPreservation * 0.25 +
        result.metrics.entityPreservation * 0.25 +
        result.metrics.semanticOverlap * 0.25
    );

    return (
        <>
            <TableRow
                hover
                onClick={onExpand}
                sx={{ cursor: 'pointer', '& > *': { borderBottom: expanded ? 0 : undefined } }}
            >
                <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        {status === 'pass' ?
                            <CheckCircle size={18} color="#22c55e" /> :
                            <XCircle size={18} color="#ef4444" />
                        }
                        <Typography variant="body2" fontWeight={600}>
                            {result.testCase.id}
                        </Typography>
                    </Stack>
                </TableCell>
                <TableCell>
                    <Typography variant="body2">
                        {result.testCase.name}
                    </Typography>
                </TableCell>
                <TableCell align="center">
                    <Chip
                        label={`${(overallScore * 100).toFixed(0)}%`}
                        size="small"
                        color={status === 'pass' ? 'success' : 'error'}
                    />
                </TableCell>
                <TableCell align="center">
                    <Typography variant="caption" color="text.secondary">
                        {result.timings.total}ms
                    </Typography>
                </TableCell>
                <TableCell align="center">
                    <Typography variant="caption">
                        {result.searchResults?.length || 0}
                    </Typography>
                </TableCell>
                <TableCell>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </TableCell>
            </TableRow>
            <TableRow>
                <TableCell colSpan={6} sx={{ py: 0 }}>
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1, my: 1 }}>
                            <Grid container spacing={2}>
                                <Grid item xs={3}>
                                    <MetricCard
                                        label="Jaccard Similarity"
                                        value={result.metrics.jaccardSimilarity}
                                        icon={GitCompare}
                                    />
                                </Grid>
                                <Grid item xs={3}>
                                    <MetricCard
                                        label="Term Preservation"
                                        value={result.metrics.termPreservation}
                                        icon={Zap}
                                    />
                                </Grid>
                                <Grid item xs={3}>
                                    <MetricCard
                                        label="Entity Preservation"
                                        value={result.metrics.entityPreservation}
                                        icon={Target}
                                    />
                                </Grid>
                                <Grid item xs={3}>
                                    <MetricCard
                                        label="Semantic Overlap"
                                        value={result.metrics.semanticOverlap}
                                        icon={Layers}
                                    />
                                </Grid>
                            </Grid>

                            {result.issues?.length > 0 && (
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2">Issues Found:</Typography>
                                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                                        {result.issues.map((issue, i) => (
                                            <li key={i}><Typography variant="body2">{issue}</Typography></li>
                                        ))}
                                    </ul>
                                </Alert>
                            )}
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
};

// Main component
const E2EAutoValidator = () => {
    const [running, setRunning] = useState(false);
    const [results, setResults] = useState([]);
    const [currentTest, setCurrentTest] = useState(null);
    const [progress, setProgress] = useState(0);
    const [expandedRow, setExpandedRow] = useState(null);
    const [customText, setCustomText] = useState('');
    const [useCustom, setUseCustom] = useState(false);
    const [summary, setSummary] = useState(null);
    const [settings, setSettings] = useState({
        runAllTests: true,
        selectedTests: [],
        searchOptions: {
            expandQuery: true,
            enableReranking: true,
            maxResults: 5
        }
    });

    const abortControllerRef = useRef(null);

    // Run single test
    const runSingleTest = async (testCase) => {
        const startTime = Date.now();
        const timings = {};

        try {
            // Step 1: Analyze (sanitize + detect + extract)
            const analyzeStart = Date.now();
            const analyzeResponse = await api.post('/knowledge/analyze', {
                text: testCase.text,
                options: { chunk: true }
            });
            timings.analyze = Date.now() - analyzeStart;

            // Step 2: Search for similar content
            const searchStart = Date.now();
            const searchResponse = await api.post('/knowledge/search/enhanced', {
                query: testCase.text.substring(0, 500),
                options: {
                    ...settings.searchOptions,
                    expandQuery: settings.searchOptions.expandQuery,
                    enableReranking: settings.searchOptions.enableReranking,
                    maxResults: settings.searchOptions.maxResults
                }
            });
            timings.search = Date.now() - searchStart;

            // Step 3: Calculate metrics
            const metricsStart = Date.now();
            const originalText = analyzeResponse.data.sanitized?.text || testCase.text;
            const retrievedTexts = searchResponse.data.results?.map(r =>
                r.content || r.title || ''
            ).join(' ') || '';

            const originalEntities = analyzeResponse.data.entities || [];
            const retrievedEntities = searchResponse.data.results?.flatMap(r =>
                (r.entities || []).concat(r.payload?.entities || [])
            ).filter(Boolean) || [];

            const metrics = {
                jaccardSimilarity: calculateJaccardSimilarity(
                    new Set(originalText.toLowerCase().split(/\s+/).filter(w => w.length > 2)),
                    new Set(retrievedTexts.toLowerCase().split(/\s+/).filter(w => w.length > 2))
                ),
                termPreservation: calculateTermPreservation(originalText, retrievedTexts),
                entityPreservation: calculateEntityPreservation(
                    [...originalEntities, ...(testCase.expectedEntities || [])],
                    retrievedEntities
                ),
                semanticOverlap: calculateSemanticOverlap(
                    originalText,
                    retrievedTexts,
                    testCase.expectedConcepts
                ),
                searchScore: searchResponse.data.results?.[0]?.score || 0,
                resultsFound: searchResponse.data.results?.length || 0
            };
            timings.metrics = Date.now() - metricsStart;
            timings.total = Date.now() - startTime;

            // Step 4: Identify issues
            const issues = [];
            if (metrics.jaccardSimilarity < QUALITY_THRESHOLDS.acceptable) {
                issues.push(`Low word overlap (${(metrics.jaccardSimilarity * 100).toFixed(0)}%)`);
            }
            if (metrics.entityPreservation < QUALITY_THRESHOLDS.acceptable) {
                issues.push(`Poor entity preservation (${(metrics.entityPreservation * 100).toFixed(0)}%)`);
            }
            if (metrics.resultsFound === 0) {
                issues.push('No search results found');
            }
            if (metrics.searchScore < 0.3) {
                issues.push(`Low search relevance (${(metrics.searchScore * 100).toFixed(0)}%)`);
            }

            return {
                testCase,
                success: true,
                metrics,
                timings,
                issues,
                originalText,
                retrievedTexts,
                searchResults: searchResponse.data.results,
                expandedQuery: searchResponse.data.expandedQuery,
                language: analyzeResponse.data.language
            };

        } catch (error) {
            return {
                testCase,
                success: false,
                error: error.message,
                timings: { total: Date.now() - startTime },
                metrics: {
                    jaccardSimilarity: 0,
                    termPreservation: 0,
                    entityPreservation: 0,
                    semanticOverlap: 0
                },
                issues: [`Test failed: ${error.message}`]
            };
        }
    };

    // Run all tests
    const runTests = async () => {
        setRunning(true);
        setResults([]);
        setSummary(null);
        setProgress(0);
        abortControllerRef.current = new AbortController();

        const testCases = useCustom && customText.trim()
            ? [{ id: 'CUSTOM', name: 'Custom Input', text: customText, expectedEntities: [], expectedConcepts: [] }]
            : GOLDEN_DATASET;

        const testResults = [];

        for (let i = 0; i < testCases.length; i++) {
            if (abortControllerRef.current?.signal.aborted) break;

            setCurrentTest(testCases[i]);
            setProgress(((i + 1) / testCases.length) * 100);

            const result = await runSingleTest(testCases[i]);
            testResults.push(result);
            setResults([...testResults]);
        }

        // Calculate summary
        const passed = testResults.filter(r => {
            const overall = (
                r.metrics.jaccardSimilarity * 0.25 +
                r.metrics.termPreservation * 0.25 +
                r.metrics.entityPreservation * 0.25 +
                r.metrics.semanticOverlap * 0.25
            );
            return overall >= QUALITY_THRESHOLDS.acceptable;
        }).length;

        const avgMetrics = {
            jaccardSimilarity: testResults.reduce((sum, r) => sum + r.metrics.jaccardSimilarity, 0) / testResults.length,
            termPreservation: testResults.reduce((sum, r) => sum + r.metrics.termPreservation, 0) / testResults.length,
            entityPreservation: testResults.reduce((sum, r) => sum + r.metrics.entityPreservation, 0) / testResults.length,
            semanticOverlap: testResults.reduce((sum, r) => sum + r.metrics.semanticOverlap, 0) / testResults.length
        };

        const avgOverall = (
            avgMetrics.jaccardSimilarity * 0.25 +
            avgMetrics.termPreservation * 0.25 +
            avgMetrics.entityPreservation * 0.25 +
            avgMetrics.semanticOverlap * 0.25
        );

        setSummary({
            total: testResults.length,
            passed,
            failed: testResults.length - passed,
            passRate: passed / testResults.length,
            avgMetrics,
            avgOverall,
            totalTime: testResults.reduce((sum, r) => sum + (r.timings?.total || 0), 0)
        });

        setCurrentTest(null);
        setRunning(false);
    };

    // Stop tests
    const stopTests = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        setRunning(false);
        setCurrentTest(null);
    };

    // Export results
    const exportResults = () => {
        const report = {
            timestamp: new Date().toISOString(),
            summary,
            results: results.map(r => ({
                id: r.testCase.id,
                name: r.testCase.name,
                success: r.success,
                metrics: r.metrics,
                timings: r.timings,
                issues: r.issues
            }))
        };

        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `e2e-validation-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography variant="h6" fontWeight={700}>
                            <Award size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                            E2E Auto Validator
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Automatically validate knowledge reconstruction quality across test cases
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        {results.length > 0 && (
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<Download size={16} />}
                                onClick={exportResults}
                            >
                                Export
                            </Button>
                        )}
                        {running ? (
                            <Button
                                variant="contained"
                                color="error"
                                startIcon={<StopCircle size={16} />}
                                onClick={stopTests}
                            >
                                Stop
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                startIcon={<PlayCircle size={16} />}
                                onClick={runTests}
                                disabled={useCustom && !customText.trim()}
                            >
                                Run Validation
                            </Button>
                        )}
                    </Stack>
                </Stack>
            </Paper>

            {/* Settings */}
            <Accordion sx={{ mb: 2 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Settings size={18} />
                        <Typography variant="subtitle2">Validation Settings</Typography>
                    </Stack>
                </AccordionSummary>
                <AccordionDetails>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={useCustom}
                                        onChange={(e) => setUseCustom(e.target.checked)}
                                    />
                                }
                                label="Use custom input instead of golden dataset"
                            />
                        </Grid>
                        {useCustom && (
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={4}
                                    value={customText}
                                    onChange={(e) => setCustomText(e.target.value)}
                                    placeholder="Enter custom text to validate..."
                                    sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.85rem' } }}
                                />
                            </Grid>
                        )}
                        <Grid item xs={4}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={settings.searchOptions.expandQuery}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            searchOptions: { ...settings.searchOptions, expandQuery: e.target.checked }
                                        })}
                                    />
                                }
                                label="Query Expansion"
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={settings.searchOptions.enableReranking}
                                        onChange={(e) => setSettings({
                                            ...settings,
                                            searchOptions: { ...settings.searchOptions, enableReranking: e.target.checked }
                                        })}
                                    />
                                }
                                label="Reranking"
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <FormControl size="small" fullWidth>
                                <InputLabel>Max Results</InputLabel>
                                <Select
                                    value={settings.searchOptions.maxResults}
                                    label="Max Results"
                                    onChange={(e) => setSettings({
                                        ...settings,
                                        searchOptions: { ...settings.searchOptions, maxResults: e.target.value }
                                    })}
                                >
                                    {[3, 5, 10, 15, 20].map(n => (
                                        <MenuItem key={n} value={n}>{n}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </AccordionDetails>
            </Accordion>

            {/* Progress */}
            {running && (
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Stack spacing={1}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="subtitle2">
                                {currentTest ? `Testing: ${currentTest.name}` : 'Preparing...'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {progress.toFixed(0)}%
                            </Typography>
                        </Stack>
                        <LinearProgress variant="determinate" value={progress} />
                    </Stack>
                </Paper>
            )}

            {/* Summary */}
            {summary && (
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between">
                                <Typography variant="subtitle1" fontWeight={600}>
                                    <BarChart3 size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                                    Validation Summary
                                </Typography>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Chip
                                        icon={<CheckCircle size={14} />}
                                        label={`${summary.passed} Passed`}
                                        color="success"
                                        size="small"
                                    />
                                    {summary.failed > 0 && (
                                        <Chip
                                            icon={<XCircle size={14} />}
                                            label={`${summary.failed} Failed`}
                                            color="error"
                                            size="small"
                                        />
                                    )}
                                    <Chip
                                        icon={<Clock size={14} />}
                                        label={`${summary.totalTime}ms`}
                                        variant="outlined"
                                        size="small"
                                    />
                                </Stack>
                            </Stack>
                        </Grid>

                        <Grid item xs={12}>
                            <Paper sx={{ p: 2, bgcolor: summary.avgOverall >= QUALITY_THRESHOLDS.acceptable ? 'success.dark' : 'error.dark' }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Typography variant="h6" color="white">
                                        Overall Quality Score
                                    </Typography>
                                    <Typography variant="h3" fontWeight={700} color="white">
                                        {(summary.avgOverall * 100).toFixed(0)}%
                                    </Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    value={summary.avgOverall * 100}
                                    sx={{
                                        mt: 2,
                                        height: 10,
                                        borderRadius: 1,
                                        bgcolor: 'rgba(255,255,255,0.2)',
                                        '& .MuiLinearProgress-bar': { bgcolor: 'white' }
                                    }}
                                />
                                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                                    <Typography variant="caption" color="rgba(255,255,255,0.7)">
                                        Pass Rate: {(summary.passRate * 100).toFixed(0)}%
                                    </Typography>
                                    <Typography variant="caption" color="rgba(255,255,255,0.7)">
                                        {summary.avgOverall >= QUALITY_THRESHOLDS.excellent ? 'Excellent' :
                                         summary.avgOverall >= QUALITY_THRESHOLDS.good ? 'Good' :
                                         summary.avgOverall >= QUALITY_THRESHOLDS.acceptable ? 'Acceptable' : 'Needs Improvement'}
                                    </Typography>
                                </Stack>
                            </Paper>
                        </Grid>

                        <Grid item xs={3}>
                            <MetricCard
                                label="Avg Jaccard"
                                value={summary.avgMetrics.jaccardSimilarity}
                                icon={GitCompare}
                                description="Word overlap"
                            />
                        </Grid>
                        <Grid item xs={3}>
                            <MetricCard
                                label="Avg Term Preservation"
                                value={summary.avgMetrics.termPreservation}
                                icon={Zap}
                                description="Key terms retained"
                            />
                        </Grid>
                        <Grid item xs={3}>
                            <MetricCard
                                label="Avg Entity Preservation"
                                value={summary.avgMetrics.entityPreservation}
                                icon={Target}
                                description="Entities found"
                            />
                        </Grid>
                        <Grid item xs={3}>
                            <MetricCard
                                label="Avg Semantic Overlap"
                                value={summary.avgMetrics.semanticOverlap}
                                icon={Layers}
                                description="Concept coverage"
                            />
                        </Grid>
                    </Grid>
                </Paper>
            )}

            {/* Results Table */}
            {results.length > 0 && (
                <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <TableContainer sx={{ flex: 1 }}>
                        <Table stickyHeader size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell width={100}>Status</TableCell>
                                    <TableCell>Test Case</TableCell>
                                    <TableCell align="center" width={100}>Score</TableCell>
                                    <TableCell align="center" width={80}>Time</TableCell>
                                    <TableCell align="center" width={80}>Results</TableCell>
                                    <TableCell width={40}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {results.map((result, index) => (
                                    <TestResultRow
                                        key={result.testCase.id}
                                        result={result}
                                        expanded={expandedRow === index}
                                        onExpand={() => setExpandedRow(expandedRow === index ? null : index)}
                                    />
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Empty state */}
            {!running && results.length === 0 && (
                <Paper sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Stack alignItems="center" spacing={2}>
                        <Award size={48} color="#666" />
                        <Typography variant="h6" color="text.secondary">
                            Ready to Validate
                        </Typography>
                        <Typography variant="body2" color="text.secondary" textAlign="center">
                            Click "Run Validation" to test knowledge reconstruction<br />
                            across {GOLDEN_DATASET.length} UN-specific test cases
                        </Typography>
                    </Stack>
                </Paper>
            )}
        </Box>
    );
};

export default E2EAutoValidator;
