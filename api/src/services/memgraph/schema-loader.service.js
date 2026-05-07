/**
 * SchemaLoaderService
 *
 * Loads Cypher schema files (indexes, constraints) into Memgraph.
 * Handles "already exists" errors gracefully.
 */

const fs = require('fs');
const path = require('path');

class SchemaLoaderService {
  /**
   * @param {Object} memgraph - MemgraphService instance
   */
  constructor(memgraph) {
    this._memgraph = memgraph;
  }

  /**
   * Load a schema file by name
   * @param {string} schemaName - Schema file name (without .cypher extension)
   * @returns {Promise<{success: boolean, statements: number, errors: string[]}>}
   */
  async loadSchema(schemaName) {
    // AGE does not support Memgraph-specific CREATE INDEX ON :Label(prop) syntax.
    // Running these statements takes ~100ms each (round-trip + error), blocking startup.
    if (process.env.GRAPH_DB_BACKEND === 'postgres-age') {
      return { success: true, statements: 0, errors: [] };
    }

    const schemaPath = path.join(__dirname, 'schemas', `${schemaName}.cypher`);

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    const content = fs.readFileSync(schemaPath, 'utf-8');

    // Split by semicolon, filter empty lines and comments
    const statements = content
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('//'));

    let executed = 0;
    const errors = [];

    for (const stmt of statements) {
      try {
        await this._memgraph.queryWithNamespace(stmt);
        executed++;
      } catch (err) {
        const msg = err.message || '';
        // Index/constraint already exists — that's OK
        if (msg.includes('already exists') || msg.includes('Already exists')) {
          executed++;
        } else {
          errors.push(`${stmt.substring(0, 60)}... → ${msg}`);
          console.warn(`[SchemaLoader] Warning: ${msg}`);
        }
      }
    }

    return { success: errors.length === 0, statements: executed, errors };
  }

  /**
   * Verify schema is loaded
   * @returns {Promise<{labels: string[], indexCount: number}>}
   */
  async verifySchema() {
    let labels = [];
    let indexCount = 0;

    try {
      const labelResult = await this._memgraph.queryWithNamespace('CALL db.labels() YIELD label RETURN label');
      labels = labelResult.map(r => r.label);
    } catch {
      // db.labels() may not be available
    }

    try {
      const indexResult = await this._memgraph.queryWithNamespace('SHOW INDEX INFO');
      indexCount = indexResult.length;
    } catch {
      // SHOW INDEX INFO may not be available in all Memgraph versions
    }

    return { labels, indexCount };
  }
}

module.exports = { SchemaLoaderService };
