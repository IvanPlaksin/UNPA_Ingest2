const { v4: uuidv4 } = require('uuid');

class NexusOrchestrator {
    /**
     * Orchestrates the analysis of an entity across multiple sources.
     * @param {Object} context - { entityType, entityId, activeSources }
     * @param {Function} emit - Callback (eventName, data) => void
     */
    async analyze(context, emit) {
        const { entityType, entityId, activeSources } = context;
        console.log(`[Nexus] Starting analysis for ${entityType}:${entityId} on sources: ${activeSources.join(', ')}`);

        // Emit initial status
        emit('progress', { source: 'System', message: 'Initializing Nexus Engine...' });

        // Simulate initial delay
        await this._sleep(500);

        const tasks = [];

        // 1. ADO Analysis (Mock)
        if (activeSources.includes('ado')) {
            tasks.push(this._analyzeAdo(entityId, emit));
        }

        // 2. Git Analysis (Mock)
        if (activeSources.includes('git')) {
            tasks.push(this._analyzeGit(entityId, emit));
        }

        // 3. Knowledge Base / Vector Search (Mock)
        if (activeSources.includes('kb')) {
            tasks.push(this._analyzeKnowledgeBase(entityId, emit));
        }

        // 4. SQL Extractions
        if (activeSources.includes('sql')) {
            tasks.push(this._analyzeSql(entityId, emit, context.sqlFilters));
        }

        // Run all tasks (they emit their own progress)
        await Promise.all(tasks);

        emit('progress', { source: 'System', message: 'Analysis Complete.' });
        emit('done', {});
    }

