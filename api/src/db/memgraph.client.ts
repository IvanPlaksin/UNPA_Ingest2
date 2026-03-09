/**
 * Memgraph Client for Immutable Graph Architecture
 * Provides connection management and query execution for Memgraph database
 *
 * IMPORTANT: Uses shared driver from memgraph.service.js to prevent connection pool exhaustion.
 * Do NOT create separate driver instances!
 */

import neo4j, { Driver, Session, ManagedTransaction } from 'neo4j-driver';

export interface MemgraphConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export class MemgraphClient {
  private driver: Driver;
  private config: MemgraphConfig;
  private ownsDriver: boolean;

  /**
   * Create a MemgraphClient. Prefer using getMemgraphClient() which uses shared driver.
   * @param config - Configuration or shared driver
   * @param sharedDriver - Optional shared driver (preferred to avoid connection pool exhaustion)
   */
  constructor(config: MemgraphConfig, sharedDriver?: Driver) {
    this.config = config;

    if (sharedDriver) {
      // Use shared driver - prevents multiple connection pools
      this.driver = sharedDriver;
      this.ownsDriver = false;
      console.log('[MemgraphClient] Using shared driver from memgraph.service');
    } else {
      // Fallback: create own driver (should be avoided in production)
      console.warn('[MemgraphClient] Creating separate driver - consider using shared driver');
      this.driver = neo4j.driver(
        config.uri,
        neo4j.auth.basic(config.username, config.password),
        {
          disableLosslessIntegers: true,
          maxConnectionPoolSize: 20,  // Reduced from 50 to limit connections
          connectionTimeout: 30000
        }
      );
      this.ownsDriver = true;
    }
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      await this.driver.verifyConnectivity();
      return true;
    } catch (error) {
      console.error('Memgraph connectivity failed:', error);
      return false;
    }
  }

  getSession(): Session {
    return this.driver.session({ database: this.config.database || 'memgraph' });
  }

  async executeQuery<T = Record<string, unknown>>(
    cypher: string,
    params: Record<string, unknown> = {}
  ): Promise<T[]> {
    const session = this.getSession();
    try {
      const result = await session.run(cypher, params);
      return result.records.map(record => {
        const obj: Record<string, unknown> = {};
        record.keys.forEach((key: string) => {
          obj[key] = this.convertNeo4jValue(record.get(key));
        });
        return obj as T;
      });
    } finally {
      await session.close();
    }
  }

  async executeWrite<T = Record<string, unknown>>(
    cypher: string,
    params: Record<string, unknown> = {}
  ): Promise<T[]> {
    const session = this.getSession();
    try {
      const result = await session.executeWrite(async (tx: ManagedTransaction) => {
        return await tx.run(cypher, params);
      });
      return result.records.map(record => {
        const obj: Record<string, unknown> = {};
        record.keys.forEach((key: string) => {
          obj[key] = this.convertNeo4jValue(record.get(key));
        });
        return obj as T;
      });
    } finally {
      await session.close();
    }
  }

  async executeTransaction<T>(
    work: (tx: ManagedTransaction) => Promise<T>
  ): Promise<T> {
    const session = this.getSession();
    try {
      return await session.executeWrite(work);
    } finally {
      await session.close();
    }
  }

  private convertNeo4jValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (neo4j.isInt(value)) return value.toNumber();
    if (neo4j.isDateTime(value) || neo4j.isDate(value)) {
      return new Date(value.toString());
    }
    if (Array.isArray(value)) return value.map(v => this.convertNeo4jValue(v));
    if (typeof value === 'object' && value !== null) {
      if ('properties' in value) {
        const node = value as { properties: Record<string, unknown> };
        const converted: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node.properties)) {
          converted[k] = this.convertNeo4jValue(v);
        }
        return converted;
      }
    }
    return value;
  }

  async close(): Promise<void> {
    // Only close driver if we own it (not shared)
    if (this.ownsDriver) {
      await this.driver.close();
    }
  }

  /**
   * Check if using shared driver
   */
  isUsingSharedDriver(): boolean {
    return !this.ownsDriver;
  }
}

let clientInstance: MemgraphClient | null = null;

/**
 * Get shared driver from memgraph.service.js singleton.
 * This ensures only one connection pool is used across the application.
 */
function tryGetSharedDriver(): Driver | undefined {
  try {
    // Dynamic require to avoid circular dependency issues
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const memgraphService = require('../services/memgraph.service');
    if (memgraphService && memgraphService.driver) {
      return memgraphService.driver;
    }
  } catch (e) {
    console.warn('[MemgraphClient] Could not get shared driver:', (e as Error).message);
  }
  return undefined;
}

/**
 * Get or create MemgraphClient singleton.
 * Automatically uses shared driver from memgraph.service.js to prevent connection pool exhaustion.
 *
 * @param config - Required on first call (only uri needed if using shared driver)
 * @param sharedDriver - Optional explicit shared driver (auto-detected if not provided)
 */
export function getMemgraphClient(config?: MemgraphConfig, sharedDriver?: Driver): MemgraphClient {
  if (!clientInstance && config) {
    // Auto-detect shared driver if not explicitly provided
    const driver = sharedDriver || tryGetSharedDriver();
    clientInstance = new MemgraphClient(config, driver);
  }
  if (!clientInstance) {
    throw new Error('MemgraphClient not initialized. Provide config on first call.');
  }
  return clientInstance;
}

export function resetMemgraphClient(): void {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
  }
}
