const orchestrator = require('../services/nexus.orchestrator');

async function analyzeStream(req, res) {
    console.log("[Nexus] Stream connection opened");

    // 1. SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Ensure headers are sent immediately

    // 2. Parse Query Params
    const { entityType, entityId, sources } = req.query;
    const activeSources = sources ? sources.split(',') : [];

    const context = {
        entityType: entityType || 'unknown',
        entityId: entityId || 'unknown',
        activeSources: activeSources
    };

    // 3. Define Emitter Helper
    const emit = (event, data) => {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // 4. Run Orchestrator
    try {
        await orchestrator.analyze(context, emit);

        // Close connection gracefully
        // emit('done', {}); // Already emitted by orchestrator
        res.end();
    } catch (error) {
        console.error("[Nexus] Analysis Error:", error);
        emit('error', { message: error.message });
        res.end();
    }

    // Handle client disconnect
    req.on('close', () => {
        console.log("[Nexus] Stream connection closed by client");
        // TODO: Cancel orchestrator if possible
    });
}

// GET /entity/:type/:id
async function getEntityDetails(req, res) {
    const { type, id } = req.params;
    console.log(`[Nexus] Fetching entity details: ${type} ${id}`);

    try {
        if (type === 'workitem') {
            const adoService = require('../services/ado.service');
            // Check if getWorkItemById expects simple ID or expanded fields
            // Assuming getWorkItemById(id) returns the raw item with fields/relations

            // We use 'getWorkItemById' from exports
            const item = await adoService.getWorkItemById(id);

            if (!item) {
                return res.status(404).json({ error: "Work Item not found" });
            }

            // Format to match Frontend expectations (SourceSelector/WorkItemDetails)
            // Format to match Frontend expectations (SourceSelector/WorkItemDetails)
            const result = {
                id: item.id,
                label: `${item.fields['System.WorkItemType']} ${item.id}`,
                type: 'WorkItem',
                source: 'ADO',
                data: {
                    core: { id: item.id, rev: item.rev },
                    fields: item.fields, // Pass all fields
                    relations: item.relations,
                    ParentWorkItem: null
                }
            };

            // EXPANSION: Fetch Parent Object if exists
            if (item.fields['System.Parent']) {
                const parentId = item.fields['System.Parent'];
                console.log(`[Nexus] Expanding Parent: ${parentId}`);
                try {
                    const parentItem = await adoService.getWorkItemById(parentId);
                    if (parentItem) {
                        result.data.ParentWorkItem = {
                            id: parentItem.id,
                            fields: parentItem.fields,
                            url: parentItem.url,
                            _links: parentItem._links
                        };
                    }
                } catch (err) {
                    console.error(`[Nexus] Failed to expand parent ${parentId}:`, err.message);
                }
            }
            return res.json(result);
        } else if (type === 'changeset') {
            // Placeholder for Git/TFVC
            return res.json({
                id: id,
                label: `Commit ${id}`,
                type: 'Commit',
                source: 'Git',
                data: { status: 'MOCK_GIT' }
            });
        }

        return res.json({ id, type, source: 'Unknown' });

    } catch (error) {
        console.error("[Nexus] getEntityDetails Error:", error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    analyzeStream,
    getEntityDetails
};
