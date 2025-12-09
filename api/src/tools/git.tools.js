// src/tools/git.tools.js
const tools = [
    {
        functionDeclarations: [
            {
                name: "getRepositories",
                description: "Получает список репозиториев в проекте.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        projectName: { type: "STRING", description: "Имя проекта DevOps." }
                    },
                    required: ["projectName"]
                }
            },
            {
                name: "getCommits",
                description: "Получает историю коммитов репозитория.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        repositoryName: { type: "STRING" },
                        projectName: { type: "STRING" },
                        limit: { type: "NUMBER", description: "Количество коммитов (default: 10)." },
                        author: { type: "STRING", description: "Фильтр по автору." }
                    },
                    required: ["repositoryName", "projectName"]
                }
            },
            {
                name: "getFileContent",
                description: "Читает содержимое файла кода. Используй для анализа кода, поиска багов или архитектурного обзора.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        repositoryName: { type: "STRING" },
                        projectName: { type: "STRING" },
                        filePath: { type: "STRING", description: "Полный путь (напр. '/src/index.js')." },
                        branch: { type: "STRING", description: "Имя ветки (опционально)." }
                    },
                    required: ["repositoryName", "projectName", "filePath"]
                }
            }
        ]
    }
];
module.exports = tools;
