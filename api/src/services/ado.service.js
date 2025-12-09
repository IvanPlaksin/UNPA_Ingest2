// src/services/ado.service.js
const azdev = require("azure-devops-node-api");
const { WorkItemExpand } = require("azure-devops-node-api/interfaces/WorkItemTrackingInterfaces");
const redisService = require('./redis.service');
const crypto = require('crypto');
const axios = require('axios');

// Загрузка переменных из .env
const ADO_ORG_URL = process.env.ADO_ORG_URL;
const ADO_PAT = process.env.ADO_PAT;

if (!ADO_ORG_URL || !ADO_PAT) {
    throw new Error("Ошибка: ADO_ORG_URL или ADO_PAT не заданы в .env");
}

let witApi;

async function connectToAdo() {
    console.log(`[ADO Service] Попытка подключения к on-premise серверу: ${ADO_ORG_URL}`);
    const authHandler = azdev.getPersonalAccessTokenHandler(ADO_PAT);
    const connection = new azdev.WebApi(ADO_ORG_URL, authHandler, {
        socketTimeout: 30000
    });
    witApi = await connection.getWorkItemTrackingApi();
}

// --- Вспомогательные функции ---

async function _fetchBySavedQuery(queryId, limit = 200) {
    console.log(`[ADO Strategy: SavedQuery] ID: ${queryId}`);
    return await witApi.queryById(queryId, undefined, limit);
}

async function _fetchByWiql(wiqlQuery, limit = 200) {
    console.log(`[ADO Strategy: WIQL] Запрос: ${wiqlQuery}`);
    return await witApi.queryByWiql({ query: wiqlQuery, top: limit });
}

async function _getWorkItemsInBatches(ids, fields, batchSize = 50) {
    const allItems = [];
    for (let i = 0; i < ids.length; i += batchSize) {
        const chunkIds = ids.slice(i, i + batchSize);
        console.log(`[ADO Tool] Загрузка пакета ${Math.floor(i / batchSize) + 1}...`);
        try {
            // ⭐ ИЗМЕНЕНИЕ: Добавлен expand: WorkItemExpand.Relations ТОЛЬКО если fields не указаны
            // Если fields указаны, expand должен быть undefined (или null), иначе ошибка API
            const chunkItems = await witApi.getWorkItems(
                chunkIds,
                fields,
                undefined,
                (fields && fields.length > 0) ? undefined : WorkItemExpand.Relations
            );
            if (!chunkItems) return null;
            allItems.push(...chunkItems);
        } catch (e) {
            console.error(`[ADO Tool] Ошибка пакета:`, e.message);
            throw e;
        }
    }
    return allItems;
}

/**
 * УНИВЕРСАЛЬНАЯ ФУНКЦИЯ (Инструмент для ИИ)
 */
