/**
 * Base Repository for Immutable Graph Architecture
 * Abstract base class providing common CRUD operations
 */

import { MemgraphClient } from '../db/memgraph.client';

export abstract class BaseRepository<T> {
  protected client: MemgraphClient;
  protected abstract label: string;

  constructor(client: MemgraphClient) {
    this.client = client;
  }

  protected abstract mapToEntity(record: Record<string, unknown>): T;
  protected abstract mapToParams(entity: Partial<T>): Record<string, unknown>;

  async findById(id: string, idField: string = 'id'): Promise<T | null> {
    const cypher = `MATCH (n:${this.label} {${idField}: $id}) RETURN n`;
    const results = await this.client.executeQuery<{ n: Record<string, unknown> }>(cypher, { id });
    if (results.length === 0) return null;
    return this.mapToEntity(results[0].n);
  }

  async findAll(limit: number = 100): Promise<T[]> {
    const cypher = `MATCH (n:${this.label}) RETURN n LIMIT $limit`;
    const results = await this.client.executeQuery<{ n: Record<string, unknown> }>(cypher, { limit });
    return results.map(r => this.mapToEntity(r.n));
  }

  async count(): Promise<number> {
    const cypher = `MATCH (n:${this.label}) RETURN count(n) as count`;
    const results = await this.client.executeQuery<{ count: number }>(cypher);
    return results[0]?.count || 0;
  }

  async exists(id: string, idField: string = 'id'): Promise<boolean> {
    const cypher = `MATCH (n:${this.label} {${idField}: $id}) RETURN count(n) > 0 as exists`;
    const results = await this.client.executeQuery<{ exists: boolean }>(cypher, { id });
    return results[0]?.exists || false;
  }

  async deleteById(id: string, idField: string = 'id'): Promise<boolean> {
    const cypher = `MATCH (n:${this.label} {${idField}: $id}) DELETE n RETURN count(n) as deleted`;
    const results = await this.client.executeWrite<{ deleted: number }>(cypher, { id });
    return (results[0]?.deleted || 0) > 0;
  }
}
