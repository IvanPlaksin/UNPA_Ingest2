import React, { useState, useMemo } from 'react';
import { X, Activity, Search, BarChart2, Layers, ArrowRight, Terminal, Cpu, Database } from 'lucide-react';
import api from '../../services/api';
import {
    Paper,
    Box,
    Typography,
    TextField,
    Button,
    IconButton,
    InputAdornment,
    Grid,
    Stack,
    Chip,
    Tooltip,
    alpha
} from '@mui/material';

const VectorizationInspector = ({ chunks, stats, onClose, embedded = false }) => {
    const [query, setQuery] = useState("");
    const [queryVector, setQueryVector] = useState(null);
    const [isVectorizing, setIsVectorizing] = useState(false);

    // --- Logic: Cosine Similarity ---
    const cosineSimilarity = (vecA, vecB) => {
        if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    // --- Logic: Sort Chunks by Similarity ---
    const sortedChunks = useMemo(() => {
        if (!queryVector || !chunks) return chunks;
        return [...chunks].map(chunk => {
            const vec = chunk.vector || chunk.vectorPreview;
            if (!vec || (queryVector.length !== vec.length)) return { ...chunk, similarity: 0 };
            const sim = cosineSimilarity(queryVector, vec);
            return { ...chunk, similarity: sim };
        }).sort((a, b) => b.similarity - a.similarity);
    }, [chunks, queryVector]);

    const handleTestQuery = async () => {
        if (!query.trim()) return;
        setIsVectorizing(true);
        try {
            const res = await api.post('/knowledge/vectorize-query', { text: query });
            setQueryVector(res.data.vector);
        } catch (e) {
            console.error("Vectorization failed", e);
            alert("Vectorization failed: " + e.message);
        } finally {
            setIsVectorizing(false);
        }
    };

    if (!chunks || chunks.length === 0) {
        if (embedded) return (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'text.secondary', p: 4, textAlign: 'center' }}>
                <Activity size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
                <Typography variant="body1">No vector data available.</Typography>
                <Typography variant="caption">Analyze an attachment to see vectorization details.</Typography>
            </Box>
        );
        return null;
    }

    // Styles container
    const containerSx = embedded ? {
        width: '100%',
        height: '100%',
        bgcolor: 'background.default',
        color: 'text.primary',
        display: 'flex',
        flexDirection: 'column'
    } : {
        position: 'fixed',
        inset: 0,
        bgcolor: 'rgba(0,0,0,0.7)',
        zIndex: 1300,
        display: 'flex',
        justifyContent: 'flex-end',
        backdropFilter: 'blur(4px)'
    };

    const innerSx = embedded ? {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
    } : {
        width: 600,
        height: '100%',
        bgcolor: 'background.paper',
        color: 'text.primary',
        boxShadow: 24,
        display: 'flex',
        flexDirection: 'column',
    };

    // Helper to visualize vector as a heatmap bar
    const VectorHeatmap = ({ vector }) => {
        if (!vector) return null;
        return (
            <Tooltip title="Vector Heatmap (First 50 dims)">
                <Box sx={{ display: 'flex', height: 16, width: '100%', bgcolor: 'action.hover', borderRadius: 0.5, overflow: 'hidden' }}>
                    {vector.slice(0, 50).map((val, idx) => {
                        const intensity = Math.abs(val);
                        // Blue (+), Red (-)
                        const color = val > 0
                            ? `rgba(59, 130, 246, ${intensity})`
                            : `rgba(239, 68, 68, ${intensity})`;
                        return (
                            <Box key={idx} sx={{ flex: 1, bgcolor: color }} />
                        );
                    })}
                </Box>
            </Tooltip>
        );
    };

    return (
        <Box sx={containerSx}>
            <Paper elevation={embedded ? 0 : 24} sx={innerSx} square={!embedded}>

                {/* Header */}
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'background.paper' }}>
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Box sx={{ bgcolor: alpha('#1a1a1a', 0.05), p: 1, borderRadius: 1 }}>
                            <Activity size={20} className="text-blue-600" />
                        </Box>
                        <Box>
                            <Typography variant="h6" fontSize="1.125rem" fontWeight="bold">Vectorization QA</Typography>
                            <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                                MODEL: {stats?.model || 'UNKNOWN'} | ATOMS: {stats?.totalAtoms || chunks?.length || 0}
                            </Typography>
                        </Box>
                    </Stack>
                    {!embedded && (
                        <IconButton onClick={onClose} size="small">
                            <X size={20} />
                        </IconButton>
                    )}
                </Box>

                {/* Similarity Sandbox */}
                <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                    <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ textTransform: 'uppercase', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Search size={12} /> Similarity Sandbox
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <TextField
                            fullWidth
                            size="small"
                            variant="outlined"
                            placeholder="Type a query to test semantic search..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleTestQuery()}
                            sx={{ bgcolor: 'background.paper' }}
                        />
                        <Button
                            variant="contained"
                            onClick={handleTestQuery}
                            disabled={isVectorizing || !query}
                            startIcon={isVectorizing ? null : <ArrowRight size={16} />}
                            sx={{ minWidth: 100 }}
                        >
                            {isVectorizing ? <Activity size={16} className="animate-spin" /> : "Test"}
                        </Button>
                    </Stack>
                    {queryVector && (
                        <Typography variant="caption" sx={{ color: 'success.main', display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                            <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main' }} />
                            Query Vectorized ({queryVector.length} dims)
                        </Typography>
                    )}
                </Box>

                {/* Stats */}
                <Box sx={{ bgcolor: 'background.default', borderBottom: 1, borderColor: 'divider' }}>
                    <Grid container>
                        <Grid item xs={4} sx={{ p: 1.5, textAlign: 'center', borderRight: 1, borderColor: 'divider' }}>
                            <Typography variant="caption" color="text.secondary" textTransform="uppercase">Chunks</Typography>
                            <Typography variant="h6" fontFamily="monospace" fontWeight="bold">{chunks.length}</Typography>
                        </Grid>
                        <Grid item xs={4} sx={{ p: 1.5, textAlign: 'center', borderRight: 1, borderColor: 'divider' }}>
                            <Typography variant="caption" color="text.secondary" textTransform="uppercase">Avg Tokens</Typography>
                            <Typography variant="h6" fontFamily="monospace" fontWeight="bold">
                                {Math.round(chunks.reduce((acc, c) => acc + (c.tokens || c.tokenCount || 0), 0) / chunks.length)}
                            </Typography>
                        </Grid>
                        <Grid item xs={4} sx={{ p: 1.5, textAlign: 'center' }}>
                            <Typography variant="caption" color="text.secondary" textTransform="uppercase">Top Score</Typography>
                            <Typography
                                variant="h6"
                                fontFamily="monospace"
                                fontWeight="bold"
                                color={queryVector ? 'success.main' : 'text.disabled'}
                            >
                                {queryVector ? (sortedChunks[0]?.similarity || 0).toFixed(3) : '-'}
                            </Typography>
                        </Grid>
                    </Grid>
                </Box>

                {/* Chunks List */}
                <Box sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: 'background.default' }}>
                    <Stack spacing={2}>
                        {sortedChunks.map((chunk, idx) => (
                            <Paper
                                key={chunk.id || idx}
                                variant="outlined"
                                sx={{
                                    p: 2,
                                    bgcolor: chunk.similarity > 0.7 ? alpha('#4caf50', 0.08) : 'background.paper',
                                    borderColor: chunk.similarity > 0.7 ? 'success.light' : 'divider',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {/* Chunk Header */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <Chip label={`#${idx + 1}`} size="small" sx={{ height: 20, fontSize: '0.65rem', borderRadius: 0.5, fontFamily: 'monospace' }} />
                                        {chunk.context && (
                                            <Chip
                                                label={chunk.context.length > 30 ? chunk.context.substring(0, 30) + '...' : chunk.context}
                                                size="small"
                                                variant="outlined"
                                                sx={{ height: 20, fontSize: '0.65rem' }}
                                            />
                                        )}
                                        <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                                            {chunk.tokens || chunk.tokenCount} TOKENS
                                        </Typography>
                                    </Stack>
                                    {chunk.similarity !== undefined && (
                                        <Chip
                                            label={`SIM: ${chunk.similarity.toFixed(4)}`}
                                            size="small"
                                            sx={{
                                                height: 24,
                                                fontSize: '0.75rem',
                                                fontFamily: 'monospace',
                                                fontWeight: 'bold',
                                                bgcolor: chunk.similarity > 0.7 ? 'success.dark' : (chunk.similarity > 0.4 ? 'warning.dark' : 'action.disabledBackground'),
                                                color: chunk.similarity > 0.4 ? 'common.white' : 'text.secondary'
                                            }}
                                        />
                                    )}
                                </Box>

                                {/* Text Preview */}
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{
                                        mb: 1,
                                        pl: 1.5,
                                        borderLeft: 2,
                                        borderColor: 'divider',
                                        whiteSpace: 'pre-wrap',
                                        fontFamily: 'sans-serif'
                                    }}
                                >
                                    {chunk.content || chunk.text}
                                </Typography>

                                {chunk.summary && (
                                    <Box sx={{ mb: 2, pl: 1.5, borderLeft: 2, borderColor: 'primary.light' }}>
                                        <Typography variant="caption" color="primary.main" fontStyle="italic">
                                            AI Summary: {chunk.summary}
                                        </Typography>
                                    </Box>
                                )}

                                {/* Vector Heatmap */}
                                <Box sx={{ bgcolor: 'action.hover', p: 1, borderRadius: 1, border: 1, borderColor: 'divider' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                                        <BarChart2 size={10} className="text-gray-500" />
                                        <Typography variant="caption" fontWeight="bold" color="text.secondary" fontSize="0.65rem" textTransform="uppercase">
                                            Vector Heatmap (First 50 dims)
                                        </Typography>
                                    </Box>
                                    <VectorHeatmap vector={chunk.vector || chunk.vectorPreview} />
                                </Box>
                            </Paper>
                        ))}
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default VectorizationInspector;