async function getWorkItemsUniversal({ queryId, wiql, limit, skip, fieldsToReturn }) {
    if (!witApi) {
        throw new Error("API Azure DevOps не инициализировано.");
    }

    const queryLimit = limit || 20;
    const querySkip = skip || 0;
    const searchLimit = 200; // Лимит поиска ID (можно увеличить при необходимости)
    let rawResult;
    let usedStrategy = "";

    try {
        if (queryId) {
            usedStrategy = "SavedQuery";
            rawResult = await _fetchBySavedQuery(queryId);
        } else if (wiql) {
            usedStrategy = "WIQL";
            // Для пагинации нам нужно получить ВСЕ ID (или достаточно много), а потом вырезать нужные
            // ADO WIQL возвращает список ID.
            rawResult = await _fetchByWiql(wiql, 1000); // Берем больше ID для пагинации
        } else {
            return { error: "Не указан queryId или wiql." };
        }
    } catch (e) {
        return { error: e.message, strategy: usedStrategy };
    }

    if (!rawResult?.workItems?.length) {
        return { items: [], totalFound: 0, count: 0 };
    }

    const allFoundIds = rawResult.workItems.map(wi => wi.id);
    const totalFoundCount = allFoundIds.length;

    // Пагинация: берем срез ID
    const idsForAnalysis = allFoundIds.slice(querySkip, querySkip + queryLimit);

    const defaultFields = ["System.Id", "System.Title", "System.State", "System.WorkItemType", "System.ChangedDate"];
    let fields = [];
    if (Array.isArray(fieldsToReturn)) fields = [...fieldsToReturn];
    else if (typeof fieldsToReturn === 'string' && fieldsToReturn) fields = [fieldsToReturn];
    if (fields.length === 0) fields = [...defaultFields];
    if (!fields.includes("System.Id")) fields.push("System.Id");

    console.log(`[ADO Tool] Найдено всего: ${totalFoundCount}. Запрос: skip=${querySkip}, limit=${queryLimit}. Загружаем детали для: ${idsForAnalysis.length} шт.`);

    if (idsForAnalysis.length === 0) {
        return {
            items: [],
            count: 0,
            totalFound: totalFoundCount,
            strategy: usedStrategy
        };
    }

    let items;
    try {
        items = await _getWorkItemsInBatches(idsForAnalysis, fields);
    } catch (e) {
        return { error: "getWorkItems_failed", details: e.message };
    }

    if (items === null) {
        return { error: "getWorkItems_returned_null", problematicFields: fields };
    }

    const formattedItems = items.map(item => {
        const cleanFields = { ...item.fields };
        if (cleanFields["System.Description"]) {
            cleanFields["System.Description"] = cleanFields["System.Description"].replace(/<[^>]*>?/gm, '');
        }

        // ⭐ ИЗМЕНЕНИЕ: Формирование массива связей
        let relations = [];
        if (item.relations) {
            relations = item.relations.map(rel => ({
                rel: rel.rel,
                url: rel.url,
                attributes: rel.attributes
            }));
        }

        return {
            id: item.id,
            fields: cleanFields,
            relations: relations // Возвращаем связи
        };
    });

    return {
        items: formattedItems,
        count: formattedItems.length,
        totalFound: totalFoundCount,
        strategy: usedStrategy
    };
}

/**
 * Поиск Work Items с динамической генерацией WIQL и кешированием
 */
async function searchWorkItems(filters, page = 1, limit = 20) {
    console.log(`[ADO Service] searchWorkItems called with filters:`, JSON.stringify(filters, null, 2));

    // --- CACHE CHECK ---
    const cacheKeyPayload = { filters, page, limit };
    const cacheKeyHash = crypto.createHash('md5').update(JSON.stringify(cacheKeyPayload)).digest('hex');
    const cacheKey = `ado:search:${cacheKeyHash}`;

    const cachedResult = await redisService.get(cacheKey);
    if (cachedResult) {
        console.log(`[ADO Service] Cache HIT for key: ${cacheKey}`);
        return cachedResult;
    }
    console.log(`[ADO Service] Cache MISS for key: ${cacheKey}`);
    // -------------------

    let whereClauses = [];
    whereClauses.push("[System.Id] > 0");

    if (Array.isArray(filters)) {
        console.log(`[ADO Service] Processing filters as ARRAY`);
        // Dynamic WIQL generation from array of filters
        filters.forEach(f => {
            if (!f.field || !f.operator || f.value === undefined || f.value === null || f.value === '') {
                console.log(`[ADO Service] Skipping filter (invalid/empty):`, JSON.stringify(f));
                return;
            }

            let operator = f.operator;
            let value = f.value;

            // Map UI operators to WIQL
            if (operator === 'Contains') operator = 'CONTAINS';
            if (operator === 'Equals') operator = '=';

            // Handle value formatting
            if (typeof value === 'string') {
                if (value.startsWith('@')) {
                    // Macros (e.g. @today, @me) - do not quote
                } else if (!isNaN(Number(value)) && f.field === 'System.Id') {
                    // IDs should be numbers
                } else {
                    // Quote strings and escape single quotes
                    value = `'${value.replace(/'/g, "''")}'`;
                }
            }

            whereClauses.push(`[${f.field}] ${operator} ${value}`);
        });
    } else {
        console.log(`[ADO Service] Processing filters as OBJECT (Legacy)`);
        // Legacy object handling (fallback)
        const { title, state, assignedTo, areaPath, iterationPath, type } = filters;
        if (title) whereClauses.push(`([System.Title] CONTAINS '${title}' OR [System.Description] CONTAINS '${title}')`);
        if (state) whereClauses.push(`[System.State] = '${state}'`);
        if (assignedTo) whereClauses.push(`[System.AssignedTo] CONTAINS '${assignedTo}'`);
        if (areaPath) whereClauses.push(`[System.AreaPath] UNDER '${areaPath}'`);
        if (iterationPath) whereClauses.push(`[System.IterationPath] UNDER '${iterationPath}'`);
        if (type) whereClauses.push(`[System.WorkItemType] = '${type}'`);
    }

    const whereString = whereClauses.join(" AND ");

    // Выбираем основные поля
    const query = `
        SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo], [System.AreaPath], [System.WorkItemType], [System.ChangedDate]
        FROM WorkItems
        WHERE ${whereString}
        ORDER BY [System.ChangedDate] DESC
    `;

    console.log(`[ADO Service] Generated WIQL: ${query}`);

    const skip = (page - 1) * limit;

    const result = await getWorkItemsUniversal({
        wiql: query,
        limit: limit,
        skip: skip,
        fieldsToReturn: ["System.Id", "System.Title", "System.State", "System.AssignedTo", "System.AreaPath", "System.WorkItemType", "System.ChangedDate"]
    });

    // --- CACHE SET ---
    if (result && !result.error) {
        await redisService.set(cacheKey, result, 60); // Cache for 60 seconds
        console.log(`[ADO Service] Cached result for key: ${cacheKey}`);
    }
    // -----------------

    return result;
}

