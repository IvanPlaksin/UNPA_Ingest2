/**
 * MCP Tools for ES Ingestion Pipeline
 *
 * Tools to manage document extraction pipeline and Entity Store operations.
 * Calls UNPA_Ingest API at UNPA_API_URL (default: http://localhost:3010).
 */

const UNPA_API = process.env.UNPA_API_URL ?? 'http://localhost:3010';

type ApiResponse = { ok?: boolean; success?: boolean; error?: string; data?: unknown };

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${UNPA_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as ApiResponse;
  const ok = json.ok ?? json.success;
  if (!ok) throw new Error(json.error ?? `API error ${res.status}`);
  return json.data;
}

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${UNPA_API}${path}`);
  const json = await res.json() as ApiResponse;
  const ok = json.ok ?? json.success;
  if (!ok) throw new Error(json.error ?? `API error ${res.status}`);
  return json.data;
}

export function getPipelineToolDefinitions() {
  return [
    {
      name: 'pipeline_enqueue',
      description: `Enqueue one or more documents for AI extraction + Entity Store import.
        Adds documents to the BullMQ pipeline-manager queue (concurrency=3).
        Returns job IDs that can be polled with pipeline_get_job_status.`,
      inputSchema: {
        type: 'object',
        properties: {
          documentIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of Document IDs to enqueue (max 20 per call)',
          },
          priority: {
            type: 'number',
            enum: [1, 2, 3],
            description: 'Queue priority: 1=high, 2=normal, 3=low (default: 2)',
          },
          model: {
            type: 'string',
            description: 'Extraction model override (default: claude-code)',
          },
        },
        required: ['documentIds'],
      },
    },

    {
      name: 'pipeline_get_stats',
      description: `Get BullMQ pipeline-manager queue statistics.
        Returns counts for waiting, active, completed, failed, and delayed jobs.
        Also returns throughput metrics (jobs/hour).`,
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },

    {
      name: 'pipeline_get_job_status',
      description: `Get the status and result of a specific extraction pipeline job.
        Returns state (waiting|active|completed|failed), progress, timestamps, and error if failed.`,
      inputSchema: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'Job ID returned by pipeline_enqueue',
          },
        },
        required: ['jobId'],
      },
    },

    {
      name: 'es_get_unprocessed_docrefs',
      description: `Find Document nodes that have not yet been AI-extracted or imported into Entity Store.
        Returns up to 'limit' documents ordered by creation date (oldest first).
        Use this to discover the next batch for the ingestion agent.`,
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Max documents to return (default: 50)',
          },
          namespace: {
            type: 'string',
            description: 'Filter by ES namespace (optional)',
          },
        },
      },
    },

    {
      name: 'es_get_stats',
      description: `Get Entity Store statistics: total entities by type, total relationships by type,
        namespace counts, and avg degree. Use after each batch to report progress.`,
      inputSchema: {
        type: 'object',
        properties: {
          namespace: {
            type: 'string',
            description: 'Filter stats to a specific namespace (optional)',
          },
        },
      },
    },
  ];
}

export async function handlePipelineToolCall(
  name: string,
  args: Record<string, unknown>,
  memgraphService: { query: (cypher: string, params?: Record<string, unknown>) => Promise<unknown[]> },
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const text = (data: unknown) => ({
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  });
  const err = (msg: string) => ({
    content: [{ type: 'text', text: `Error: ${msg}` }],
    isError: true,
  });

  try {
    switch (name) {
      case 'pipeline_enqueue': {
        const { documentIds, priority = 2, model } = args as {
          documentIds: string[];
          priority?: number;
          model?: string;
        };
        if (!Array.isArray(documentIds) || documentIds.length === 0) {
          return err('documentIds must be a non-empty array');
        }
        if (documentIds.length > 20) {
          return err('Max 20 document IDs per call');
        }
        const options: Record<string, unknown> = { priority };
        if (model) options.model = model;
        const result = await apiPost('/api/v1/pipeline/enqueue', {
          documentIds,
          options,
        });
        return text(result);
      }

      case 'pipeline_get_stats': {
        const result = await apiGet('/api/v1/pipeline/stats');
        return text(result);
      }

      case 'pipeline_get_job_status': {
        const { jobId } = args as { jobId: string };
        const result = await apiGet(`/api/v1/pipeline/jobs/${encodeURIComponent(jobId)}`);
        return text(result);
      }

      case 'es_get_unprocessed_docrefs': {
        const limit = (args.limit as number) || 50;
        const namespace = args.namespace as string | undefined;

        // Find Document nodes that have not been AI-extracted
        // (Memgraph does not support NOT EXISTS {} subquery — use WHERE IS NULL pattern)
        const nsFilter = namespace ? 'AND d.namespace = $namespace' : '';
        const rows = await memgraphService.query(
          `MATCH (d:Document)
           WHERE d.aiExtractedAt IS NULL ${nsFilter}
           RETURN d.id AS id,
                  d.documentTitle AS title,
                  d.unSymbol AS symbol,
                  d.documentType AS docType,
                  d.publishedDate AS publishedDate,
                  d.aiExtractedAt AS extractedAt,
                  d.createdAt AS createdAt
           ORDER BY d.createdAt ASC
           LIMIT ${Math.min(limit, 200)}`,
          namespace ? { namespace } : {}
        );

        // Normalize neo4j integer/null objects
        const normalize = (v: unknown): unknown => {
          if (v == null) return null;
          if (typeof v === 'object' && 'low' in (v as Record<string, unknown>)) {
            return (v as { low: number }).low;
          }
          return v;
        };

        const docs = (rows as Record<string, unknown>[]).map(r => ({
          id:          normalize(r.id),
          title:       normalize(r.title),
          symbol:      normalize(r.symbol),
          docType:     normalize(r.docType),
          publishedDate: normalize(r.publishedDate),
          extractedAt: normalize(r.extractedAt),
          createdAt:   normalize(r.createdAt),
        }));

        return text({ count: docs.length, documents: docs });
      }

      case 'es_get_stats': {
        const namespace = args.namespace as string | undefined;
        const path = namespace
          ? `/api/v1/entity-store/stats?namespace=${encodeURIComponent(namespace)}`
          : '/api/v1/entity-store/stats';
        const result = await apiGet(path);
        return text(result);
      }

      default:
        return err(`Unknown pipeline tool: ${name}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(msg);
  }
}
