const tools = [
    {
        functionDeclarations: [
            {
                name: "getTfvcItems",
                description: "Получает структуру файлов и папок в TFVC. Обязательно требует path (начинается с $/ProjectName).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        scopePath: {
                            type: "STRING",
                            description: "Путь в TFVC, с которого начать поиск. Должен начинаться с '$/'. Пример: '$/MyProject/Main'."
                        },
                        recursionLevel: {
                            type: "NUMBER",
                            description: "Уровень рекурсии: 0 (только этот элемент), 1 (один уровень вложенности), 2 (полная рекурсия). По умолчанию 1.",
                            nullable: true
                        }
                    },
                    required: ["scopePath"]
                }
            },
            {
                name: "getTfvcContent",
                description: "Читает содержимое файла из TFVC. Используй для анализа легаси-кода.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        path: {
                            type: "STRING",
                            description: "Полный путь к файлу в TFVC. Пример: '$/MyProject/Main/file.cs'."
                        }
                    },
                    required: ["path"]
                }
            },
            {
                name: "getTfvcHistory",
                description: "Получает историю изменений (Changesets) для указанного пути.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        itemPath: {
                            type: "STRING",
                            description: "Путь к файлу или папке для поиска истории."
                        },
                        top: {
                            type: "NUMBER",
                            description: "Максимальное количество возвращаемых изменений. По умолчанию 20.",
                            nullable: true
                        },
                        author: {
                            type: "STRING",
                            description: "Фильтр по автору изменений.",
                            nullable: true
                        }
                    },
                    required: ["itemPath"]
                }
            },
            {
                name: "getTfvcLabels",
                description: "Получает список меток (версий/релизов) в TFVC.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        searchCriteria: {
                            type: "OBJECT",
                            description: "Критерии поиска (опционально).",
                            nullable: true
                        }
                    }
                }
            }
        ]
    }
];

module.exports = tools;
