/**
 * Pipeline Stages Visualizer
 *
 * Interactive component for observing text transformation through the processing pipeline:
 * Input -> Sanitization -> Language Detection -> Chunking -> Entity Extraction
 *
 * @module components/PipelineLab/PipelineStagesVisualizer
 */

import React, { useState, useCallback } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Stepper,
    Step,
    StepLabel,
    StepContent,
    Card,
    CardContent,
    Chip,
    Stack,
    Alert,
    CircularProgress,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Grid,
    IconButton,
    Tooltip,
    LinearProgress,
    Divider
} from '@mui/material';
import {
    Play,
    RotateCcw,
    ChevronDown,
    FileText,
    Languages,
    Scissors,
    Tags,
    Sparkles,
    Copy,
    CheckCircle2,
    XCircle,
    Info,
    Zap
} from 'lucide-react';
import api from '../../services/api';

const PIPELINE_STAGES = [
    { id: 'input', label: 'Input Text', icon: FileText, description: 'Original text to process' },
    { id: 'sanitization', label: 'Sanitization', icon: Sparkles, description: 'Clean HTML, normalize whitespace, preserve code blocks' },
    { id: 'language', label: 'Language Detection', icon: Languages, description: 'Detect primary language and script' },
    { id: 'chunking', label: 'Chunking', icon: Scissors, description: 'Split into semantic chunks for embedding' },
    { id: 'entities', label: 'Entity Extraction', icon: Tags, description: 'Extract UN systems, organizations, persons' }
];

const SAMPLE_TEXTS = [
    {
        id: 'leave-request',
        label: 'Leave Request (EN)',
        text: `Subject: Annual Leave Request - ST/AI/2023/1

Dear HR Team,

I am writing to request annual leave from January 15, 2024 to January 22, 2024.
As per ST/AI/2023/1 (Administrative instruction on leave), I have 25 days of
annual leave entitlement remaining. This request is submitted through IMIS
as required by OICT guidelines.

My supervisor, Mr. John Smith from DGACM, has approved this request.
Please process through Umoja as per standard procedure.

Best regards,
Jane Doe
P-4, Department of Management Strategy`
    },
    {
        id: 'technical-spec',
        label: 'Technical Spec (EN)',
        text: `Technical Specification: Inspira Integration with Unite Identity

This document describes the integration between Inspira (UN talent management system)
and Unite Identity (Single Sign-On). The integration uses SAML 2.0 protocol
and requires coordination with OICT's Identity Management team.

Key components:
1. Authentication flow via Azure AD B2C
2. Token exchange with Inspira backend (Java/Spring Boot)
3. User provisioning sync with LDAP directory
4. Audit logging to ServiceNow ITSM

Dependencies: Inspira v5.2.1, Unite Identity SAML endpoint, Redis cache, PostgreSQL`
    },
    {
        id: 'french-report',
        label: 'Annual Report (FR)',
        text: `Rapport annuel - Département de l'Assemblée générale (DGACM)

Ce rapport présente les activités du département pour l'année 2023.
Les services de traduction ont traité plus de 500,000 pages dans les
six langues officielles de l'ONU: anglais, arabe, chinois, espagnol,
français et russe.

Le système Umoja a été utilisé pour la gestion financière, tandis que
gDoc a servi pour la gestion documentaire. L'intégration avec IMIS
pour les ressources humaines reste en cours.`
    }
];

const StageCard = ({ stage, data, isActive, isComplete }) => {
    const [expanded, setExpanded] = useState(true);
    const Icon = stage.icon;

    const getStatusColor = () => {
        if (isActive) return 'primary.main';
        if (isComplete) return 'success.main';
        return 'text.disabled';
    };

    return (
        <Card
            sx={{
                mb: 2,
                border: 1,
                borderColor: isActive ? 'primary.main' : isComplete ? 'success.main' : 'divider',
                bgcolor: isActive ? 'action.hover' : 'background.paper'
            }}
        >
            <Accordion expanded={expanded} onChange={() => setExpanded(!expanded)}>
                <AccordionSummary expandIcon={<ChevronDown size={20} />}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ width: '100%' }}>
                        <Box sx={{ color: getStatusColor() }}>
                            <Icon size={24} />
                        </Box>
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" fontWeight={600}>
                                {stage.label}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {stage.description}
                            </Typography>
                        </Box>
                        {isComplete && (
                            <Chip
                                icon={<CheckCircle2 size={14} />}
                                label="Complete"
                                size="small"
                                color="success"
                                variant="outlined"
                            />
                        )}
                        {isActive && (
                            <CircularProgress size={20} />
                        )}
                    </Stack>
                </AccordionSummary>
                <AccordionDetails>
                    {data ? (
                        <StageContent stage={stage.id} data={data} />
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            Waiting for processing...
                        </Typography>
                    )}
                </AccordionDetails>
            </Accordion>
        </Card>
    );
};