/**
 * Получение одного Work Item по ID со всеми полями
 */
async function getWorkItemById(id) {
    if (!witApi) {
        throw new Error("API Azure DevOps не инициализировано.");
    }

    try {
        console.log(`[ADO Service] getWorkItemById: ${id}`);
        const item = await witApi.getWorkItem(
            parseInt(id),
            undefined, // fields (undefined = all)
            undefined, // asOf
            WorkItemExpand.Relations // expand
        );

        if (!item) return null;

        const cleanFields = { ...item.fields };

        // Parse Tags
        if (cleanFields['System.Tags']) {
            cleanFields['System.Tags'] = cleanFields['System.Tags'].split(';').map(t => t.trim()).filter(t => t);
        } else {
            cleanFields['System.Tags'] = [];
        }

        let relations = [];
        if (item.relations) {
            relations = item.relations.map(rel => ({
                rel: rel.rel,
                url: rel.url,
                attributes: rel.attributes
            }));
        }

        return {
            id: item.id,
            fields: cleanFields,
            relations: relations,
            _links: item._links, // Preserve _links for navigation
            url: item.url
        };
    } catch (e) {
        console.error(`[ADO Service] Error fetching Work Item ${id}:`, e.message);
        throw e;
    }
}

async function checkHealth() {
    if (!witApi) return false;
    try {
        return true;
    } catch (e) {
        return false;
    }
}

async function getAttachmentContent(url) {
    if (!ADO_PAT) throw new Error("ADO_PAT is missing");

    console.log(`[ADO Service] Downloading attachment: ${url}`);

    // ADO requires Basic Auth with PAT
    const authHeader = `Basic ${Buffer.from(`:${ADO_PAT}`).toString('base64')}`;

    try {
        const response = await axios.get(url, {
            headers: {
                'Authorization': authHeader
            },
            responseType: 'arraybuffer'
        });
        return response.data;
    } catch (error) {
        console.error(`[ADO Service] Error downloading attachment: ${error.message}`);
        throw error;
    }
}

// --- SourceAdapter Implementation ---

/**
 * Streams ingestion items.
 * @param {Object} filter - { queryId, wiql }
 * @returns {AsyncGenerator<import('./interfaces/source.adapter').IngestionItem>}
 */
