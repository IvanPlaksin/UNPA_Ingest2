/**
 * RabbitHole Adapter for Immutable Graph
 * UN ProjectAdvisor - Integration with RabbitHole ingestion service
 */

import { ImmutableGraphService } from '../immutable-graph.service';
import { ExtractionAdapter, ExtractionResult, ExtractionSourceInfo } from './extraction-adapter';
import { Namespace } from '../../../types/immutable-graph.types';
import { EventEmitter } from 'events';

export interface RabbitHoleJob {
  jobId: string;
  projectId: string;
  source: 'ado' | 'tfvc' | 'sharepoint' | 'git';
  options: {
    since?: string;
    types?: string[];
    paths?: string[];
  };
}

export interface RabbitHoleProgress {
  jobId: string;
  phase: 'fetching' | 'transforming' | 'storing' | 'complete' | 'error';
  current: number;
  total: number;
  message?: string;
}

export interface RabbitHoleResult {
  jobId: string;
  nodesCreated: number;
  nodesUpdated: number;
  edgesCreated: number;
  edgesUpdated: number;
  errors: number;
  duration: number;
}

export class RabbitHoleAdapter extends EventEmitter {
  private extractionAdapter: ExtractionAdapter | null = null;

  constructor(private graphService: ImmutableGraphService) {
    super();
  }

  async processJob(job: RabbitHoleJob): Promise<RabbitHoleResult> {
    const startTime = Date.now();
    this.extractionAdapter = new ExtractionAdapter(this.graphService, job.projectId);

    this.emitProgress(job.jobId, 'fetching', 0, 100, 'Starting ingestion...');

    try {
      const rawData = await this.fetchFromSource(job);
      this.emitProgress(job.jobId, 'fetching', 100, 100, 'Fetch complete');

      this.emitProgress(job.jobId, 'transforming', 0, 100, 'Transforming data...');
      const extractionResult = await this.transformToExtractionResult(rawData, job);
      this.emitProgress(job.jobId, 'transforming', 100, 100, 'Transform complete');

      this.emitProgress(job.jobId, 'storing', 0, extractionResult.entities.length, 'Storing to graph...');
      const importResult = await this.extractionAdapter.importExtractionResult(extractionResult);

      this.emitProgress(job.jobId, 'complete', 100, 100, 'Ingestion complete');

      return {
        jobId: job.jobId,
        nodesCreated: importResult.nodesCreated,
        nodesUpdated: importResult.nodesUpdated,
        edgesCreated: importResult.edgesCreated,
        edgesUpdated: importResult.edgesUpdated,
        errors: importResult.errors.length,
        duration: Date.now() - startTime
      };
    } catch (error) {
      this.emitProgress(job.jobId, 'error', 0, 0, (error as Error).message);
      throw error;
    }
  }

  private emitProgress(
    jobId: string,
    phase: RabbitHoleProgress['phase'],
    current: number,
    total: number,
    message?: string
  ): void {
    const progress: RabbitHoleProgress = { jobId, phase, current, total, message };
    this.emit('progress', progress);
  }

  private async fetchFromSource(job: RabbitHoleJob): Promise<unknown[]> {
    // This would integrate with actual RabbitHole fetchers
    // For now, return empty array - actual implementation connects to ADO/TFVC/SharePoint
    return [];
  }

  private async transformToExtractionResult(
    rawData: unknown[],
    job: RabbitHoleJob
  ): Promise<ExtractionResult> {
    const sourceInfo: ExtractionSourceInfo = {
      cycleId: job.jobId,
      projectId: job.projectId,
      sourceSystem: job.source,
      extractedAt: new Date(),
      extractorVersion: '1.0.0'
    };

    // Transform raw data based on source type
    const entities = rawData.map((item: any, index) => ({
      externalId: item.id || `${job.source}-${index}`,
      type: this.inferEntityType(item, job.source),
      name: item.title || item.name || item.path || `Item ${index}`,
      properties: this.extractProperties(item, job.source),
      sourceRef: item.url || item.path || ''
    }));

    const relationships = this.inferRelationships(rawData, job.source);

    return { entities, relationships, sourceInfo };
  }

  private inferEntityType(item: any, source: string): string {
    if (source === 'ado') {
      return item['System.WorkItemType'] || 'WorkItem';
    }
    if (source === 'tfvc' || source === 'git') {
      if (item.path?.endsWith('.cs')) return 'file';
      if (item.path?.endsWith('.ts')) return 'file';
      if (item.path?.endsWith('.sql')) return 'stored_procedure';
      return 'file';
    }
    if (source === 'sharepoint') {
      return 'document';
    }
    return 'unknown';
  }

  private extractProperties(item: any, source: string): Record<string, unknown> {
    const props: Record<string, unknown> = {};

    if (source === 'ado') {
      props.title = item['System.Title'];
      props.state = item['System.State'];
      props.assignedTo = item['System.AssignedTo'];
      props.createdDate = item['System.CreatedDate'];
      props.changedDate = item['System.ChangedDate'];
      props.description = item['System.Description'];
      props.acceptanceCriteria = item['Microsoft.VSTS.Common.AcceptanceCriteria'];
    } else if (source === 'tfvc' || source === 'git') {
      props.path = item.path;
      props.size = item.size;
      props.contentType = item.contentType;
      props.lastModified = item.lastModified;
    } else if (source === 'sharepoint') {
      props.title = item.title;
      props.path = item.path;
      props.author = item.author;
      props.lastModified = item.lastModified;
      props.contentType = item.contentType;
    }

    return props;
  }

  private inferRelationships(rawData: unknown[], source: string): ExtractionResult['relationships'] {
    const relationships: ExtractionResult['relationships'] = [];

    // Infer parent-child relationships from ADO work items
    if (source === 'ado') {
      for (const item of rawData as any[]) {
        if (item.relations) {
          for (const rel of item.relations) {
            if (rel.rel === 'System.LinkTypes.Hierarchy-Forward') {
              relationships.push({
                sourceExternalId: item.id.toString(),
                targetExternalId: this.extractIdFromUrl(rel.url),
                type: 'CONTAINS',
                properties: {},
                confidence: 1.0
              });
            }
          }
        }
      }
    }

    return relationships;
  }

  private extractIdFromUrl(url: string): string {
    const match = url.match(/\/(\d+)$/);
    return match ? match[1] : url;
  }
}
