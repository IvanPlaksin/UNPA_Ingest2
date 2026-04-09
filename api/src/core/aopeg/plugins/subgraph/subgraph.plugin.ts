/**
 * SubGraph Consolidation Plugin
 *
 * Provides AOPEG executors for the subgraph consolidation pipeline:
 *   - segment_graph: Analyze namespace → find cluster candidates
 *   - extract_subgraph: Extract cluster → SubGraph with boundary ports
 *   - consolidate_subgraph: Consolidate with checkpoint-based rollback
 *
 * These can be wired into AOPEG DAGs for automated graph maintenance.
 */

import { PluginBase } from '../plugin-base';
import { SegmentGraphExecutor } from './executors/segment-graph.executor';
import { ExtractSubgraphExecutor } from './executors/extract-subgraph.executor';
import { ConsolidateSubgraphExecutor } from './executors/consolidate-subgraph.executor';

export class SubgraphPlugin extends PluginBase {
  constructor() {
    super({
      name: 'subgraph',
      version: '1.0.0',
      description: 'Semantic subgraph extraction and consolidation pipeline',
      author: 'UNPA Team',
      domain: 'subgraph',
    });
  }

  async initialize(): Promise<void> {
    this.addExecutor(new SegmentGraphExecutor());
    this.addExecutor(new ExtractSubgraphExecutor());
    this.addExecutor(new ConsolidateSubgraphExecutor());
  }
}

export const subgraphPlugin = new SubgraphPlugin();