const StageContent = ({ stage, data }) => {
    switch (stage) {
        case 'input':
            return (
                <Box>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {data.text}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Chip label={`${data.length} chars`} size="small" variant="outlined" />
                        <Chip label={`${data.words} words`} size="small" variant="outlined" />
                        <Chip label={`${data.lines} lines`} size="small" variant="outlined" />
                    </Stack>
                </Box>
            );

        case 'sanitization':
            return (
                <Box>
                    <Typography variant="subtitle2" gutterBottom>Sanitized Text:</Typography>
                    <Paper sx={{ p: 2, bgcolor: 'background.default', mb: 2 }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                            {data.text}
                        </Typography>
                    </Paper>
                    {data.changes && Object.keys(data.changes).length > 0 && (
                        <>
                            <Typography variant="subtitle2" gutterBottom>Changes Applied:</Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                {Object.entries(data.changes).map(([key, value]) => (
                                    <Chip
                                        key={key}
                                        label={`${key}: ${value}`}
                                        size="small"
                                        color="info"
                                        variant="outlined"
                                    />
                                ))}
                            </Stack>
                        </>
                    )}
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Chip
                            label={`${data.originalLength} -> ${data.newLength} chars`}
                            size="small"
                            color={data.originalLength !== data.newLength ? 'warning' : 'success'}
                        />
                        {data.removed > 0 && (
                            <Chip label={`-${data.removed} removed`} size="small" color="warning" />
                        )}
                    </Stack>
                </Box>
            );

        case 'language':
            return (
                <Box>
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="h3" color="primary.main">
                                    {data.language?.toUpperCase()}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Detected Language
                                </Typography>
                            </Paper>
                        </Grid>
                        <Grid item xs={6}>
                            <Paper sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="h3" color="primary.main">
                                    {(data.confidence * 100).toFixed(0)}%
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Confidence
                                </Typography>
                            </Paper>
                        </Grid>
                    </Grid>
                    {data.scripts && data.scripts.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>Detected Scripts:</Typography>
                            <Stack direction="row" spacing={1}>
                                {data.scripts.map((script, i) => (
                                    <Chip key={i} label={script} size="small" variant="outlined" />
                                ))}
                            </Stack>
                        </Box>
                    )}
                </Box>
            );

        case 'chunking':
            return (
                <Box>
                    <Typography variant="subtitle2" gutterBottom>
                        {data.chunks?.length || 0} Chunks Created
                    </Typography>
                    {data.chunks?.map((chunk, i) => (
                        <Paper key={i} sx={{ p: 2, mb: 1, bgcolor: 'background.default' }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="caption" fontWeight={600}>
                                    Chunk {i + 1}
                                </Typography>
                                <Chip label={`~${chunk.tokens} tokens`} size="small" />
                            </Stack>
                            <Typography
                                variant="body2"
                                sx={{
                                    whiteSpace: 'pre-wrap',
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                    maxHeight: 100,
                                    overflow: 'auto'
                                }}
                            >
                                {chunk.preview}
                            </Typography>
                        </Paper>
                    ))}
                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                        <Chip label={`Total: ${data.totalTokens} tokens`} size="small" color="info" />
                        <Chip label={`Overlap: ${((data.overlapRatio || 0) * 100).toFixed(0)}%`} size="small" />
                    </Stack>
                </Box>
            );

        case 'entities':
            return (
                <Box>
                    <Typography variant="subtitle2" gutterBottom>
                        {data.entities?.length || 0} Entities Extracted
                    </Typography>
                    {data.entities && data.entities.length > 0 ? (
                        <Grid container spacing={1}>
                            {Object.entries(
                                data.entities.reduce((acc, e) => {
                                    const type = e.type || 'unknown';
                                    if (!acc[type]) acc[type] = [];
                                    acc[type].push(e);
                                    return acc;
                                }, {})
                            ).map(([type, entities]) => (
                                <Grid item xs={12} key={type}>
                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                        {type.toUpperCase()}
                                    </Typography>
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                        {entities.map((e, i) => (
                                            <Chip
                                                key={i}
                                                label={e.name || e.text}
                                                size="small"
                                                color={
                                                    type === 'System' ? 'primary' :
                                                    type === 'Organization' ? 'secondary' :
                                                    type === 'Person' ? 'success' :
                                                    type === 'Document' ? 'warning' :
                                                    'default'
                                                }
                                                variant="outlined"
                                            />
                                        ))}
                                    </Stack>
                                </Grid>
                            ))}
                        </Grid>
                    ) : (
                        <Alert severity="info" sx={{ mt: 1 }}>
                            No entities were extracted from this text
                        </Alert>
                    )}
                </Box>
            );

        default:
            return <Typography>Unknown stage</Typography>;
    }
};

const PipelineStagesVisualizer = () => {
    const [inputText, setInputText] = useState('');
    const [processing, setProcessing] = useState(false);
    const [currentStage, setCurrentStage] = useState(-1);
    const [stageResults, setStageResults] = useState({});
    const [error, setError] = useState(null);

    const loadSample = (sample) => {
        setInputText(sample.text);
        resetResults();
    };

    const resetResults = () => {
        setStageResults({});
        setCurrentStage(-1);
        setError(null);
    };

    const processText = async () => {
        if (!inputText.trim()) {
            setError('Please enter some text to process');
            return;
        }

        setProcessing(true);
        setError(null);
        setStageResults({});

        try {
            // Stage 0: Input analysis
            setCurrentStage(0);
            const inputData = {
                text: inputText,
                length: inputText.length,
                words: inputText.split(/\s+/).filter(w => w.length > 0).length,
                lines: inputText.split('\n').length
            };
            setStageResults(prev => ({ ...prev, input: inputData }));
            await new Promise(r => setTimeout(r, 500));

            // Call API for full analysis
            setCurrentStage(1);
            const response = await api.post('/knowledge/analyze', {
                text: inputText,
                options: {
                    chunk: true,
                    chunkSize: 512,
                    overlap: 50
                }
            });

            const result = response.data;

            // Stage 1: Sanitization
            setStageResults(prev => ({
                ...prev,
                sanitization: {
                    text: result.sanitized?.text || inputText,
                    changes: result.sanitized?.changes || {},
                    originalLength: inputText.length,
                    newLength: result.sanitized?.text?.length || inputText.length,
                    removed: inputText.length - (result.sanitized?.text?.length || inputText.length)
                }
            }));
            await new Promise(r => setTimeout(r, 300));

            // Stage 2: Language Detection
            setCurrentStage(2);
            setStageResults(prev => ({
                ...prev,
                language: {
                    language: result.language?.language || 'en',
                    confidence: result.language?.confidence || 0,
                    scripts: result.language?.scripts || []
                }
            }));
            await new Promise(r => setTimeout(r, 300));

            // Stage 3: Chunking
            setCurrentStage(3);
            const chunks = result.chunks?.items || [];
            const totalTokens = chunks.reduce((sum, c) => sum + (c.tokens || 0), 0);
            setStageResults(prev => ({
                ...prev,
                chunking: {
                    chunks: chunks.map(c => ({
                        preview: c.content,
                        tokens: c.tokens
                    })),
                    totalTokens,
                    overlapRatio: totalTokens > inputData.words ? (totalTokens - inputData.words) / inputData.words : 0
                }
            }));
            await new Promise(r => setTimeout(r, 300));

            // Stage 4: Entity Extraction
            setCurrentStage(4);
            setStageResults(prev => ({
                ...prev,
                entities: {
                    entities: result.entities || []
                }
            }));

            setCurrentStage(5); // All complete

        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Processing failed');
            setCurrentStage(-1);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography variant="h6" fontWeight={700}>
                            <Zap size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
                            Pipeline Stages Visualizer
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Observe how text transforms through each processing stage
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button
                            variant="outlined"
                            startIcon={<RotateCcw size={16} />}
                            onClick={resetResults}
                            disabled={processing}
                        >
                            Reset
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={processing ? <CircularProgress size={16} color="inherit" /> : <Play size={16} />}
                            onClick={processText}
                            disabled={processing || !inputText.trim()}
                        >
                            {processing ? 'Processing...' : 'Process'}
                        </Button>
                    </Stack>
                </Stack>
            </Paper>

            {/* Main Content */}
            <Grid container spacing={2} sx={{ flex: 1, overflow: 'hidden' }}>
                {/* Left Panel - Input */}
                <Grid item xs={12} md={5}>
                    <Paper sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="subtitle2" gutterBottom>
                            Input Text
                        </Typography>

                        {/* Sample Buttons */}
                        <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                            {SAMPLE_TEXTS.map(sample => (
                                <Chip
                                    key={sample.id}
                                    label={sample.label}
                                    onClick={() => loadSample(sample)}
                                    clickable
                                    size="small"
                                    variant="outlined"
                                />
                            ))}
                        </Stack>

                        <TextField
                            multiline
                            fullWidth
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Paste or type text to analyze..."
                            sx={{
                                flex: 1,
                                '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' },
                                '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.85rem' }
                            }}
                            disabled={processing}
                        />

                        {inputText && (
                            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                <Chip label={`${inputText.length} chars`} size="small" />
                                <Chip label={`${inputText.split(/\s+/).filter(w => w).length} words`} size="small" />
                            </Stack>
                        )}
                    </Paper>
                </Grid>

                {/* Right Panel - Pipeline Stages */}
                <Grid item xs={12} md={7}>
                    <Box sx={{ height: '100%', overflow: 'auto', pr: 1 }}>
                        {error && (
                            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                                {error}
                            </Alert>
                        )}

                        {PIPELINE_STAGES.map((stage, index) => (
                            <StageCard
                                key={stage.id}
                                stage={stage}
                                data={stageResults[stage.id]}
                                isActive={currentStage === index}
                                isComplete={currentStage > index}
                            />
                        ))}
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default PipelineStagesVisualizer;
