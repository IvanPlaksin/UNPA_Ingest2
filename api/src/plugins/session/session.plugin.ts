/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SESSION PLUGIN
 * AI session executors for LLM chat interactions
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  PluginBase,
  PluginMetadata,
} from '../../core/aopeg/plugins/plugin-base';
import { AIChatExecutor, LLMService, setSessionLLMService } from './executors/ai-chat.executor';

const SESSION_PLUGIN_METADATA: PluginMetadata = {
  name: 'aopeg-session',
  version: '1.0.0',
  domain: 'session',
  description: 'AI session executors for LLM chat interactions within graph execution',
};

export class AISessionPlugin extends PluginBase {
  constructor() {
    super(SESSION_PLUGIN_METADATA);

    this.addExecutor(new AIChatExecutor());
  }

  /**
   * Set the LLM service for the session plugin
   */
  setLLMService(service: LLMService): void {
    setSessionLLMService(service);
  }
}

// Singleton instance
export const sessionPlugin = new AISessionPlugin();
