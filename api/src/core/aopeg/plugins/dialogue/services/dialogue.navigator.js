'use strict';

const { execSync } = require('child_process');
const os = require('os');

/**
 * DialogueNavigatorService
 * Opens Claude Code VS Code tabs from DevDialogue Collector.
 *
 * Bridge: DevDialogue HTTP server → vscode://devdialogue.connector URI → VS Code extension → claude-vscode.editor.open
 *
 * Requires DevDialogue Connector VS Code extension to be installed.
 * Extension handles vscode://devdialogue.connector/open/:sessionId URIs.
 */
class DialogueNavigatorService {
  constructor() {
    this.platform = os.platform();
  }

  /**
   * Open a Claude Code session tab in VS Code.
   * @param {string} sessionId - JSONL session UUID
   * @returns {{ success: boolean, method: string, uri: string, error?: string }}
   */
  openSession(sessionId) {
    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }

    const uri = `vscode://devdialogue.connector/open/${sessionId}`;

    try {
      this._openUri(uri);
      return { success: true, method: 'vscode-uri', uri, sessionId };
    } catch (err) {
      // Fallback: open VS Code without specific session
      try {
        this._openVSCode();
        return { success: true, method: 'vscode-fallback', uri, sessionId, warning: err.message };
      } catch (err2) {
        return { success: false, error: err2.message, uri, sessionId };
      }
    }
  }

  /**
   * Check if VS Code is running by looking for code process.
   */
  isVSCodeRunning() {
    try {
      if (this.platform === 'win32') {
        const out = execSync('tasklist /FI "IMAGENAME eq Code.exe" /NH 2>NUL', { encoding: 'utf8', timeout: 3000 });
        return out.includes('Code.exe');
      } else {
        const out = execSync('pgrep -x "code" 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 3000 });
        return out.trim().length > 0;
      }
    } catch {
      return false;
    }
  }

  /**
   * Build a permalink URL for a session (localhost DevDialogue UI).
   */
  buildPermalink(sessionId, baseUrl = 'http://localhost:3000') {
    return `${baseUrl}/dialogue/session/${sessionId}`;
  }

  /**
   * Build a vscode:// URI for the session opener.
   */
  buildVSCodeUri(sessionId) {
    return `vscode://devdialogue.connector/open/${sessionId}`;
  }

  /**
   * Build a navigator API URL for direct HTTP-based opening.
   */
  buildNavigatorUrl(sessionId, baseUrl = 'http://localhost:4000') {
    return `${baseUrl}/api/v1/dialogue/navigate/open/${sessionId}`;
  }

  /**
   * Open a specific file in VS Code.
   * Uses vscode://file/{path} URI scheme.
   */
  openFile(filePath) {
    if (!filePath) return { success: false, error: 'filePath is required' };
    // Encode as vscode://file/ URI (forward slashes, spaces encoded)
    const normalized = filePath.replace(/\\/g, '/');
    const uri = `vscode://file/${normalized}`;
    try {
      this._openUri(uri);
      return { success: true, method: 'vscode-file', uri, filePath };
    } catch (err) {
      try {
        // Fallback: open VS Code in the directory
        const dir = require('path').dirname(filePath);
        require('child_process').execSync(
          this.platform === 'win32' ? `code "${dir}"` : `code "${dir}"`,
          { timeout: 5000 }
        );
        return { success: true, method: 'vscode-dir-fallback', uri, filePath, warning: err.message };
      } catch (err2) {
        return { success: false, error: err2.message, uri, filePath };
      }
    }
  }

  /**
   * Build a vscode://file/ URI for a given absolute path.
   */
  buildFileUri(filePath) {
    return `vscode://file/${filePath.replace(/\\/g, '/')}`;
  }

  _openUri(uri) {
    if (this.platform === 'win32') {
      execSync(`start "" "${uri}"`, { timeout: 5000 });
    } else if (this.platform === 'darwin') {
      execSync(`open "${uri}"`, { timeout: 5000 });
    } else {
      execSync(`xdg-open "${uri}"`, { timeout: 5000 });
    }
  }

  _openVSCode() {
    execSync('code .', { timeout: 5000 });
  }
}

const dialogueNavigator = new DialogueNavigatorService();

module.exports = { DialogueNavigatorService, dialogueNavigator };
