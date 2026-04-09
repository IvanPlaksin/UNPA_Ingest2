/**
 * SubGraph Consolidation Plugin (JS)
 */

const { PluginBase } = require('../plugin-base');
const { SegmentGraphExecutor } = require('./executors/segment-graph.executor');
const { ExtractSubgraphExecutor } = require('./executors/extract-subgraph.executor');
const { ConsolidateSubgraphExecutor } = require('./executors/consolidate-subgraph.executor');

class SubgraphPlugin extends PluginBase {
  constructor() {
    super({
      name: 'subgraph',
      version: '1.0.0',
      description: 'Semantic subgraph extraction and consolidation pipeline',
      author: 'UNPA Team',
      domain: 'subgraph',
    });
  }

  async initialize() {
    this.addExecutor(new SegmentGraphExecutor());
    this.addExecutor(new ExtractSubgraphExecutor());
    this.addExecutor(new ConsolidateSubgraphExecutor());
  }
}

const subgraphPlugin = new SubgraphPlugin();

module.exports = { SubgraphPlugin, subgraphPlugin };
