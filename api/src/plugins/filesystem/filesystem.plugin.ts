/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILESYSTEM PLUGIN
 * File system operations within the sandboxed Artefacts directory
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  PluginBase,
  PluginMetadata,
} from '../../core/aopeg/plugins/plugin-base';
import { ReadFileExecutor } from './executors/read-file.executor';
import { WriteFileExecutor } from './executors/write-file.executor';
import { ListFilesExecutor } from './executors/list-files.executor';

const FILESYSTEM_PLUGIN_METADATA: PluginMetadata = {
  name: 'aopeg-filesystem',
  version: '1.0.0',
  domain: 'filesystem',
  description: 'File system executors for reading, writing, and listing files in the Artefacts sandbox',
};

export class FilesystemPlugin extends PluginBase {
  constructor() {
    super(FILESYSTEM_PLUGIN_METADATA);

    this.addExecutor(new ReadFileExecutor());
    this.addExecutor(new WriteFileExecutor());
    this.addExecutor(new ListFilesExecutor());
  }
}

// Singleton instance
export const filesystemPlugin = new FilesystemPlugin();
