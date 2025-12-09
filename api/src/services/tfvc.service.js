// api/src/services/tfvc.service.js
const azdev = require("azure-devops-node-api");
const { TfvcVersionDescriptor, TfvcVersionType } = require("azure-devops-node-api/interfaces/TfvcInterfaces");
const redisService = require('./redis.service');
const crypto = require('crypto');

const ADO_ORG_URL = process.env.ADO_ORG_URL;
const ADO_PAT = process.env.ADO_PAT;

if (!ADO_ORG_URL || !ADO_PAT) {
    throw new Error("Ошибка: ADO_ORG_URL или ADO_PAT не заданы в .env");
}

let tfvcApi;

async function connectToTfvc() {
    console.log(`[TFVC Service] Connecting to: ${ADO_ORG_URL}`);
    const authHandler = azdev.getPersonalAccessTokenHandler(ADO_PAT);
    const connection = new azdev.WebApi(ADO_ORG_URL, authHandler, {
        socketTimeout: 30000,
        ignoreSslError: true
    });
    tfvcApi = await connection.getTfvcApi();
}

async function getItems(scopePath, recursionLevel = 1) { // 1 = OneLevel
    // --- CACHE CHECK ---
    const cacheKeyPayload = { scopePath, recursionLevel };
    const cacheKeyHash = crypto.createHash('md5').update(JSON.stringify(cacheKeyPayload)).digest('hex');
    const cacheKey = `tfvc:items:${cacheKeyHash}`;

    const cachedResult = await redisService.get(cacheKey);
    if (cachedResult) {
        console.log(`[TFVC Service] Cache HIT for key: ${cacheKey}`);
        return cachedResult;
    }
    console.log(`[TFVC Service] Cache MISS for key: ${cacheKey}`);
    // -------------------

    if (!tfvcApi) await connectToTfvc();

    console.log(`[TFVC Service] getItems path=${scopePath}, recursion=${recursionLevel}`);

    try {
        const items = await tfvcApi.getItems(
            undefined, // project
            scopePath, // scopePath
            recursionLevel, // recursionLevel
            false, // includeContentMetadata
            undefined // latest version
        );

        const result = items.map(item => ({
            path: item.path,
            isFolder: item.isFolder,
            id: item.changeSetId, // using changeset as a version indicator
            url: item.url
        }));

        // --- CACHE SET ---
        await redisService.set(cacheKey, result, 60); // Cache for 60 seconds
        // -----------------

        return result;
    } catch (error) {
        console.error(`[TFVC Service] Error getting items for ${scopePath}:`, error.message);
        throw error;
    }
}

async function getItemContent(path, versionOrDescriptor = undefined) {
    let versionDescriptor = versionOrDescriptor;
    if (versionOrDescriptor && (typeof versionOrDescriptor === 'string' || typeof versionOrDescriptor === 'number')) {
        versionDescriptor = {
            version: versionOrDescriptor.toString(),
            versionType: TfvcVersionType.Changeset
        };
    }

    // --- CACHE CHECK ---
    const cacheKeyPayload = { path, versionDescriptor };
    const cacheKeyHash = crypto.createHash('md5').update(JSON.stringify(cacheKeyPayload)).digest('hex');
    const cacheKey = `tfvc:content:${cacheKeyHash}`;

    const cachedResult = await redisService.get(cacheKey);
    if (cachedResult) {
        console.log(`[TFVC Service] Cache HIT for key: ${cacheKey}`);
        return cachedResult;
    }
    console.log(`[TFVC Service] Cache MISS for key: ${cacheKey}`);
    // -------------------

    if (!tfvcApi) await connectToTfvc();

    console.log(`[TFVC Service] getItemContent path=${path}, version=${versionDescriptor?.version}`);

    try {
        // First check size
        const itemMetadata = await tfvcApi.getItem(
            path,
            undefined,
            undefined,
            true, // includeContentMetadata
            versionDescriptor
        );

        if (!itemMetadata) {
            console.warn(`[TFVC Service] Item not found: ${path} at version ${versionDescriptor?.version}`);
            return "";
        }

        if (itemMetadata.size > 100 * 1024) { // 100KB limit
            return "Preview unavailable: File is too large (>100KB).";
        }

        const contentStream = await tfvcApi.getItemContent(
            path,
            undefined, // project
            versionDescriptor
        );

        // Convert stream to string
        const content = await new Promise((resolve, reject) => {
            const chunks = [];
            contentStream.on("data", (chunk) => chunks.push(chunk));
            contentStream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
            contentStream.on("error", (err) => reject(err));
        });

        // --- CACHE SET ---
        // If versioned (immutable), cache for 1 hour. If latest (mutable), cache for 60s.
        const ttl = versionDescriptor ? 3600 : 60;
        await redisService.set(cacheKey, content, ttl);
        // -----------------

        return content;

    } catch (error) {
        console.error(`[TFVC Service] Error getting content for ${path}:`, error.message);
        return "";
    }
}

