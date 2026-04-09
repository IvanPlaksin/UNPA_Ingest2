/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLUGIN LOADER
 * Handles loading and initialization of plugins
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { PluginBase } from './plugin-base';
import { pluginRegistry } from '../registry/plugin-registry';

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN LOADER
// ────────────────────────────────────────────────────────────────────────────

class PluginLoader {
  private loadedPlugins: Map<string, PluginBase> = new Map();
  private initializationOrder: string[] = [];

  /**
   * Load a plugin
   */
  async load(plugin: PluginBase): Promise<void> {
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
  async loadAll(plugins: PluginBase[]): Promise<void> {
    for (const plugin of plugins) {
      await this.load(plugin);
    }
  }

  /**
   * Unload a plugin
   */
  async unload(name: string): Promise<boolean> {
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
  async unloadAll(): Promise<void> {
    const reversed = [...this.initializationOrder].reverse();
    for (const name of reversed) {
      await this.unload(name);
    }
  }

  /**
   * Get loaded plugin by name
   */
  getPlugin(name: string): PluginBase | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getLoadedPlugins(): PluginBase[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * Get plugin names in load order
   */
  getLoadOrder(): string[] {
    return [...this.initializationOrder];
  }

  /**
   * Check if plugin is loaded
   */
  isLoaded(name: string): boolean {
    return this.loadedPlugins.has(name);
  }

  /**
   * Get stats
   */
  getStats(): {
    loadedPlugins: number;
    executors: number;
    conditions: number;
    transformers: number;
    domains: string[];
  } {
    const registryStats = pluginRegistry.getStats();
    return {
      loadedPlugins: this.loadedPlugins.size,
      ...registryStats,
    };
  }
}

// Singleton instance
export const pluginLoader = new PluginLoader();

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Load default plugins
 */
export async function loadDefaultPlugins(): Promise<void> {
  // Import plugins dynamically to avoid circular dependencies
  const { commonPlugin } = await import('../../../plugins/common/common.plugin');
  const { aiPlugin } = await import('../../../plugins/ai/ai.plugin');

  await pluginLoader.loadAll([
    commonPlugin,
    aiPlugin,
  ]);

  console.log('[PluginLoader] Default plugins loaded');
}

/**
 * Load domain plugins (ingestion, RAG)
 */
export async function loadDomainPlugins(): Promise<void> {
  try {
    // Import domain plugins dynamically
    const { ingestionPlugin } = await import('./ingestion');
    const { ragPlugin } = await import('./rag');
    const { subgraphPlugin } = await import('./subgraph');
    const { workflowPlugin } = await import('./workflow');
    const { notificationPlugin } = await import('./notification');
    const { flowdeskPlugin } = await import('./flowdesk');

    await pluginLoader.loadAll([
      ingestionPlugin,
      ragPlugin,
      subgraphPlugin,
      workflowPlugin,
      notificationPlugin,
      flowdeskPlugin,
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
export async function loadToolPlugins(): Promise<void> {
  try {
    const { filesystemPlugin } = await import('../../../plugins/filesystem');
    const { sessionPlugin } = await import('../../../plugins/session');
    const { scriptPlugin } = await import('../../../plugins/script');

    // Wire LLM service to session plugin (adapts llm.service.js chat() → generate())
    try {
      const llmService = require('../../../services/llm.service');
      (sessionPlugin as any).setLLMService({
        async generate(options: { model?: string; systemPrompt?: string; userPrompt: string; temperature?: number; maxTokens?: number }) {
          const messages: Array<{ role: string; content: string }> = [];
          if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
          }
          messages.push({ role: 'user', content: options.userPrompt });
          const result = await llmService.chat(messages);
          return {
            content: result.content || '',
            tokensUsed: result.usage?.total_tokens || 0,
          };
        },
      });
      console.log('[PluginLoader] Session LLM service wired');
    } catch (llmErr: any) {
      console.warn('[PluginLoader] Could not wire LLM service to session plugin:', llmErr.message);
    }

    await pluginLoader.loadAll([
      filesystemPlugin,
      sessionPlugin,
      scriptPlugin,
    ]);

    console.log('[PluginLoader] Tool plugins loaded');
  } catch (error) {
    console.error('[PluginLoader] Error loading tool plugins:', error);
  }
}

/**
 * Load all available plugins
 */
export async function loadAllPlugins(): Promise<void> {
  await loadDefaultPlugins();
  await loadDomainPlugins();
  await loadToolPlugins();

  console.log('[PluginLoader] All plugins loaded');
}
