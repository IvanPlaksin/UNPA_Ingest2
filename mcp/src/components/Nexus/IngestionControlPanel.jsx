import React, { useEffect } from 'react';
import ReactFlow, {
    Background,
    Controls,
    useNodesState,
    useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';
import { ShieldCheck, Activity } from 'lucide-react';

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
        <div
            className="bg-white border-l border-gray-200 flex flex-col shrink-0 z-10 shadow-xl h-full"
            style={{ width: width }}
        >
            <div className="p-4 border-b border-gray-100">
                <h3 className="flex items-center gap-2 font-bold text-gray-800">
                    <ShieldCheck size={18} className="text-green-600" /> Ingestion Control
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                    Review the Nexus Graph below.
                </p>
            </div>

            {/* GRAPH VISUALIZATION */}
            <div className="flex-1 bg-gray-50 relative border-b border-gray-200 h-full w-full">
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
            </div>

            {/* ACTIONS */}
            <div className="p-4 bg-white">
                {!ingestionReport ? (
                    <div className="flex flex-col gap-4">
                        <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded border border-blue-100">
                            <strong>Ready to Process</strong>
                            <ul className="list-disc pl-4 mt-1 space-y-1">
                                <li>Core Fields: {Object.keys(fields).length}</li>
                                <li>Linked Artifacts: {(linkedArtifacts.commits?.length || 0) + (linkedArtifacts.tfvcChangesets?.length || 0)}</li>
                            </ul>
                        </div>
                        <button
                            onClick={onIngest}
                            disabled={isProcessing}
                            className="btn-primary w-full justify-center py-2 h-auto"
                        >
                            {isProcessing ? <Activity className="animate-spin" size={16} /> : "Approve & Ingest"}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 h-full">
                        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                            <strong>Processing Complete</strong>
                            <button
                                className="text-underline text-xs block mt-1 hover:text-green-900"
                                onClick={onResetReport}
                            >Reset</button>
                        </div>
                        <div className="flex-1 bg-gray-900 text-green-400 p-3 rounded text-xs font-mono overflow-auto max-h-40">
                            <pre className="whitespace-pre-wrap">{ingestionReport}</pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default IngestionControlPanel;
