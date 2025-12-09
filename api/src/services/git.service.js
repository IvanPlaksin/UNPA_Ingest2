// src/services/git.service.js
const azdev = require("azure-devops-node-api");
const { GitVersionType } = require("azure-devops-node-api/interfaces/GitInterfaces");

const ADO_ORG_URL = process.env.ADO_ORG_URL;
const ADO_PAT = process.env.ADO_PAT;

if (!ADO_ORG_URL || !ADO_PAT) {
    throw new Error("Ошибка конфигурации .env");
}

let gitApi = null;

async function getGitApi() {
    if (gitApi) return gitApi;
    const authHandler = azdev.getPersonalAccessTokenHandler(ADO_PAT);
    const connection = new azdev.WebApi(ADO_ORG_URL, authHandler);
    gitApi = await connection.getGitApi();
    return gitApi;
}

async function getRepositories({ projectName }) {
    const api = await getGitApi();
    console.log(`[Git Tool] Получение списка репозиториев...`);
    const repos = await api.getRepositories(projectName);
    return repos.map(r => ({ id: r.id, name: r.name, defaultBranch: r.defaultBranch }));
}

async function getCommits({ repositoryName, projectName, limit = 10, author }) {
    const api = await getGitApi();
    console.log(`[Git Tool] Запрос коммитов для: ${repositoryName}`);

    const repo = await api.getRepository(repositoryName, projectName);
    if (!repo) return { error: `Репозиторий '${repositoryName}' не найден.` };

    const searchCriteria = {
        itemVersion: { versionType: GitVersionType.Branch, version: "master" }, // Default to master
        top: limit,
        author: author || undefined
    };

    try {
        const commits = await api.getCommits(repo.id, searchCriteria, projectName);
        return commits.map(c => ({
            commitId: c.commitId,
            author: c.author.name,
            date: c.author.date,
            comment: c.comment,
            url: c.remoteUrl
        }));
    } catch (e) {
        return { error: e.message };
    }
}

async function getFileContent({ repositoryName, projectName, filePath, branch }) {
    const api = await getGitApi();
    console.log(`[Git Tool] Чтение файла: ${filePath}`);

    const repo = await api.getRepository(repositoryName, projectName);
    if (!repo) return { error: `Репозиторий не найден.` };

    try {
        const versionDescriptor = {
            versionType: GitVersionType.Branch,
            version: branch || (repo.defaultBranch ? repo.defaultBranch.replace('refs/heads/', '') : 'master')
        };

        const item = await api.getItem(
            repo.id,
            filePath,
            projectName,
            undefined,
            undefined,
            true,
            undefined,
            false,
            versionDescriptor
        );

        if (!item) return { error: "Файл не найден." };
        if (item.isFolder) return { error: "Это папка. Укажите путь к файлу." };

        if (item.content.length > 50000) {
            return {
                warning: "Файл обрезан (слишком большой).",
                content: item.content.substring(0, 50000) + "\n...[TRUNCATED]"
            };
        }
        return { content: item.content };

    } catch (e) {
        return { error: `Не удалось прочитать файл: ${e.message}` };
    }
}