async function getChangesets(path, limit = 20, skip = 0, searchCriteria = {}) {
    // --- CACHE CHECK ---
    const cacheKeyPayload = { path, limit, skip, searchCriteria };
    const cacheKeyHash = crypto.createHash('md5').update(JSON.stringify(cacheKeyPayload)).digest('hex');
    const cacheKey = `tfvc:history:${cacheKeyHash}`;

    const cachedResult = await redisService.get(cacheKey);
    if (cachedResult) {
        console.log(`[TFVC Service] Cache HIT for key: ${cacheKey}`);
        return cachedResult;
    }
    console.log(`[TFVC Service] Cache MISS for key: ${cacheKey}`);
    // -------------------

    if (!tfvcApi) await connectToTfvc();

    let results = [];
    try {
        // Construct API search criteria
        const apiCriteria = {
            itemPath: path,
            fromDate: searchCriteria.fromDate,
            toDate: searchCriteria.toDate,
            fromId: searchCriteria.fromId,
            toId: searchCriteria.toId,
            author: searchCriteria.author
        };

        // If filtering by comment, we might need to fetch more to ensure we find matches
        // But for now, we respect the limit passed, or maybe the caller should pass a higher limit
        const fetchLimit = limit;

        const rawResults = await tfvcApi.getChangesets(
            undefined, // project
            undefined, // maxCommentLength
            skip,
            fetchLimit,
            undefined, // orderby
            apiCriteria
        );

        results = (rawResults || []).map(cs => ({
            changesetId: cs.changesetId,
            author: cs.author ? cs.author.displayName : 'Unknown',
            date: cs.createdDate,
            comment: cs.comment
        }));

        // --- Client-Side Filtering (Comment) ---
        if (searchCriteria.commentContains) {
            const terms = Array.isArray(searchCriteria.commentContains)
                ? searchCriteria.commentContains
                : [searchCriteria.commentContains];

            if (terms.length > 0) {
                results = results.filter(cs => {
                    if (!cs.comment) return false;
                    return terms.some(term => cs.comment.includes(term));
                });
            }
        }
        // ---------------------------------------

    } catch (error) {
        console.error("Error fetching changesets:", error);
        // Fallback or re-throw? For now, re-throw to be safe or return empty
        throw error;
    }

    // --- CACHE SET ---
    await redisService.set(cacheKey, results, 60); // Cache for 60 seconds
    // -----------------

    return results;
}

async function getChangesetChanges(changesetId) {
    // --- CACHE CHECK ---
    const cacheKey = `tfvc:changes:${changesetId}`;
    const cachedResult = await redisService.get(cacheKey);
    if (cachedResult) {
        console.log(`[TFVC Service] Cache HIT for key: ${cacheKey}`);
        return cachedResult;
    }
    console.log(`[TFVC Service] Cache MISS for key: ${cacheKey}`);
    // -------------------

    if (!tfvcApi) await connectToTfvc();
    console.log(`[TFVC Service] getChangesetChanges id=${changesetId}`);
    try {
        const changes = await tfvcApi.getChangesetChanges(changesetId, undefined, 100);
        const result = changes.map(change => ({
            path: change.item.path,
            changeType: change.changeType,
            url: change.item.url
        }));

        // --- CACHE SET ---
        await redisService.set(cacheKey, result, 3600); // Immutable, cache for 1 hour
        // -----------------

        return result;
    } catch (error) {
        console.error(`[TFVC Service] Error getting changes for changeset ${changesetId}:`, error.message);
        throw error;
    }
}

