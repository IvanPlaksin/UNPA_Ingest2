#!/usr/bin/env node
/**
 * Seed Business Requirements into Memgraph as META namespace nodes.
 * Creates BusinessRequirement nodes with IMPLEMENTED_BY edges to technical components.
 *
 * Usage: node api/scripts/seed-business-requirements.js
 */

const BUSINESS_REQUIREMENTS = [
  // CORE: Extraction & Preservation
  {
    code: 'BR-001', name: 'Legacy Code Extraction',
    description: 'Извлечение бизнес-логики из недокументированного кода (C#, TypeScript, SQL) через AST-анализ',
    status: 'IMPLEMENTED', priority: 'CRITICAL', category: 'CORE',
    implementedBy: ['ASTExtractor', 'LLMExtractor', 'HybridResolver']
  },
  {
    code: 'BR-002', name: 'Institutional Knowledge Preservation',
    description: 'Сохранение знаний уходящих сотрудников в структурированном виде через граф знаний',
    status: 'IMPLEMENTED', priority: 'CRITICAL', category: 'CORE',
    implementedBy: ['MemgraphService', 'GraphStorageService', 'ImmutableGraphService']
  },
  {
    code: 'BR-003', name: 'Traceability Recovery',
    description: 'Восстановление связей между Work Items (Azure DevOps) и кодом (TFVC)',
    status: 'PARTIAL', priority: 'HIGH', category: 'CORE',
    implementedBy: ['ADOService', 'TFVCService', 'RelationshipExtractor']
  },
  {
    code: 'BR-004', name: 'Multi-Source Integration',
    description: 'Интеграция данных из IMIS, Azure DevOps, TFVC, SharePoint, Email',
    status: 'PARTIAL', priority: 'HIGH', category: 'CORE',
    implementedBy: ['ADOService', 'TFVCService', 'GitService', 'SharePointConnector']
  },

  // ANALYSIS: Structure Understanding
  {
    code: 'BR-005', name: 'Automatic Structure Analysis',
    description: 'Автоматическое обнаружение hubs, bridges, orphans, clusters в графе',
    status: 'IMPLEMENTED', priority: 'HIGH', category: 'ANALYSIS',
    implementedBy: ['GraphAnalyzer', 'InsightsEngine', 'CommunityDetector', 'SemanticClusterer']
  },
  {
    code: 'BR-006', name: 'Multi-Layer Ontology',
    description: 'Разделение знаний на Strategic/Business/Code слои',
    status: 'IMPLEMENTED', priority: 'MEDIUM', category: 'ANALYSIS',
    implementedBy: ['OntologyLayerSplitter', 'OntologySchema']
  },
  {
    code: 'BR-007', name: 'Quality Insights',
    description: 'Автоматическая генерация предупреждений о проблемах (7 правил)',
    status: 'IMPLEMENTED', priority: 'MEDIUM', category: 'ANALYSIS',
    implementedBy: ['InsightsEngine', 'InsightRules']
  },
  {
    code: 'BR-008', name: 'Semantic Clustering',
    description: 'Группировка узлов по семантической близости через embeddings',
    status: 'IMPLEMENTED', priority: 'MEDIUM', category: 'ANALYSIS',
    implementedBy: ['SemanticClusterer', 'EmbeddingService', 'TEIService']
  },

  // AI: Intelligent Analysis
  {
    code: 'BR-009', name: 'GNN Link Prediction',
    description: 'Предсказание недостающих связей через Graph Neural Networks',
    status: 'IMPLEMENTED', priority: 'MEDIUM', category: 'AI',
    implementedBy: ['GNNService', 'GNNPredictionsPanel', 'useGNNPredictions']
  },
  {
    code: 'BR-010', name: 'GNN Similarity Search',
    description: 'Поиск похожих узлов по структурным паттернам',
    status: 'IMPLEMENTED', priority: 'MEDIUM', category: 'AI',
    implementedBy: ['GNNService', 'SimilarityExplorer', 'useSimilarity']
  },
  {
    code: 'BR-011', name: 'AI Chat Interface',
    description: 'Естественно-языковой интерфейс для анализа графа (Graph Analyst Chat) через Claude Opus 4.6 с MCP tools',
    status: 'IMPLEMENTED', priority: 'HIGH', category: 'AI',
    implementedBy: ['GraphAnalystChat', 'GXEController.graphAnalystChat', 'MCPQueryTool']
  },
  {
    code: 'BR-012', name: 'LLM-Assisted Extraction',
    description: 'Использование LLM для извлечения сущностей и связей из текста',
    status: 'IMPLEMENTED', priority: 'HIGH', category: 'AI',
    implementedBy: ['EntityExtractor', 'RelationshipExtractor', 'LLMProvider', 'ClaudeProvider']
  },

  // UX: User Experience
  {
    code: 'BR-013', name: 'Visual Graph Navigation',
    description: 'Интерактивная визуализация графа с zoom/pan/selection через ReactFlow и Three.js',
    status: 'IMPLEMENTED', priority: 'HIGH', category: 'UX',
    implementedBy: ['GXEVisualizerPage', 'SingularityGraph', 'NexusPage']
  },
  {
    code: 'BR-014', name: 'Guided Analysis Workflow',
    description: 'Пошаговый процесс Understand→Discover→Evaluate→Act для неопытных пользователей',
    status: 'IMPLEMENTED', priority: 'MEDIUM', category: 'UX',
    implementedBy: ['GuidedMode', 'PhaseUnderstand', 'PhaseDiscover', 'PhaseEvaluate', 'PhaseAct']
  },
  {
    code: 'BR-015', name: 'Safe Consolidation',
    description: 'Checkpoint/Rollback механизм для безопасных изменений графа через SubGraph extraction',
    status: 'IMPLEMENTED', priority: 'HIGH', category: 'UX',
    implementedBy: ['SubgraphExtractor', 'GraphConsolidator', 'ConsolidationCheckpoint', 'RollbackConsolidationTool']
  },
];