async function getCommitDiff({ repositoryName, projectName, commitId }) {
    const api = await getGitApi();
    console.log(`[Git Tool] Получение Diff для коммита: ${commitId}`);

    const repo = await api.getRepository(repositoryName, projectName);
    if (!repo) return { error: `Репозиторий не найден.` };

    try {
        // 1. Получаем список изменений
        const changes = await api.getChanges(commitId, repo.id, projectName);

        if (!changes || changes.changes.length === 0) {
            return { files: [] };
        }

        // 2. Для каждого изменения загружаем контент (упрощенно)
        // В идеале нужно брать diff endpoint, но для MVP загрузим контент файла
        // и "предыдущего" (хотя это сложно без parentId). 
        // Пока вернем просто список файлов и текущий контент как "new".
        // "old" оставим пустым или попробуем найти parent.

        const commit = await api.getCommit(commitId, repo.id, projectName);
        const parentId = commit.parents && commit.parents.length > 0 ? commit.parents[0] : null;

        const diffs = await Promise.all(changes.changes.map(async (change) => {
            const path = change.item.path;
            const isDelete = change.changeType === 2; // Delete
            const isAdd = change.changeType === 1; // Add
            const isEdit = change.changeType === 4; // Edit

            let newContent = "";
            let oldContent = "";

            // Fetch New Content (if not deleted)
            if (!isDelete) {
                try {
                    const item = await api.getItem(repo.id, path, projectName, undefined, undefined, true, undefined, false, {
                        versionType: GitVersionType.Commit,
                        version: commitId
                    });
                    newContent = item.content;
                } catch (e) {
                    newContent = "(Error loading content)";
                }
            }

            // Fetch Old Content (if not added and parent exists)
            if (!isAdd && parentId) {
                try {
                    const item = await api.getItem(repo.id, path, projectName, undefined, undefined, true, undefined, false, {
                        versionType: GitVersionType.Commit,
                        version: parentId
                    });
                    oldContent = item.content;
                } catch (e) {
                    oldContent = ""; // File might not exist in parent or moved
                }
            }

            return {
                path: path,
                changeType: change.changeType, // 1=Add, 2=Delete, 4=Edit
                diff: {
                    old: oldContent,
                    new: newContent
                }
            };
        }));

        return { files: diffs };

    } catch (e) {
        console.error("Diff Error:", e);
        return { error: e.message };
    }
}

// --- SourceAdapter Implementation ---

/**
 * Streams ingestion items.
 * @param {Object} filter - { type: 'commit'|'file', repositoryName, projectName, limit, path }
 * @returns {AsyncGenerator<import('./interfaces/source.adapter').IngestionItem>}
 */
async function* fetchStream(filter) {
    const api = await getGitApi();
    const repo = await api.getRepository(filter.repositoryName, filter.projectName);

    if (!repo) throw new Error(`Repository verified failed: ${filter.repositoryName}`);

    if (filter.type === 'commit') {
        const commits = await getCommits({
            repositoryName: filter.repositoryName,
            projectName: filter.projectName,
            limit: filter.limit || 50
        });

        if (commits.error) throw new Error(commits.error);

        for (const c of commits) {
            yield {
                id: c.commitId,
                type: 'commit',
                content: c.comment,
                metadata: {
                    author: c.author,
                    date: c.date,
                    url: c.url,
                    source: 'git'
                },
                context: {
                    repo: filter.repositoryName,
                    project: filter.projectName
                }
            };
        }
    } else if (filter.type === 'file') {
        // List files recursively
        // RecursionLevel.Full = 120
        const items = await api.getItems(
            repo.id,
            filter.projectName,
            filter.path || '/',
            120, // Full recursion
            false, // includeContentMetadata
            false, // latestProcessedChange
            false, // download
            false // includeLinks
        );

        if (!items) return;

        for (const item of items) {
            if (item.isFolder) continue;

            const contentResult = await getFileContent({
                repositoryName: filter.repositoryName,
                projectName: filter.projectName,
                filePath: item.path
            });

            if (contentResult.error) {
                console.warn(`[Git Adapter] Failed to read ${item.path}: ${contentResult.error}`);
                continue;
            }

            yield {
                id: item.objectId, // Git Object ID
                type: 'file',
                content: contentResult.content,
                metadata: {
                    path: item.path,
                    url: item.url,
                    source: 'git'
                },
                context: {
                    repo: filter.repositoryName,
                    project: filter.projectName
                }
            };
        }
    }
}

async function validateConfig() {
    try {
        await getGitApi();
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    getRepositories,
    getCommits,
    getFileContent,
    getCommitDiff,
    fetchStream,
    validateConfig
};