    async _analyzeAdo(id, emit) {
        const adoService = require('./ado.service');
        emit('progress', { source: 'ADO', message: 'Connecting to Azure DevOps...' });

        try {
            // 1. Fetch Seed Item
            emit('progress', { source: 'ADO', message: `Fetching Work Item ${id} details...` });
            const seedItem = await adoService.getWorkItemById(id);

            if (!seedItem) {
                emit('error', { message: `Work Item ${id} not found` });
                return;
            }

            // 2. Identify Relations
            const relations = seedItem.relations || [];
            emit('progress', { source: 'ADO', message: `Found ${relations.length} relations. Analyzing...` });

            // 3. Separate Relations by Type
            const workItemIds = [];
            const otherRelations = [];

            // Explicitly check for System.Parent field
            if (seedItem.fields['System.Parent']) {
                const rawParent = seedItem.fields['System.Parent'];
                const parentId = parseInt(rawParent);
                emit('progress', { source: 'Nexus', message: `[DEBUG] Raw Parent Field: ${rawParent} (Type: ${typeof rawParent}) -> Parsed: ${parentId}` });

                if (!isNaN(parentId)) {
                    // Check if already in relations
                    const exists = workItemIds.includes(parentId);
                    if (!exists) {
                        workItemIds.push(parentId);
                        emit('progress', { source: 'Nexus', message: `[DEBUG] Added Parent ID ${parentId} to fetch list (was missing from relations).` });
                    } else {
                        emit('progress', { source: 'Nexus', message: `[DEBUG] Parent ID ${parentId} was already in relations.` });
                    }
                }
            }

            for (const rel of relations) {
                // Check if it's a Work Item link
                // URL structure usually: .../_apis/wit/workItems/{id}
                const match = rel.url.match(/_apis\/wit\/workItems\/(\d+)/i);
                if (match) {
                    const id = parseInt(match[1]);
                    if (!workItemIds.includes(id)) {
                        workItemIds.push(id);
                    }
                } else if (rel.url.includes('vstfs:///Git/Commit')) {
                } else if (rel.url.includes('vstfs:///Git/Commit')) {
                    // Git Commit Link
                    // Artifact ID format: vstfs:///Git/Commit/{projectId}/{repoId}/{commitId}
                    const parts = rel.url.split('/');
                    const commitId = parts[parts.length - 1]; // simplistic parsing
                    otherRelations.push({ type: 'Commit', id: commitId, url: rel.url, rel: rel.rel });
                } else {
                    // Generic Artifact
                    otherRelations.push({ type: 'Artifact', id: rel.url, url: rel.url, rel: rel.rel });
                }
            }

            // 4. Batch Fetch Related Work Items
            let relatedItems = [];
            if (workItemIds.length > 0) {
                emit('progress', { source: 'ADO', message: `Fetching details for ${workItemIds.length} related items: ${workItemIds.join(', ')}` });

                const wiql = `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AssignedTo] FROM WorkItems WHERE [System.Id] IN (${workItemIds.join(',')})`;
                try {
                    const result = await adoService.getWorkItemsUniversal({ wiql, limit: workItemIds.length });
                    relatedItems = result.items || [];
                    emit('progress', { source: 'ADO', message: `Fetched ${relatedItems.length} items successfully.` });
                } catch (err) {
                    emit('error', { message: `Failed to fetch related items: ${err.message}` });
                }
            }

            // 5. Construct Graph
            const nodes = [];
            const edges = [];
            const addedNodeIds = new Set();

            // Helper to add node if unique
            const addNode = (n) => {
                if (!addedNodeIds.has(n.id)) {
                    nodes.push(n);
                    addedNodeIds.add(n.id);
                }
            };

            // Add Seed Node
            addNode({
                id: seedItem.id.toString(),
                label: `${seedItem.fields['System.WorkItemType']} ${seedItem.id}`,
                type: 'WorkItem',
                state: seedItem.fields['System.State'],
                source: 'ADO',
                data: seedItem
            });

            // Add Related Work Items
            relatedItems.forEach(item => {
                addNode({
                    id: item.id.toString(),
                    label: `${item.fields['System.WorkItemType']} ${item.id}`,
                    type: 'WorkItem',
                    state: item.fields['System.State'],
                    source: 'ADO',
                    data: item
                });

                // Find relation type from seed relations
                // Note: Relation might be directional. 
                // item.id should be in workItemIds.
                // We need to map back to the specific 'rel' attribute if possible.
                // For simplicity, we create a generic link or try to match.
                // The seedItem.relations contains the 'url' which has the ID.
                const originalRel = relations.find(r => r.url.endsWith(`/${item.id}`));
                let simpleLabel = 'Related';

                if (originalRel) {
                    const relLabel = originalRel.rel.split('.').pop(); // e.g. 'Hierarchy-Forward' -> 'Forward' -> 'Child'?
                    if (relLabel.includes('Hierarchy-Forward')) simpleLabel = 'Child';
                    if (relLabel.includes('Hierarchy-Reverse')) simpleLabel = 'Parent';
                    if (relLabel.includes('Related')) simpleLabel = 'Related';
                } else if (item.id === seedItem.fields['System.Parent']) {
                    simpleLabel = 'Parent';
                }

                edges.push({
                    source: seedItem.id.toString(),
                    target: item.id.toString(),
                    label: simpleLabel
                });
            });

            // Add Non-WorkItem Nodes
            otherRelations.forEach(rel => {
                const nodeId = rel.id; // Commit Hash or URL
                const nodeLabel = rel.type === 'Commit' ? `Commit ${nodeId.substring(0, 7)}` : 'Artifact';

                addNode({
                    id: nodeId,
                    label: nodeLabel,
                    type: rel.type,
                    source: rel.type === 'Commit' ? 'Git' : 'External',
                    data: { url: rel.url }
                });

                edges.push({
                    source: seedItem.id.toString(),
                    target: nodeId,
                    label: 'Linked'
                });
            });

            // Emit Graph
            emit('graph_update', { nodes, edges });
            emit('progress', { source: 'ADO', message: 'Work Item Analysis Complete.' });

        } catch (error) {
            console.error("ADO Analysis Error", error);
            emit('error', { message: `ADO Analysis Failed: ${error.message}` });
        }
    }

    async _analyzeGit(id, emit) {
        emit('progress', { source: 'Git', message: 'Scanning repositories...' });
        await this._sleep(2000);

        emit('progress', { source: 'Git', message: 'Found 3 related commits.' });
        await this._sleep(1000);

        // Emit graph update
        const mockGraph = {
            nodes: [
                { id: `commit-abc`, label: 'fix: login bug', type: 'Commit' },
                { id: `file-auth`, label: 'auth.service.js', type: 'File' }
            ],
            edges: [
                { source: `commit-abc`, target: `file-auth`, label: 'MODIFIED' }
            ]
        };
        emit('graph_update', mockGraph);

        emit('progress', { source: 'Git', message: 'Done.' });
    }