async function getDiffContent(path, changesetId) {
    // --- CACHE CHECK ---
    const cacheKeyPayload = { path, changesetId };
    const cacheKeyHash = crypto.createHash('md5').update(JSON.stringify(cacheKeyPayload)).digest('hex');
    const cacheKey = `tfvc:diff:${cacheKeyHash}`;

    const cachedResult = await redisService.get(cacheKey);
    if (cachedResult) {
        console.log(`[TFVC Service] Cache HIT for key: ${cacheKey}`);
        return cachedResult;
    }
    console.log(`[TFVC Service] Cache MISS for key: ${cacheKey}`);
    // -------------------

    if (!tfvcApi) await connectToTfvc();
    console.log(`[TFVC Service] getDiffContent path=${path}, changesetId=${changesetId}`);

    try {
        // 1. Get New Content (at changesetId)
        const newVersionDescriptor = {
            version: changesetId.toString(),
            versionType: TfvcVersionType.Changeset
        };
        const newContent = await getItemContent(path, newVersionDescriptor);

        // 2. Find Previous Version
        const criteria = {
            itemPath: path,
            toId: changesetId
        };

        const changesets = await tfvcApi.getChangesets(
            undefined, // project
            undefined, // maxCommentLength
            undefined, // skip
            2,         // top (we only need current + previous)
            undefined, // orderby
            criteria   // searchCriteria
        );

        let oldContent = "";
        if (changesets && changesets.length > 1) {
            const prevChangesetId = changesets[1].changesetId;
            const oldVersionDescriptor = {
                version: prevChangesetId.toString(),
                versionType: TfvcVersionType.Changeset
            };
            oldContent = await getItemContent(path, oldVersionDescriptor);
        }

        const result = {
            old: oldContent,
            new: newContent
        };

        // --- CACHE SET ---
        await redisService.set(cacheKey, result, 3600); // Immutable, cache for 1 hour
        // -----------------

        return result;

    } catch (error) {
        console.error(`[TFVC Service] Error getting diff for ${path} at ${changesetId}:`, error.message);
        throw error;
    }
}

async function getLabels(searchCriteria = {}) {
    // --- CACHE CHECK ---
    const cacheKeyPayload = { searchCriteria };
    const cacheKeyHash = crypto.createHash('md5').update(JSON.stringify(cacheKeyPayload)).digest('hex');
    const cacheKey = `tfvc:labels:${cacheKeyHash}`;

    const cachedResult = await redisService.get(cacheKey);
    if (cachedResult) {
        console.log(`[TFVC Service] Cache HIT for key: ${cacheKey}`);
        return cachedResult;
    }
    console.log(`[TFVC Service] Cache MISS for key: ${cacheKey}`);
    // -------------------

    if (!tfvcApi) await connectToTfvc();

    try {
        console.log(`[TFVC Service] getLabels criteria:`, searchCriteria);
        const requestData = {
            name: searchCriteria.name,
            owner: searchCriteria.owner,
            labelScope: searchCriteria.labelScope,
            itemLabelFilter: searchCriteria.itemLabelFilter
        };

        const labels = await tfvcApi.getLabels(
            requestData,
            undefined, // project
            searchCriteria.top || 100, // top
            undefined // skip
        );

        const results = labels.map(label => ({
            id: label.id,
            name: label.name,
            description: label.description,
            scope: label.labelScope,
            owner: label.owner ? label.owner.displayName : 'Unknown',
            date: label.modifiedDate
        }));

        // --- CACHE SET ---
        await redisService.set(cacheKey, results, 60);
        // -----------------

        return results;
    } catch (error) {
        console.error(`[TFVC Service] Error getting labels:`, error.message);
        throw error;
    }
}


module.exports = {
    getTfvcItems: getItems,
    getTfvcItemContent: getItemContent,
    getTfvcChangesets: getChangesets,
    getTfvcChangesetChanges: getChangesetChanges,
    getTfvcDiffContent: getDiffContent,
    getTfvcLabels: getLabels
};