async function seedBusinessRequirements() {
  let memgraph;
  try {
    memgraph = require('../src/services/memgraph.service.js');
    await memgraph.verifyConnectivity();
  } catch (e) {
    console.error('Failed to connect to Memgraph:', e.message);
    process.exit(1);
  }

  console.log('=== Seeding Business Requirements into META namespace ===\n');

  for (const br of BUSINESS_REQUIREMENTS) {
    try {
      // Create BusinessRequirement node
      await memgraph.executeQuery(`
        MERGE (br:BusinessRequirement {code: $code})
        SET br.name = $name,
            br.description = $description,
            br.status = $status,
            br.priority = $priority,
            br.category = $category,
            br.namespace = 'META',
            br.domain = 'meta',
            br.type = 'BusinessRequirement',
            br.updatedAt = datetime(),
            br.source = 'knowledge-sync-2026-02-26'
      `, {
        code: br.code,
        name: br.name,
        description: br.description,
        status: br.status,
        priority: br.priority,
        category: br.category,
      }, { timeout: 10000 });

      console.log(`  ✅ ${br.code}: ${br.name} [${br.status}]`);

      // Create IMPLEMENTED_BY edges to components
      for (const comp of br.implementedBy) {
        await memgraph.executeQuery(`
          MATCH (br:BusinessRequirement {code: $code})
          MERGE (c:TechnicalComponent {name: $comp})
          ON CREATE SET c.namespace = 'META', c.domain = 'meta', c.type = 'TechnicalComponent',
                        c.createdAt = datetime()
          MERGE (br)-[:IMPLEMENTED_BY]->(c)
        `, { code: br.code, comp }, { timeout: 10000 });
      }
      console.log(`     → ${br.implementedBy.length} IMPLEMENTED_BY edges`);

    } catch (e) {
      console.error(`  ❌ ${br.code}: ${e.message}`);
    }
  }

  // Create category grouping edges
  console.log('\nCreating category grouping...');
  const categories = ['CORE', 'ANALYSIS', 'AI', 'UX'];
  for (const cat of categories) {
    try {
      await memgraph.executeQuery(`
        MERGE (g:RequirementCategory {name: $cat})
        SET g.namespace = 'META', g.domain = 'meta', g.type = 'RequirementCategory'
        WITH g
        MATCH (br:BusinessRequirement {category: $cat})
        MERGE (br)-[:BELONGS_TO_CATEGORY]->(g)
      `, { cat }, { timeout: 10000 });
      console.log(`  ✅ Category: ${cat}`);
    } catch (e) {
      console.error(`  ❌ Category ${cat}: ${e.message}`);
    }
  }

  // Summary
  const countRes = await memgraph.executeQuery(
    `MATCH (br:BusinessRequirement) RETURN count(br) AS total`, {}, { timeout: 5000 }
  );
  const total = countRes.records[0]?.get('total') || 0;
  console.log(`\n=== Done! ${total} Business Requirements in META namespace ===`);

  process.exit(0);
}

seedBusinessRequirements().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
