// mcp/src/pages/WorkItemPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, { Background, Controls, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import { getWorkItemGraph, ingestWorkItems } from '../services/api';
import { Database, Search } from 'lucide-react';
import { Box, AppBar, Toolbar, Typography, Button, IconButton, Paper, Stack } from '@mui/material';
import dagre from 'dagre';

/** Apply dagre TB layout for work-item graphs */
const layoutWorkItemGraph = (rawNodes, rawEdges) => {
    if (!rawNodes || rawNodes.length === 0) return { nodes: rawNodes || [], edges: rawEdges || [] };

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', ranksep: 60, nodesep: 40 });
    rawNodes.forEach(n => g.setNode(n.id, { width: 180, height: 60 }));
    (rawEdges || []).forEach(e => {
        const src = e.source?.id || e.source;
        const tgt = e.target?.id || e.target;
        if (g.hasNode(src) && g.hasNode(tgt)) g.setEdge(src, tgt);
    });
    dagre.layout(g);

    const nodes = rawNodes.map(n => {
        const pos = g.node(n.id);
        return { ...n, position: n.position && (n.position.x || n.position.y) ? n.position : { x: pos.x - 90, y: pos.y - 30 } };
    });

    const edges = (rawEdges || []).map(e => ({
        ...e,
        type: 'smoothstep',
        markerEnd: e.markerEnd || { type: MarkerType.ArrowClosed },
    }));

    return { nodes, edges };
};

const WorkItemPage = () => {
    const { id } = useParams();
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        getWorkItemGraph(id).then(data => {
            const { nodes: ln, edges: le } = layoutWorkItemGraph(data.nodes, data.edges);
            setNodes(ln);
            setEdges(le);
        });
    }, [id]);

    const handleSingleIngest = async () => {
        setIsSyncing(true);
        try {
            await ingestWorkItems([parseInt(id)], 'manager@un.org');
            alert(`Задача #${id} отправлена на обновление в Базу Знаний.`);
        } catch (e) {
            alert("Ошибка: " + e.message);
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            {/* Header */}
            <AppBar position="static" color="default" elevation={1} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
                <Toolbar variant="dense">
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Work Item #{id} Investigation
                    </Typography>

                    <Stack direction="row" spacing={2}>
                        <Button
                            variant="contained"
                            color="success"
                            startIcon={<Database size={16} />}
                            onClick={handleSingleIngest}
                            disabled={isSyncing}
                            size="small"
                        >
                            {isSyncing ? 'Syncing...' : 'Sync to Knowledge Base'}
                        </Button>

                        <Button
                            variant="contained"
                            color="primary"
                            startIcon={<Search size={16} />}
                            onClick={() => alert('Запущен поиск...')}
                            size="small"
                        >
                            Find Related Emails
                        </Button>
                    </Stack>
                </Toolbar>
            </AppBar>

            {/* Content using ReactFlow */}
            <Box sx={{ flex: 1, position: 'relative', bgcolor: 'background.default' }}>
                <ReactFlow nodes={nodes} edges={edges} fitView>
                    <Background color="#aaa" gap={16} />
                    <Controls />
                </ReactFlow>
            </Box>
        </Box>
    );
};

export default WorkItemPage;
