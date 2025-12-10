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

        // Run all tasks (they emit their own progress)
        await Promise.all(tasks);

        emit('progress', { source: 'System', message: 'Analysis Complete.' });
        emit('done', {});
    }

    async _analyzeAdo(id, emit) {
        emit('progress', { source: 'ADO', message: 'Connecting to Azure DevOps...' });
        await this._sleep(1000);

        emit('progress', { source: 'ADO', message: `Fetching Work Item ${id}...` });
        await this._sleep(1500);

        emit('progress', { source: 'ADO', message: 'Analyzing linked items and attachments...' });
        await this._sleep(1000);

        // Emit a graph update simulation
        const mockGraph = {
            nodes: [
                { id: `wi-${id}`, label: `Work Item ${id}`, type: 'WorkItem' },
                { id: `user-alice`, label: 'Alice User', type: 'Person' }
            ],
            edges: [
                { source: `wi-${id}`, target: `user-alice`, label: 'ASSIGNED_TO' }
            ]
        };
        emit('graph_update', mockGraph);

        emit('progress', { source: 'ADO', message: 'Done.' });
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

    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new NexusOrchestrator();
