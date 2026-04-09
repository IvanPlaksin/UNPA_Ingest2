/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RAG DOMAIN PLUGIN
 * Retrieval-Augmented Generation executors for AOPEG pipeline
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PluginBase, PluginMetadata } from '../plugin-base';

// Import executors
import { VectorSearchExecutor } from './executors/vector-search.executor';
import { GraphSearchExecutor } from './executors/graph-search.executor';
import { HybridSearchExecutor } from './executors/hybrid-search.executor';
import { RerankExecutor } from './executors/rerank.executor';
import { AssembleContextExecutor } from './executors/assemble-context.executor';
import { GenerateResponseExecutor } from './executors/generate-response.executor';
import { ExpandQueryExecutor } from './executors/expand-query.executor';

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN METADATA
// ────────────────────────────────────────────────────────────────────────────

const PLUGIN_METADATA: PluginMetadata = {
  name: 'rag',
  version: '1.0.0',
  description: 'Retrieval-Augmented Generation pipeline executors',
  author: 'UNPA Team',
  domain: 'rag',
};

// ────────────────────────────────────────────────────────────────────────────
// RAG PLUGIN CLASS
// ────────────────────────────────────────────────────────────────────────────

export class RAGPlugin extends PluginBase {
  constructor() {
    super(PLUGIN_METADATA);
  }

  /**
   * Initialize the plugin - set up all executors
   */
  async initialize(): Promise<void> {
    console.log('[RAGPlugin] Initializing...');

    // Add query processing executors
    this.addExecutor(new ExpandQueryExecutor());

    // Add search executors
    this.addExecutor(new VectorSearchExecutor());
    this.addExecutor(new GraphSearchExecutor());
    this.addExecutor(new HybridSearchExecutor());

    // Add result processing executors
    this.addExecutor(new RerankExecutor());
    this.addExecutor(new AssembleContextExecutor());

    // Add generation executor
    this.addExecutor(new GenerateResponseExecutor());

    console.log('[RAGPlugin] Initialized with 7 executors');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('[RAGPlugin] Cleaning up...');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

export const ragPlugin = new RAGPlugin();
export default ragPlugin;
