const tfvcService = require('../services/tfvc.service');

async function getTree(req, res) {
    try {
        const { path } = req.query;
        // Default to root if not provided, but usually we want explicit path
        const scopePath = path || "$/ATSBranch";

        // recursionLevel: 1 for OneLevel (folder + children)
        const items = await tfvcService.getTfvcItems(scopePath, 1);

        // Filter out the scopePath itself if it's returned (API usually returns the folder itself as the first item)
        // We want children.
        // If scopePath is $/ATSBranch, API returns $/ATSBranch and its children.
        // We can filter on client side or here. Let's return everything and let client handle structure, 
        // OR filter here. Standard is to return children.

        // Let's return raw items for now, client can filter.
        res.json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getContent(req, res) {
    try {
        const { path } = req.query;
        if (!path) {
            return res.status(400).json({ error: "Path is required" });
        }

        const content = await tfvcService.getTfvcItemContent(path);
        res.json({ content }); // Return as JSON object
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getHistory(req, res) {
    try {
        const { path, limit } = req.query;
        if (!path) {
            return res.status(400).json({ error: "Path is required" });
        }

        const top = parseInt(limit) || 20;
        const changesets = await tfvcService.getTfvcChangesets(path, top);
        res.json(changesets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getChangesetChanges(req, res) {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: "Changeset ID is required" });
        }

        const changes = await tfvcService.getTfvcChangesetChanges(parseInt(id));
        res.json(changes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function getDiff(req, res) {
    try {
        const { path, changesetId } = req.query;
        if (!path || !changesetId) {
            return res.status(400).json({ error: "Path and changesetId are required" });
        }

        const diff = await tfvcService.getTfvcDiffContent(path, parseInt(changesetId));
        res.json(diff);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    getTree,
    getContent,
    getHistory,
    getChangesetChanges,
    getDiff
};
