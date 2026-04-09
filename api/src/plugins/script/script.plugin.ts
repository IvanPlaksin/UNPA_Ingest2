/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCRIPT PLUGIN
 * Sandboxed JavaScript execution within graph pipelines
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  PluginBase,
  PluginMetadata,
} from '../../core/aopeg/plugins/plugin-base';
import { ScriptExecuteExecutor } from './executors/script-execute.executor';

const SCRIPT_PLUGIN_METADATA: PluginMetadata = {
  name: 'aopeg-script',
  version: '1.0.0',
  domain: 'script',
  description: 'Sandboxed JavaScript execution executor for data transformation and scripting',
};

export class ScriptPlugin extends PluginBase {
  constructor() {
    super(SCRIPT_PLUGIN_METADATA);

    this.addExecutor(new ScriptExecuteExecutor());
  }
}

// Singleton instance
export const scriptPlugin = new ScriptPlugin();
