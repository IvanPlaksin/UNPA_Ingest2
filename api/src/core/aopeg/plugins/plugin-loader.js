/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLUGIN LOADER
 * Handles loading and initialization of plugins
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { pluginRegistry } = require('../registry/plugin-registry');

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN LOADER
// ────────────────────────────────────────────────────────────────────────────

class PluginLoader {
  constructor() {
    this.loadedPlugins = new Map();
    this.initializationOrder = [];
  }

  /**
   * Load a plugin
   */
  async load(plugin) {
    const name = plugin.getMetadata().name;

    if (this.loadedPlugins.has(name)) {
      console.warn(`[PluginLoader] Plugin ${name} already loaded`);
      return;
    }

    console.log(`[PluginLoader] Loading plugin: ${name}`);

    // Initialize plugin
    await plugin.initialize();

    // Register components
    plugin.register();

    // Track loaded plugin
    this.loadedPlugins.set(name, plugin);
    this.initializationOrder.push(name);

    console.log(`[PluginLoader] Plugin ${name} loaded successfully`);
  }

  /**
   * Load multiple plugins
   */
  async loadAll(plugins) {
    for (const plugin of plugins) {
      await this.load(plugin);
    }
  }

  /**
   * Unload a plugin
   */
  async unload(name) {
    const plugin = this.loadedPlugins.get(name);
    if (!plugin) {
      return false;
    }

    console.log(`[PluginLoader] Unloading plugin: ${name}`);

    // Cleanup
    await plugin.cleanup();

    // Unregister
    plugin.unregister();

    // Remove from tracking
    this.loadedPlugins.delete(name);
    this.initializationOrder = this.initializationOrder.filter(n => n !== name);

    console.log(`[PluginLoader] Plugin ${name} unloaded`);
    return true;
  }

  /**
   * Unload all plugins in reverse order
   */
  async unloadAll() {
    const reversed = [...this.initializationOrder].reverse();
    for (const name of reversed) {
      await this.unload(name);
    }
  }

  /**
   * Get loaded plugin by name
   */
  getPlugin(name) {
    return this.loadedPlugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins() {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Get plugin names in load order
   */
  getLoadOrder() {
    return [...this.initializationOrder];
  }

  /**
   * Check if plugin is loaded
   */
  isLoaded(name) {
    return this.loadedPlugins.has(name);
  }

  /**
   * Get stats
   */
  getStats() {
    const registryStats = pluginRegistry.getStats();
    return {
      loadedPlugins: this.loadedPlugins.size,
      ...registryStats,
    };
  }
}

// Singleton instance
const pluginLoader = new PluginLoader();

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Load default plugins
 */
async function loadDefaultPlugins() {
  try {
    const { commonPlugin } = require('../../../plugins/common/common.plugin');
    const { aiPlugin } = require('../../../plugins/ai/ai.plugin');

    await pluginLoader.loadAll([commonPlugin, aiPlugin]);
    console.log('[PluginLoader] Default plugins loaded');
  } catch (error) {
    console.error('[PluginLoader] Error loading default plugins:', error.message);
  }
}

/**
 * Load domain plugins (ingestion, RAG, subgraph, workflow, notification)
 */
async function loadDomainPlugins() {
  try {
    // Import domain plugins dynamically
    const { commonPlugin } = require('./common');
    const { ingestionPlugin } = require('./ingestion');
    const { ragPlugin } = require('./rag');
    const { subgraphPlugin } = require('./subgraph');
    const { workflowPlugin } = require('./workflow');
    const { notificationPlugin } = require('./notification');
    const { SqlExtractionPlugin } = require('./sql-extraction/sql-extraction.plugin');
    const { plugin: flowdeskPlugin } = require('../../../../instances/flowdesk');
    const { validationPlugin } = require('./validation');
    const { extractionPlugin } = require('./extraction');
    const { dialoguePlugin } = require('./dialogue');

    const sqlExtractionPlugin = new SqlExtractionPlugin();

    await pluginLoader.loadAll([
      commonPlugin,
      ingestionPlugin,
      ragPlugin,
      subgraphPlugin,
      workflowPlugin,
      notificationPlugin,
      sqlExtractionPlugin,
      flowdeskPlugin,
      validationPlugin,
      extractionPlugin,
      dialoguePlugin,
    ]);

    console.log('[PluginLoader] Domain plugins loaded');
  } catch (error) {
    console.error('[PluginLoader] Error loading domain plugins:', error);
    // Continue without domain plugins - they're optional
  }
}

/**
 * Load tool plugins (filesystem, session, script)
 */
async function loadToolPlugins() {
  try {
    const { filesystemPlugin } = require('../../../plugins/filesystem');
    const { sessionPlugin } = require('../../../plugins/session');
    const { scriptPlugin } = require('../../../plugins/script');

    // Wire LLM service to session plugin (adapts llm.service.js chat() → generate())
    try {
      const { getInstance: getLLMProvider } = require('../../../services/llm/LLMProviderService');
      sessionPlugin.setLLMService({
        async generate(options) {
          const messages = [];
          if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
          }
          messages.push({ role: 'user', content: options.userPrompt });
          const result = await getLLMProvider().chat(messages);
          const rawContent = result.content;
          const content = Array.isArray(rawContent)
            ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
            : (rawContent || '');
          return {
            content,
            tokensUsed: result.usage?.total_tokens || 0,
          };
        },
      });
      console.log('[PluginLoader] Session LLM service wired');
    } catch (llmErr) {
      console.warn('[PluginLoader] Could not wire LLM service to session plugin:', llmErr.message);
    }

    await pluginLoader.loadAll([filesystemPlugin, sessionPlugin, scriptPlugin]);
    console.log('[PluginLoader] Tool plugins loaded');
  } catch (error) {
    console.error('[PluginLoader] Error loading tool plugins:', error.message);
  }
}

/**
 * Load all available plugins
 */
async function loadAllPlugins() {
  await loadDefaultPlugins();
  await loadDomainPlugins();
  await loadToolPlugins();

  console.log('[PluginLoader] All plugins loaded');
}

module.exports = {
  PluginLoader,
  pluginLoader,
  loadDefaultPlugins,
  loadDomainPlugins,
  loadToolPlugins,
  loadAllPlugins,
};
