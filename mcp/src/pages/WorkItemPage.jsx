// mcp/src/pages/WorkItemPage.jsx
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { getWorkItemGraph, ingestWorkItems } from '../services/api'; // ⭐ IMPORT
import { Database } from 'lucide-react';

const WorkItemPage = () => {
    const { id } = useParams();
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        getWorkItemGraph(id).then(data => {
            setNodes(data.nodes);
            setEdges(data.edges);
        });
    }, [id]);

    // ⭐ НОВАЯ ФУНКЦИЯ
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
        <div className="page-content" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <header style={{ padding: '20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Work Item #{id} Investigation</h1>

                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* ⭐ НОВАЯ КНОПКА */}
                    <button
                        onClick={handleSingleIngest}
                        disabled={isSyncing}
                        style={{ padding: '8px 16px', background: '#107c10', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Database size={16} />
                        {isSyncing ? 'Syncing...' : 'Sync to Knowledge Base'}
                    </button>

                    <button onClick={() => alert('Запущен поиск...')} style={{ padding: '8px 16px', background: '#0078d4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        🔍 Find Related Emails
                    </button>
                </div>
            </header>

            <div style={{ flex: 1, position: 'relative' }}>
                <ReactFlow nodes={nodes} edges={edges} fitView>
                    <Background />
                    <Controls />
                </ReactFlow>
            </div>
        </div>
    );
};

export default WorkItemPage;
