/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INGESTION DOMAIN PLUGIN
 * Wraps existing ingestion services as AOPEG executors
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PluginBase, PluginMetadata } from '../plugin-base';

// Import executors
import { SanitizeExecutor } from './executors/sanitize.executor';
import { DetectLanguageExecutor } from './executors/detect-language.executor';
import { ChunkTextExecutor } from './executors/chunk-text.executor';
import { ExtractEntitiesExecutor } from './executors/extract-entities.executor';
import { ExtractRelationsExecutor } from './executors/extract-relations.executor';
import { ClassifyContentExecutor } from './executors/classify-content.executor';
import { WriteGraphExecutor } from './executors/write-graph.executor';
import { WriteVectorExecutor } from './executors/write-vector.executor';
import { ParseDocumentExecutor } from './executors/parse-document.executor';

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN METADATA
// ────────────────────────────────────────────────────────────────────────────

const PLUGIN_METADATA: PluginMetadata = {
  name: 'ingestion',
  version: '1.0.0',
  description: 'Document ingestion and preprocessing pipeline executors',
  author: 'UNPA Team',
  domain: 'ingestion',
};

// ────────────────────────────────────────────────────────────────────────────
// INGESTION PLUGIN CLASS
// ────────────────────────────────────────────────────────────────────────────

export class IngestionPlugin extends PluginBase {
  constructor() {
    super(PLUGIN_METADATA);
  }

  /**
   * Initialize the plugin - set up all executors
   */
  async initialize(): Promise<void> {
    console.log('[IngestionPlugin] Initializing...');

    // Add document parsing executor
    this.addExecutor(new ParseDocumentExecutor());

    // Add text preprocessing executors
    this.addExecutor(new SanitizeExecutor());
    this.addExecutor(new DetectLanguageExecutor());
    this.addExecutor(new ChunkTextExecutor());

    // Add extraction executors
    this.addExecutor(new ExtractEntitiesExecutor());
    this.addExecutor(new ExtractRelationsExecutor());
    this.addExecutor(new ClassifyContentExecutor());

    // Add storage executors
    this.addExecutor(new WriteGraphExecutor());
    this.addExecutor(new WriteVectorExecutor());

    console.log('[IngestionPlugin] Initialized with 9 executors');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log('[IngestionPlugin] Cleaning up...');
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

export const ingestionPlugin = new IngestionPlugin();
export default ingestionPlugin;
