/**
 * Validation Plugin
 * Provides graph structural validation and schema validation executors.
 */

const { PluginBase } = require('../plugin-base');
const { GraphValidateExecutor } = require('./executors/graph-validate.executor');
const { SchemaValidateExecutor } = require('./executors/schema-validate.executor');

class ValidationPlugin extends PluginBase {
  constructor() {
    super({
      name: 'validation',
      version: '1.0.0',
      description: 'Validation executors: graph structural validation, JSON schema validation',
      author: 'UNPA Team',
      domain: 'validation',
    });
  }

  async initialize() {
    this.addExecutor(new GraphValidateExecutor());
    this.addExecutor(new SchemaValidateExecutor());
  }
}

const validationPlugin = new ValidationPlugin();

module.exports = { ValidationPlugin, validationPlugin };
