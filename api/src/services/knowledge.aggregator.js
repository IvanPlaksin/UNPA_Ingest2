const adoService = require('./ado.service');
const gitService = require('./git.service');
const tfvcService = require('./tfvc.service');
// const emailService = require('./msgraph.service'); // (Future)

async function aggregateWorkItemContext(workItemId) {
    console.log(`[Aggregator] Сбор данных для #${workItemId}...`);

    // 1. Основная задача (DevOps) - Full Model
    const mainItem = await adoService.getWorkItemById(workItemId);
    if (!mainItem) throw new Error("Task not found");

    // 2. Group Relations
    const relations = {
        hierarchy: {
            parent: [],
            children: []
        },
        related: [],
        artifacts: []
    };

    if (mainItem.relations) {
        mainItem.relations.forEach(rel => {
            if (rel.rel === 'System.LinkTypes.Hierarchy-Reverse') {
                relations.hierarchy.parent.push(rel);
            } else if (rel.rel === 'System.LinkTypes.Hierarchy-Forward') {
                relations.hierarchy.children.push(rel);
            } else if (rel.rel === 'System.LinkTypes.Related') {
                relations.related.push(rel);
            } else if (rel.rel === 'ArtifactLink') {
                relations.artifacts.push(rel);
            } else if (rel.rel === 'AttachedFile') {
                relations.artifacts.push(rel);
            }
        });
        console.log("[Aggregator] All Relations Types:", mainItem.relations.map(r => r.rel));
        console.log("[Aggregator] Extracted Artifacts:", relations.artifacts.length);
    }

    // 3. Сбор контекста из Git (Real)
    const commitRelations = relations.artifacts.filter(r =>
        r.url.startsWith('vstfs:///Git/Commit')
    );

    // Extract Attachments
    const attachmentRelations = relations.artifacts.filter(r =>
        r.rel === 'AttachedFile'
    ).map(r => ({
        url: r.url,
        name: r.attributes?.name || 'Unknown File', // ADO usually provides name in attributes
        size: r.attributes?.resourceSize, // Sometimes available
        id: r.url.split('/').pop() // Extract ID if possible
    }));

    const commitPromises = commitRelations.map(async (rel) => {
        try {
            // URL format: vstfs:///Git/Commit/{projectId}/{repoId}/{commitId}
            const urlParts = decodeURIComponent(rel.url).split('/');
            const commitId = urlParts.pop();
            const repoId = urlParts.pop();
            const projectId = urlParts.pop();

            // Fetch Commit Details & Diff
            const diffData = await gitService.getCommitDiff({
                repositoryName: repoId,
                projectName: projectId,
                commitId: commitId
            });

            if (diffData.error) return null;

            return {
                id: commitId,
                message: "Linked Commit", // Placeholder
                author: "Unknown", // Placeholder
                files: diffData.files,
                type: 'git'
            };
        } catch (e) {
            console.error("Error processing commit relation:", e);
            return null;
        }
    });

    const realCommits = (await Promise.all(commitPromises)).filter(c => c !== null);

    // 4. TFVC Search (RP Tag Strategy)
    let tfvcChangesets = [];
    try {
        // Extract RP tags
        const tags = mainItem.fields['System.Tags'] || [];
        const rpTags = tags.filter(t => t.match(/^RP\s?\d+$/i));

        let searchTerms = [workItemId.toString()]; // Default: search by ID
        if (rpTags.length > 0) {
            // If RP tags exist, search by them too
            searchTerms = [...searchTerms, ...rpTags];
            console.log(`[Aggregator] Found RP Tags: ${rpTags.join(', ')}. Will search TFVC for these.`);
        }

        // --- Strategy 1: Search Labels (Server-Side Name Filter) ---
        let labelChangesets = [];
        if (rpTags.length > 0) {
            for (const tag of rpTags) {
                const labelName = `*${tag}*`;
                console.log(`[Aggregator] Searching TFVC Labels for name: ${labelName}`);
                try {
                    const labels = await tfvcService.getTfvcLabels({ name: labelName });
                    labels.forEach(l => {
                        labelChangesets.push({
                            changesetId: `LABEL-${l.id}`,
                            author: l.owner,
                            date: l.date,
                            comment: `Label: ${l.name} (Scope: ${l.scope})`,
                            type: 'tfvc-label'
                        });
                    });
                } catch (err) {
                    console.error(`[Aggregator] Error searching labels for ${labelName}:`, err.message);
                }
            }
        }
        // -----------------------------------------------------------

        // --- Strategy 2: Search Changesets (Date Filter + Client-Side Comment Filter) ---
        // User Request: Use Created Date as Start Date and Modification Date as End Date
        const createdDate = new Date(mainItem.fields['System.CreatedDate']);
        const fromDate = createdDate.toISOString();

        const changedDate = new Date(mainItem.fields['System.ChangedDate']);
        const toDate = changedDate.toISOString();

        console.log(`[Aggregator] Searching TFVC Changesets in $/ATS for terms: ${searchTerms.join(', ')} from ${fromDate} to ${toDate}...`);

        const searchCriteria = {
            fromDate: fromDate,
            toDate: toDate,
            commentContains: searchTerms
        };

        let relevantChangesets = [];
        try {
            relevantChangesets = await tfvcService.getTfvcChangesets("$/ATS", 1000, 0, searchCriteria);
        } catch (err) {
            console.error(`[Aggregator] Error searching changesets:`, err.message);
        }
        // --------------------------------------------------------------------------------

        const combinedResults = [...labelChangesets, ...relevantChangesets];

        tfvcChangesets = await Promise.all(combinedResults.map(async (cs) => {
            if (cs.type === 'tfvc-label') {
                return {
                    id: cs.changesetId,
                    message: cs.comment,
                    author: cs.author,
                    files: [],
                    type: 'tfvc'
                };
            }

            try {
                const changes = await tfvcService.getTfvcChangesetChanges(cs.changesetId);
                const files = await Promise.all(changes.map(async (change) => {
                    const content = await tfvcService.getTfvcItemContent(change.item.path, cs.changesetId.toString());
                    return {
                        path: change.item.path,
                        changeType: change.changeType,
                        diff: { old: "", new: content }
                    };
                }));

                return {
                    id: cs.changesetId.toString(),
                    message: cs.comment,
                    author: cs.author.displayName || cs.author,
                    files: files,
                    type: 'tfvc'
                };
            } catch (err) {
                console.error(`[Aggregator] Error processing changeset ${cs.changesetId}:`, err.message);
                return {
                    id: cs.changesetId.toString(),
                    message: cs.comment,
                    author: cs.author.displayName || cs.author,
                    files: [],
                    type: 'tfvc',
                    error: "Failed to load details"
                };
            }
        }));
    } catch (e) {
        console.error("TFVC Search Error:", e);
    }

    const allCommits = [...realCommits, ...tfvcChangesets];

    // Extract files from commits for the "files" list
    const files = [];
    allCommits.forEach(c => {
        if (c.files) {
            c.files.forEach(f => {
                files.push({
                    path: f.path,
                    reason: `Changed in ${c.type === 'tfvc' ? 'Changeset' : 'Commit'} ${c.id}`,
                    diff: f.diff
                });
            });
        }
    });

    // 5. Nexus Model Construction
    const nexusModel = {
        entityType: "WorkItemNexus",
        core: mainItem,
        relations: relations,
        linkedArtifacts: {
            commits: allCommits,
            files: files,
            tfvcChangesets: tfvcChangesets,
            attachments: attachmentRelations
        },
        metadata: {
            generatedAt: new Date().toISOString(),
            sources: ["ado", "git", "tfvc"],
            searchStrategy: {
                rpTagsUsed: mainItem.fields['System.Tags']?.filter(t => t.match(/^RP\s?\d+$/i)) || []
            }
        }
    };

    return nexusModel;
}

module.exports = { aggregateWorkItemContext };