async function* fetchStream(filter) {
    if (!witApi) await connectToAdo();

    let rawResult;
    if (filter.queryId) {
        rawResult = await _fetchBySavedQuery(filter.queryId);
    } else if (filter.wiql) {
        // Fetch ALL IDs for streaming (up to generic limit, e.g. 20000 or API limit)
        // Note: queryByWiql allows 20k results by default? Need to check.
        // For safe streaming, we might need a recursive folder based query if it's huge, 
        // but simple WIQL assume < 20k for now.
        rawResult = await witApi.queryByWiql({ query: filter.wiql, top: 20000 });
    } else {
        throw new Error("ADO Adapter requires 'queryId' or 'wiql' in filter.");
    }

    if (!rawResult?.workItems?.length) return;

    const allIds = rawResult.workItems.map(wi => wi.id);
    const BATCH_SIZE = 50;

    // Fields to ensure we have content for the IngestionItem
    const fields = [
        "System.Id", "System.Title", "System.Description", "System.State",
        "System.WorkItemType", "System.ChangedDate", "System.CreatedDate",
        "System.AssignedTo", "System.AreaPath", "System.IterationPath"
    ];

    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const chunkIds = allIds.slice(i, i + BATCH_SIZE);
        const detailedItems = await _getWorkItemsInBatches(chunkIds, fields);

        if (!detailedItems) continue;

        for (const item of detailedItems) {
            // Map to IngestionItem
            const description = item.fields["System.Description"] || "";
            // Strip HTML for 'content' but keep raw in metadata if needed?
            // Usually we want raw text for content.
            const textContent = description.replace(/<[^>]*>?/gm, '');

            yield {
                id: item.id.toString(),
                type: 'work_item',
                content: `${item.fields["System.Title"]}\n\n${textContent}`,
                metadata: {
                    ...item.fields,
                    relations: item.relations ? item.relations.map(r => ({ rel: r.rel, url: r.url })) : [],
                    source: 'ado',
                    url: item.url
                },
                context: {
                    repo: null, // Not a repo
                    areaPath: item.fields["System.AreaPath"],
                    project: process.env.ADO_PROJECT || "Unknown" // ideally fetch from env or item
                }
            };
        }
    }
}

// --- SourceAdapter Implementation ---

/**
 * Streams ingestion items.
 * @param {Object} filter - { queryId, wiql }
 * @returns {AsyncGenerator<import('./interfaces/source.adapter').IngestionItem>}
 */
async function* fetchStream(filter) {
    if (!witApi) await connectToAdo();

    let rawResult;
    if (filter.queryId) {
        rawResult = await _fetchBySavedQuery(filter.queryId);
    } else if (filter.wiql) {
        // Fetch ALL IDs for streaming (up to generic limit or API limit)
        // For safe streaming, assume < 20k for now as per ADO limits.
        rawResult = await witApi.queryByWiql({ query: filter.wiql, top: 20000 });
    } else {
        throw new Error("ADO Adapter requires 'queryId' or 'wiql' in filter.");
    }

    if (!rawResult?.workItems?.length) return;

    const allIds = rawResult.workItems.map(wi => wi.id);
    const BATCH_SIZE = 50;

    // Fields to ensure we have content for the IngestionItem
    const fields = [
        "System.Id", "System.Title", "System.Description", "System.State",
        "System.WorkItemType", "System.ChangedDate", "System.CreatedDate",
        "System.AssignedTo", "System.AreaPath", "System.IterationPath"
    ];

    for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
        const chunkIds = allIds.slice(i, i + BATCH_SIZE);
        const detailedItems = await _getWorkItemsInBatches(chunkIds, fields);

        if (!detailedItems) continue;

        for (const item of detailedItems) {
            // Map to IngestionItem
            const description = item.fields["System.Description"] || "";
            const textContent = description.replace(/<[^>]*>?/gm, '');

            yield {
                id: item.id.toString(),
                type: 'work_item',
                content: `${item.fields["System.Title"]}\n\n${textContent}`,
                metadata: {
                    ...item.fields,
                    relations: item.relations ? item.relations.map(r => ({ rel: r.rel, url: r.url })) : [],
                    source: 'ado',
                    url: item.url
                },
                context: {
                    repo: null,
                    areaPath: item.fields["System.AreaPath"],
                    project: process.env.ADO_PROJECT || "Unknown"
                }
            };
        }
    }
}

module.exports = {
    connectToAdo,
    getWorkItemsUniversal,
    searchWorkItems,
    getWorkItemById,
    checkHealth,
    getAttachmentContent,
    fetchStream,
    validateConfig: checkHealth
};