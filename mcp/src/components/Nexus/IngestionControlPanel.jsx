import React, { useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    useNodesState,
    useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ShieldCheck, Activity } from 'lucide-react';
import {
    Paper,
    Box,
    Typography,
    Button,
    Stack,
    Alert,
    List,
    ListItem,
    CircularProgress
} from '@mui/material';

const IngestionControlPanel = ({ nexusModel, onIngest, isProcessing, ingestionReport, onResetReport, width, simulationGraph }) => {

    // Graph State
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    useEffect(() => {
        if (nexusModel) {
            buildGraph(nexusModel);
        }
    }, [nexusModel, simulationGraph]);

    const buildGraph = (model) => {
        if (!model || !model.core) return;

        const newNodes = [];
        const newEdges = [];

        // 1. Central Node (The Work Item)
        newNodes.push({
            id: 'root',
            type: 'input',
            data: { label: `WI #${model.core.id}` },
            position: { x: 250, y: 50 },
            style: { background: '#fff', border: '2px solid #009EDB', borderRadius: '5px', fontWeight: 'bold' }
        });

        let yOffset = 150;

        // 2. Parent
        if (model.relations?.hierarchy?.parent?.length > 0) {
            model.relations.hierarchy.parent.forEach((p, idx) => {
                const pId = `parent-${idx}`;
                newNodes.push({
                    id: pId,
                    data: { label: `Parent: ${p.url.split('/').pop()}` },
                    position: { x: 50 + (idx * 150), y: -50 },
                    style: { background: '#f0f0f0', fontSize: '12px' }
                });
                newEdges.push({ id: `e-root-${pId}`, source: pId, target: 'root', animated: true });
            });
        }

        // 3. Children
        if (model.relations?.hierarchy?.children?.length > 0) {
            model.relations.hierarchy.children.forEach((c, idx) => {
                const cId = `child-${idx}`;
                newNodes.push({
                    id: cId,
                    data: { label: `Child: ${c.url.split('/').pop()}` },
                    position: { x: 50 + (idx * 150), y: yOffset },
                    style: { background: '#e6ffec', fontSize: '12px' }
                });
                newEdges.push({ id: `e-root-${cId}`, source: 'root', target: cId });
            });
            yOffset += 100;
        }

        // 4. Commits / Changesets
        const artifacts = model.linkedArtifacts?.commits || model.linkedArtifacts?.tfvcChangesets || [];
        if (artifacts.length > 0) {
            artifacts.forEach((art, idx) => {
                const aId = `art-${idx}`;
                const label = art.type === 'tfvc' ? `CS ${art.id}` : `Commit ${art.id.substring(0, 6)}`;
                newNodes.push({
                    id: aId,
                    data: { label: label },
                    position: { x: 400, y: 50 + (idx * 60) },
                    style: { background: '#e3f2fd', fontSize: '11px', width: 100 }
                });
                newEdges.push({ id: `e-root-${aId}`, source: 'root', target: aId, style: { stroke: '#009EDB' } });
            });
        }

        // 5. Simulation Data (Graph)
        // Check both model.simulation (legacy/direct) and props.simulationGraph (new)
        const simData = simulationGraph || (model.simulation && model.simulation.graphData);

        if (simData) {
            const { nodes: simNodes, edges: simEdges } = simData;

            if (simNodes) {
                simNodes.forEach((node, index) => {
                    const isSimulated = true; // Always true for simulation data
                    const status = node.data?.status; // AI_VERIFIED, etc.

                    let borderColor = '#7c3aed'; // Purple for simulation
                    let borderStyle = 'dashed';
                    let icon = '🤖'; // Default AI

                    if (status === 'USER_VERIFIED') icon = '✅';
                    if (status === 'NOT_VERIFIED') icon = '❓';
                    if (status === 'REJECTED') icon = '❌';

                    // Check if node already exists (by ID)
                    const existingNode = newNodes.find(n => n.id === node.id);
                    if (existingNode) {
                        // Highlight existing node instead of adding duplicate
                        existingNode.style = {
                            ...existingNode.style,
                            border: `2px dashed ${borderColor}`,
                            boxShadow: '0 0 10px #7c3aed'
                        };
                        return;
                    }

                    newNodes.push({
                        id: node.id,
                        data: {
                            label: (
                                <div className="flex flex-col items-center">
                                    <span>{node.label || node.name || node.id}</span>
                                    <div className="flex items-center gap-1 text-[10px] mt-1 bg-black/50 px-1 rounded text-white">
                                        <span>{icon}</span>
                                        <span>{node.data?.initiator || 'AI'}</span>
                                    </div>
                                </div>
                            )
                        },
                        position: { x: 600 + (index * 150), y: 50 + (index % 2 * 100) }, // Offset to the right
                        style: {
                            background: '#f3e8ff', // Light purple background
                            color: '#1e293b',
                            border: `2px ${borderStyle} ${borderColor}`,
                            width: 180,
                            fontSize: '12px'
                        }
                    });
                });
            }

            if (simEdges) {
                simEdges.forEach(edge => {
                    newEdges.push({
                        id: edge.id || `sim_edge_${edge.source}_${edge.target}`,
                        source: edge.source,
                        target: edge.target,
                        label: edge.label,
                        animated: true,
                        style: { stroke: '#7c3aed', strokeDasharray: '5,5' },
                        labelStyle: { fill: '#7c3aed', fontSize: 10 }
                    });
                });
            }
        }

        setNodes(newNodes);
        setEdges(newEdges);
    };

    if (!nexusModel || !nexusModel.core) return null;

    const { core, linkedArtifacts = {} } = nexusModel;
    const fields = core.fields || {};

    return (
        <Paper
            elevation={3}
            sx={{
                width: width,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 10,
                borderLeft: 1,
                borderColor: 'divider'
            }}
        >
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <ShieldCheck size={18} color="green" />
                    <Typography variant="subtitle1" fontWeight="bold">Ingestion Control</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                    Review the Nexus Graph below.
                </Typography>
            </Box>

            {/* GRAPH VISUALIZATION */}
            <Box sx={{ flex: 1, bgcolor: 'background.default', position: 'relative', borderBottom: 1, borderColor: 'divider' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    fitView
                    attributionPosition="bottom-right"
                    style={{ width: '100%', height: '100%' }}
                >
                    <Background color="#aaa" gap={16} />
                    <Controls showInteractive={false} />
                </ReactFlow>
            </Box>

            {/* ACTIONS */}
            <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
                {!ingestionReport ? (
                    <Stack spacing={2}>
                        <Alert severity="info" sx={{ '& .MuiAlert-message': { width: '100%' } }}>
                            <Typography variant="subtitle2" fontWeight="bold">Ready to Process</Typography>
                            <Box component="ul" sx={{ pl: 2, mt: 0.5, mb: 0 }}>
                                <Typography component="li" variant="caption">Core Fields: {Object.keys(fields).length}</Typography>
                                <Typography component="li" variant="caption">
                                    Linked Artifacts: {(linkedArtifacts.commits?.length || 0) + (linkedArtifacts.tfvcChangesets?.length || 0)}
                                </Typography>
                            </Box>
                        </Alert>

                        <Button
                            variant="contained"
                            color="primary"
                            fullWidth
                            onClick={onIngest}
                            disabled={isProcessing}
                            startIcon={isProcessing ? <CircularProgress size={16} color="inherit" /> : <Activity size={16} />}
                        >
                            {isProcessing ? "Processing..." : "Approve & Ingest"}
                        </Button>
                    </Stack>
                ) : (
                    <Stack spacing={2} sx={{ height: '100%' }}>
                        <Alert severity="success" action={
                            <Button color="inherit" size="small" onClick={onResetReport}>
                                Reset
                            </Button>
                        }>
                            <Typography variant="subtitle2" fontWeight="bold">Processing Complete</Typography>
                        </Alert>
                        <Box sx={{
                            flex: 1,
                            bgcolor: 'grey.900',
                            color: 'success.light',
                            p: 1.5,
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            overflow: 'auto',
                            maxHeight: 160
                        }}>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{ingestionReport}</pre>
                        </Box>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};

export default IngestionControlPanel;
