/**
 * Extraction Plugin
 * Provides structured data extraction executors for parsing AI responses.
 */

const { PluginBase } = require('../plugin-base');
const { StructuredExtractorExecutor } = require('./executors/structured.executor');

class ExtractionPlugin extends PluginBase {
  constructor() {
    super({
      name: 'extraction',
      version: '1.0.0',
      description: 'Extraction executors: pattern-based structured data extraction from text',
      author: 'UNPA Team',
      domain: 'extraction',
    });
  }

  async initialize() {
    this.addExecutor(new StructuredExtractorExecutor());
  }
}

const extractionPlugin = new ExtractionPlugin();

module.exports = { ExtractionPlugin, extractionPlugin };