    async _analyzeKnowledgeBase(id, emit) {
        emit('progress', { source: 'KB', message: 'Vectorizing query context...' });
        await this._sleep(1500);

        emit('progress', { source: 'KB', message: 'Searching vector database (Qdrant)...' });
        await this._sleep(1500);

        emit('progress', { source: 'KB', message: 'Found 5 relevant documents.' });

        // Emit graph update
        const mockGraph = {
            nodes: [
                { id: `doc-spec`, label: 'Auth Spec V2', type: 'Document' }
            ],
            edges: []
        };
        emit('graph_update', mockGraph);

        emit('progress', { source: 'KB', message: 'Done.' });
    }

    async _analyzeSql(entityId, emit, filters = {}) {
        emit('progress', { source: 'SQL', message: 'Searching SQL extraction sessions...' });

        try {
            const { IngestionGraphService } = require('./ingestion/ingestion-graph.service');
            const memgraphService = require('./memgraph.service');
            const ingestionGraph = new IngestionGraphService(memgraphService);

            // Get completed sessions
            const sessions = await ingestionGraph.getCompletedSessions(10);

            if (!sessions || sessions.length === 0) {
                emit('progress', { source: 'SQL', message: 'No SQL extraction sessions found.' });
                return;
            }

            // Filter by database if specified
            const filtered = filters.database
                ? sessions.filter(s => s.sourceDatabase === filters.database)
                : sessions;

            emit('progress', { source: 'SQL', message: `Found ${filtered.length} extraction session(s). Loading entity graphs...` });

            const allNodes = [];
            const allEdges = [];
            const addedIds = new Set();

            for (const session of filtered) {
                // Get entity graph for this session
                const graphs = await this._getSessionKnowledgeGraphs(memgraphService, session.id);

                for (const graph of graphs) {
                    if (filters.minQuality && session.qualityScore < filters.minQuality) continue;
                    if (graph.graphType === 'anomalies' && !filters.includeAnomalies) continue;
                    if (graph.graphType === 'businessLogic' && filters.includeRules === false) continue;

                    const graphData = await ingestionGraph.getKnowledgeGraph(graph.id);
                    if (!graphData || !graphData.nodes.length) continue;

                    // Convert to NEXUS format
                    for (const node of graphData.nodes) {
                        const nexusId = `sql_${session.id.slice(0, 8)}_${node.id}`;
                        if (addedIds.has(nexusId)) continue;
                        addedIds.add(nexusId);

                        allNodes.push({
                            id: nexusId,
                            label: node.entityName || node.name || node.label || node.id,
                            type: this._mapSqlNodeType(node.type || graph.graphType),
                            source: 'SQL',
                            state: graph.graphType,
                            data: {
                                ...node,
                                sourceDatabase: session.sourceDatabase,
                                sourceServer: session.sourceServer,
                                sessionId: session.id,
                                graphType: graph.graphType,
                            },
                        });
                    }

                    for (const edge of graphData.edges) {
                        allEdges.push({
                            source: `sql_${session.id.slice(0, 8)}_${edge.source}`,
                            target: `sql_${session.id.slice(0, 8)}_${edge.target}`,
                            label: edge.type || 'relates_to',
                        });
                    }
                }
            }

            if (allNodes.length > 0) {
                emit('graph_update', { nodes: allNodes, edges: allEdges });
            }

            emit('progress', { source: 'SQL', message: `SQL: ${allNodes.length} nodes, ${allEdges.length} edges from ${filtered.length} session(s).` });

        } catch (error) {
            console.error('[Nexus] SQL analysis error:', error);
            emit('progress', { source: 'SQL', message: `SQL analysis failed: ${error.message}` });
        }
    }

    async _getSessionKnowledgeGraphs(memgraphService, sessionId) {
        try {
            const results = await memgraphService.runQuery(`
                MATCH (s:IngestionSession {id: $sessionId})-[:PRODUCED_GRAPH]->(g:KnowledgeGraph)
                RETURN g.id as id, g.graphType as graphType, g.nodeCount as nodeCount
            `, { sessionId });
            return results || [];
        } catch (err) {
            console.warn(`[Nexus] Failed to get graphs for session ${sessionId}:`, err.message);
            return [];
        }
    }

    _mapSqlNodeType(type) {
        const mapping = {
            'MasterTable': 'entity', 'ReferenceTable': 'reference',
            'TransactionTable': 'transaction', 'JunctionTable': 'reference',
            'entities': 'entity', 'relationships': 'entity',
            'businessLogic': 'rule', 'lifecycle': 'transaction',
            'structure': 'entity', 'anomalies': 'warning',
        };
        return mapping[type] || 'entity';
    }

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new NexusOrchestrator();
