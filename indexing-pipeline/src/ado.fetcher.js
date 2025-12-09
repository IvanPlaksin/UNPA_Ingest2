const azdev = require("azure-devops-node-api");
const { WorkItemExpand } = require("azure-devops-node-api/interfaces/WorkItemTrackingInterfaces");

const ORG_URL = process.env.ADO_ORG_URL;
const PAT = process.env.ADO_PAT;
const PROJECT = process.env.ADO_PROJECT_NAME;

if (!ORG_URL || !PAT) {
    console.error("❌ Ошибка: Не заданы ADO_ORG_URL или ADO_PAT");
    process.exit(1);
}

let witApi = null;

async function getWitApi() {
    if (witApi) return witApi;
    const authHandler = azdev.getPersonalAccessTokenHandler(PAT);
    const connection = new azdev.WebApi(ORG_URL, authHandler);
    witApi = await connection.getWorkItemTrackingApi();
    return witApi;
}

// ... (функции getWorkItemTypes, getFieldsForType, getAreas остаются БЕЗ ИЗМЕНЕНИЙ) ...
// (Скопируйте их из прошлой версии или оставьте как есть)

async function getWorkItemTypes() { /* ... код ... */ }
async function getFieldsForType(typeName) { /* ... код ... */ }
async function getAreas() { /* ... код ... */ }

/**
 * ⭐ НОВОЕ: Получение данных для конкретных ID задач
 */
async function getWorkItemsData(ids) {
    const api = await getWitApi();
    console.log(`[Fetcher] Загрузка деталей для ${ids.length} задач...`);

    // Запрашиваем полные данные с Relations
    const items = await api.getWorkItems(
        ids,
        undefined,
        undefined,
        WorkItemExpand.Relations
    );

    // Упрощаем формат для векторизации
    return items.map(item => {
        const fields = item.fields;
        // Удаляем HTML теги из описания
        let description = fields['System.Description'] || fields['Microsoft.VSTS.Common.DescriptionHtml'] || "";
        description = description.replace(/<[^>]*>?/gm, '');

        return {
            id: item.id,
            title: fields['System.Title'],
            type: fields['System.WorkItemType'],
            state: fields['System.State'],
            description: description,
            assignedTo: fields['System.AssignedTo']?.displayName || "Unassigned",
            url: item.url
        };
    });
}

module.exports = {
    getWorkItemTypes,
    getFieldsForType,
    getAreas,
    getWorkItemsData // Экспортируем новый метод
};