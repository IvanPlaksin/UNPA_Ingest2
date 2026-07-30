'use strict';

/**
 * Seed UIAnchor registry (Phase 8) — the "Explain this" anchor graph.
 *
 * Model (namespace PROJECT:ALTIORA, per PO ratification):
 *   (:UIAnchor {anchorId, title, description, uiPath, highlight, namespace})
 *   (:UIAnchor)-[:EXPLAINS]->(:KBArticle {articleId, title, snippet, collection})
 *
 * anchorExplain() (interpreter) resolves the EXPLAINS-linked KBArticle(s) for a
 * clicked anchor and explains from that CURATED content; anchors with no edges
 * fall back to semantic-by-title KB search (Phase 4 behaviour). So two of the six
 * seeded anchors are curated (requests, approvals) and four exercise the fallback
 * (catalog, tasks, chat, mail) — demonstrating both paths.
 *
 * Anchor set + routes + `highlight` (data-tour ids) are the REAL FlowDeskPortal
 * surfaces (PHASE0 F6). Idempotent (MERGE). Run: node scripts/seed-ui-anchors.js
 */

const { write, close } = require('../src/instances/flowdesk/schema-graph/driver');

const NS = 'PROJECT:ALTIORA';

// Curated KB content copied from the authoritative Qdrant seed (seed-altiora-knowledge.js)
// so the graph-driven explain path needs no Qdrant-by-id lookup.
const KB = {
  'KB-GEN-002': { title: 'How do I check the status of my request?', snippet: 'Every submitted request gets a reference number (for example SR-12345). Give me that number and I can look up its current status.' },
  'KB-GEN-003': { title: 'How do I cancel or change a request I started?', snippet: 'Tell me the request reference and what you want to change; I can help you update or withdraw a request that is still open.' },
  'KB-HW-004': { title: 'Who approves a hardware request?', snippet: 'Hardware requests require approval. The approver defaults to the administrative manager of the beneficiary (or of the requester if you are filing for yourself). You can pick a different approver from the directory if needed.' },
};

const ANCHORS = [
  { anchorId: 'altiora.requests.list', title: 'Your Requests', uiPath: '/requests', highlight: 'portal-header-nav',
    description: 'The list of service requests you have raised and their status.', explains: ['KB-GEN-002', 'KB-GEN-003'] },
  { anchorId: 'altiora.approvals.list', title: 'Pending Approvals', uiPath: '/approvals', highlight: 'portal-header-nav',
    description: 'Requests awaiting your approval.', explains: ['KB-HW-004'] },
  { anchorId: 'altiora.catalog.search', title: 'Service Catalog Search', uiPath: '/catalog', highlight: 'portal-catalog-search',
    description: 'Search the catalog for a service to request.', explains: [] },
  { anchorId: 'altiora.tasks.list', title: 'Your Tasks', uiPath: '/tasks', highlight: 'portal-header-nav',
    description: 'Tasks assigned to you.', explains: [] },
  { anchorId: 'altiora.chat.input', title: 'Assistant Chat', uiPath: '/chat', highlight: 'portal-chat-input',
    description: 'Ask the assistant to find a service or answer a question.', explains: [] },
  { anchorId: 'altiora.mail', title: 'Mail', uiPath: '/mail', highlight: null,
    description: 'Your notifications and messages.', explains: [] },
];

async function main() {
  let anchors = 0;
  let edges = 0;

  for (const a of ANCHORS) {
    await write(
      `MERGE (n:UIAnchor {anchorId: $anchorId})
       SET n.title = $title, n.description = $description, n.uiPath = $uiPath,
           n.highlight = $highlight, n.namespace = $namespace, n.updatedAt = timestamp()`,
      { anchorId: a.anchorId, title: a.title, description: a.description, uiPath: a.uiPath, highlight: a.highlight, namespace: NS },
    );
    anchors += 1;

    for (const articleId of a.explains) {
      const kb = KB[articleId];
      if (!kb) continue;
      await write(
        `MERGE (k:KBArticle {articleId: $articleId})
           SET k.title = $title, k.snippet = $snippet, k.collection = 'altiora_knowledge'
         WITH k
         MATCH (n:UIAnchor {anchorId: $anchorId})
         MERGE (n)-[:EXPLAINS]->(k)`,
        { articleId, title: kb.title, snippet: kb.snippet, anchorId: a.anchorId },
      );
      edges += 1;
    }
  }

  console.log(`[seed-ui-anchors] UIAnchor nodes: ${anchors}, EXPLAINS edges: ${edges} (namespace ${NS})`);
  await close();
}

main().catch(async (err) => { console.error('[seed-ui-anchors] failed:', err.message); try { await close(); } catch (_) {} process.exit(1); });
