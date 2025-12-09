// src/services/gemini.service.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. Сначала импортируем инструменты
const adoTools = require('../tools/ado.tools.js');
const gitTools = require('../tools/git.tools.js');
const tfvcTools = require('../tools/tfvc.tools.js');

// 2. Затем объединяем их
const allTools = [
    ...adoTools,
    ...gitTools,
    ...tfvcTools
];

// 3. Импортируем сервисы
const adoService = require('./ado.service');
const gitService = require('./git.service');
const tfvcService = require('./tfvc.service');
const embeddingService = require('./embedding.service');
const vectorService = require('./vector.service');
const roleService = require('./role.service');

// ... (код настройки genAI, GEMINI_API_KEY и т.д.) ...
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL_NAME = process.env.GEMINI_MODEL_NAME || "gemini-flash-latest";

console.log(`[Gemini Service] Инициализация с моделью: ${GEMINI_MODEL_NAME}`);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// ⭐ ИЗМЕНЕНИЕ: Добавляем новый инструмент в карту
const toolImplementations = {
    // Инструмент 1 вызывает универсальную функцию (параметр queryId попадет внутрь)
    "getWorkItemsBySavedQuery": adoService.getWorkItemsUniversal,

    // Инструмент 2 ТОЖЕ вызывает универсальную функцию (параметры wiql, limit... попадут внутрь)
    "executeWiqlQuery": adoService.getWorkItemsUniversal,

    // Git Tools (⭐ NEW)
    "getRepositories": gitService.getRepositories,
    "getCommits": gitService.getCommits,
    "getFileContent": gitService.getFileContent,

    // TFVC Tools (⭐ NEW)
    "getTfvcItems": tfvcService.getTfvcItems,
    "getTfvcContent": tfvcService.getTfvcFileContent,
    "getTfvcHistory": tfvcService.getTfvcChangesets,
    "getTfvcLabels": tfvcService.getTfvcLabels
};

/**
 * Главная функция Агента
 */
async function runAgent(userPrompt, userId, chatHistory = []) {

    // ... (ШАГ 1, 2, 3 - RAG, КОНТЕКСТ РОЛИ, МЕГА-ПРОМПТ) ...
    // ... (Этот код остается АБСОЛЮТНО БЕЗ ИЗМЕНЕНИЙ) ...
    console.log("[Gemini Agent] Шаг RAG 1 (Vector): Создание вектора для запроса...");
    const userVector = await embeddingService.embedText(userPrompt);
    console.log("[Gemini Agent] Шаг RAG 2 (Vector): Поиск 'Мастер-данных'...");
    const retrievedContext = await vectorService.searchContext(userVector);
    console.log("[Gemini Agent] Шаг RAG 3 (Role): Поиск 'Инструкций' для пользователя...");
    const roleContext = await roleService.getContextForUser(userId);

    let systemPrompt = "Ты - ассистент UN ProjectAdvisor.\n";
    if (roleContext && roleContext.length > 0) {
        systemPrompt += `
--- ИНСТРУКЦИИ ДЛЯ ТВОЕЙ РОЛИ ---
${roleContext}
--- КОНЕЦ ИНСТРУКЦИЙ ---
`;
        console.log("[Gemini Agent] Контекст Ролей (Role Context) добавлен в промпт.");
    }
    if (retrievedContext && retrievedContext.length > 0) {
        systemPrompt += `
--- КОНТЕКСТ ПРОЕКТА (Мастер-данные) ---
${retrievedContext}
--- КОНЕЦ КОНТЕКСТА ---
`;
        console.log("[Gemini Agent] Контекст Мастер-данных (RAG) добавлен в промпт.");
    }
    const finalPrompt = `
${systemPrompt}
ЗАПРОС ПОЛЬЗОВАТЕЛЯ:
"${userPrompt}"
`;

    // -----------------------------------------------------------------
    // ⭐ ШАГ 4: ЦИКЛ АГЕНТА (Function Calling)
    // -----------------------------------------------------------------

    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL_NAME,
        tools: allTools // allTools теперь содержит оба инструмента
    });

    const chat = model.startChat({
        history: chatHistory
    });

    console.log(`[Gemini Agent] Промпт пользователя (МЕГА-ПРОМПТ): "${finalPrompt}"`);
    const result = await chat.sendMessage(finalPrompt);
    let response = result.response;

    // ... (Остальной цикл Агента остается БЕЗ ИЗМЕНЕНИЙ) ...
    // Он автоматически обработает новый инструмент, 
    // так как `toolImplementations` теперь его знает.
    while (true) {
        const functionCalls = response.functionCalls();
        if (!functionCalls || functionCalls.length === 0) {
            const finalText = response.text();
            //console.log("[Gemini Agent] Возвращаем текстовый ответ:", JSON.stringify(finalText, null, 2));
            return finalText;
        }

        console.log(`[Gemini Agent] Обнаружен FunctionCall:`, JSON.stringify(functionCalls, null, 2));

        const functionResponses = [];
        for (const call of functionCalls) {
            const functionName = call.name;
            const functionArgs = call.args;

            //console.log(`[Gemini Agent] Вызов функции: ${functionName} с аргументами:`, functionArgs);
            const tool = toolImplementations[functionName]; // <--- Вот здесь он найдет 'executeWiqlQuery'

            if (tool) {
                const toolResult = await tool(functionArgs);
                console.log(`[Gemini Agent] Результат вызова ${functionName}:`, JSON.stringify(toolResult, null, 2));
                functionResponses.push({
                    functionResponse: { name: functionName, response: toolResult }
                });
            } else {
                console.error(`[Gemini Agent] Ошибка: Неизвестный инструмент ${functionName}`);
                functionResponses.push({
                    functionResponse: { name: functionName, response: { error: `Функция ${functionName} не найдена.` } }
                });
            }
        }

        console.log("[Gemini Agent] Отправка результатов функций обратно в Gemini...");
        const resultWithFunctionResponses = await chat.sendMessage(functionResponses);
        response = resultWithFunctionResponses.response;
    }
}

module.exports = {
    runAgent
};