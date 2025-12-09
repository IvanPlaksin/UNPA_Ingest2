// src/tools/ado.tools.js

const tools = [
    {
        functionDeclarations: [
            {
                name: "getWorkItemsBySavedQuery",
                // ... (без изменений) ...
                description: "Получает список рабочих элементов...",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        queryId: { type: "STRING", description: "GUID сохраненного запроса." }
                    },
                    required: ["queryId"]
                }
            },
            {
                name: "executeWiqlQuery",
                description: "Выполняет произвольный WIQL-запрос. ВАЖНО: 'SELECT TOP' и 'SELECT *' НЕ ПОДДЕРЖИВАЮТСЯ.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        wiql: {
                            type: "STRING",
                            // ⭐ ИСПРАВЛЕНИЕ: Явно указываем выбирать только System.Id
                            description: "Полная строка WIQL-запроса. ВСЕГДА начинай запрос так: 'SELECT [System.Id] FROM workitems...'. Никогда не используй '*'. Пример: 'SELECT [System.Id] FROM workitems WHERE [System.WorkItemType] = \\'Bug\\' ORDER BY [System.CreatedDate] DESC'"
                        },
                        limit: {
                            type: "NUMBER",
                            description: "Сколько записей нужно детально проанализировать. Если пользователь не указал количество, НЕ ЗАПОЛНЯЙ это поле (по умолчанию будет 10). Если пользователь просит 'все' или 'посчитать', используй limit=0 или 1, чтобы сэкономить ресурсы.",
                            nullable: true
                        },
                        fieldsToReturn: {
                            type: "ARRAY",
                            description: "Список полей для возврата (например: ['System.Title', 'System.State']).",
                            items: { type: "STRING" },
                            nullable: true
                        }
                    },
                    required: ["wiql"]
                }
            }
        ]
    }
];

module.exports = tools;