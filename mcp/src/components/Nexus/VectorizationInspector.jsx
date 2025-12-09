import React, { useState, useMemo } from 'react';
import { X, Activity, Search, BarChart2, Layers, ArrowRight, Terminal, Cpu, Database } from 'lucide-react';
import api from '../../services/api';

const VectorizationInspector = ({ chunks, stats, onClose, embedded = false }) => {
    const [query, setQuery] = useState("");
    const [queryVector, setQueryVector] = useState(null);
    const [isVectorizing, setIsVectorizing] = useState(false);

    // ... (rest of logic) ...

    // ... inside return ...
    <div>
        <h2 className="font-bold text-lg tracking-tight text-white">Vectorization QA</h2>
        <div className="text-xs text-gray-500 font-mono">
            MODEL: {stats?.model || 'UNKNOWN'} | ATOMS: {stats?.totalAtoms || chunks?.length || 0}
        </div>
    </div>

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
            // Handle both 'vector' (real) and 'vectorPreview' (simulated)
            const vec = chunk.vector || chunk.vectorPreview;
            // Note: vectorPreview might be truncated, so similarity might be approximate if using that
            // But for simulation, we might not have full vectors on frontend if we didn't send them.
            // In our ingestion service, we sent vectorPreview (50 dims).
            // If we want real similarity in simulation, we should probably send full vectors or handle it differently.
            // For now, let's assume if we have full vector we use it, otherwise we skip or use what we have (padding?)

            // If we only have preview, we can't really do cosine similarity against a full 768-dim query vector.
            // So for simulation, maybe we just mock the similarity or disable this feature?
            // Or better: In simulation mode, we returned `vectorPreview`. 
            // Let's check if we have full vector.

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
            <div className="h-full flex flex-col items-center justify-center text-gray-500 p-8 text-center">
                <Activity size={48} className="mb-4 opacity-20" />
                <p>No vector data available.</p>
                <p className="text-xs mt-2">Analyze an attachment to see vectorization details.</p>
            </div>
        );
        return null;
    }

    const containerClasses = embedded
        ? "w-full h-full bg-gray-900 text-gray-100 flex flex-col font-sans"
        : "fixed inset-0 bg-black bg-opacity-70 z-50 flex justify-end backdrop-blur-sm";

    const innerClasses = embedded
        ? "w-full h-full flex flex-col"
        : "w-[600px] h-full bg-gray-900 text-gray-100 shadow-2xl flex flex-col font-sans border-l border-gray-800";

    // Helper to visualize vector as a heatmap bar
    const VectorHeatmap = ({ vector }) => {
        if (!vector) return null;
        return (
            <div className="flex h-4 w-full bg-gray-900 rounded overflow-hidden" title="Vector Heatmap (First 50 dims)">
                {vector.slice(0, 50).map((val, idx) => {
                    // Normalize -1..1 to color
                    const intensity = Math.abs(val);
                    const color = val > 0 ? `rgba(59, 130, 246, ${intensity})` : `rgba(239, 68, 68, ${intensity})`; // Blue (+), Red (-)
                    return (
                        <div key={idx} style={{ flex: 1, backgroundColor: color }} />
                    );
                })}
            </div>
        );
    };

    return (
        <div className={containerClasses} style={!embedded ? { overflowY: 'auto', height: '100%' } : {}}>
            <div className={innerClasses}>

                {/* Header - Hide close button if embedded */}
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-900/30 p-2 rounded text-blue-400">
                            <Activity size={20} />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg tracking-tight text-white">Vectorization QA</h2>
                            <div className="text-xs text-gray-500 font-mono">
                                MODEL: {stats?.model || 'UNKNOWN'} | ATOMS: {stats?.totalAtoms || chunks?.length || 0}
                            </div>
                        </div>
                    </div>
                    {!embedded && (
                        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Similarity Sandbox */}
                <div className="p-5 border-b border-gray-800 bg-gray-900/50">
                    <label className="text-xs font-bold text-gray-400 uppercase mb-2 block flex items-center gap-2">
                        <Search size={12} /> Similarity Sandbox
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleTestQuery()}
                            placeholder="Type a query to test semantic search..."
                            className="flex-1 bg-gray-950 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none placeholder-gray-600"
                        />
                        <button
                            onClick={handleTestQuery}
                            disabled={isVectorizing || !query}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isVectorizing ? <Activity size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                            Test
                        </button>
                    </div>
                    {queryVector && (
                        <div className="mt-2 text-xs text-green-400 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            Query Vectorized ({queryVector.length} dims)
                        </div>
                    )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 border-b border-gray-800 bg-gray-950/50">
                    <div className="p-3 border-r border-gray-800 text-center">
                        <div className="text-xs text-gray-500 uppercase mb-1">Chunks</div>
                        <div className="text-xl font-mono font-bold text-white">{chunks.length}</div>
                    </div>
                    <div className="p-3 border-r border-gray-800 text-center">
                        <div className="text-xs text-gray-500 uppercase mb-1">Avg Tokens</div>
                        <div className="text-xl font-mono font-bold text-white">
                            {Math.round(chunks.reduce((acc, c) => acc + (c.tokens || c.tokenCount || 0), 0) / chunks.length)}
                        </div>
                    </div>
                    <div className="p-3 text-center">
                        <div className="text-xs text-gray-500 uppercase mb-1">Top Score</div>
                        <div className={`text-xl font-mono font-bold ${queryVector ? 'text-green-400' : 'text-gray-600'}`}>
                            {queryVector ? (sortedChunks[0]?.similarity || 0).toFixed(3) : '-'}
                        </div>
                    </div>
                </div>

                {/* Chunks List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-900">
                    {sortedChunks.map((chunk, idx) => (
                        <div key={chunk.id || idx} className={`border rounded p-4 transition-all ${chunk.similarity > 0.7 ? 'border-green-500/50 bg-green-900/10' : 'border-gray-800 bg-gray-950'}`}>

                            {/* Chunk Header */}
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="px-1.5 py-0.5 bg-gray-800 text-gray-400 text-[10px] rounded font-mono">
                                        #{idx + 1}
                                    </span>
                                    {chunk.context && (
                                        <span className="px-1.5 py-0.5 bg-gray-700 text-gray-300 text-[10px] rounded font-sans border border-gray-600">
                                            {chunk.context.length > 30 ? chunk.context.substring(0, 30) + '...' : chunk.context}
                                        </span>
                                    )}
                                    <span className="text-xs text-gray-500 font-mono">
                                        {chunk.tokens || chunk.tokenCount} TOKENS
                                    </span>
                                </div>
                                {chunk.similarity !== undefined && (
                                    <div className={`text-xs font-mono font-bold px-2 py-1 rounded ${chunk.similarity > 0.7 ? 'bg-green-900 text-green-400' :
                                        chunk.similarity > 0.4 ? 'bg-yellow-900/50 text-yellow-400' : 'bg-gray-800 text-gray-500'
                                        }`}>
                                        SIM: {chunk.similarity.toFixed(4)}
                                    </div>
                                )}
                            </div>

                            {/* Text Preview */}
                            <p className="text-sm text-gray-300 mb-2 font-sans leading-relaxed border-l-2 border-gray-800 pl-3">
                                {chunk.content || chunk.text}
                            </p>
                            {chunk.summary && (
                                <div className="mb-4 pl-3 border-l-2 border-blue-900/50">
                                    <p className="text-xs text-blue-400 italic">
                                        AI Summary: {chunk.summary}
                                    </p>
                                </div>
                            )}

                            {/* Vector Heatmap */}
                            <div className="bg-black/50 p-2 rounded border border-gray-800">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] text-gray-500 uppercase font-bold flex items-center gap-1">
                                        <BarChart2 size={10} /> Vector Heatmap (First 50 dims)
                                    </span>
                                </div>
                                <VectorHeatmap vector={chunk.vector || chunk.vectorPreview} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default VectorizationInspector;
