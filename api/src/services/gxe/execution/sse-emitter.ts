/**
 * GXE Execution Engine - SSE Emitter
 *
 * Phase 0: Foundation (Day 7)
 *
 * HTTP Server-Sent Events emitter for real-time execution streaming.
 * Provides keep-alive pings to prevent proxy timeouts.
 */

import { Response } from 'express';
import { SSEEmitter, SSEEvent, NodeExecutionState } from './execution-context';

// ═══════════════════════════════════════════════════════════════════════════
// HTTP SSE EMITTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTTP SSE emitter that streams events through Express response.
 */
export class HttpSSEEmitter implements SSEEmitter {
  private res: Response;
  private closed: boolean = false;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor(res: Response) {
    this.res = res;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Start keep-alive ping every 15 seconds
    this.pingInterval = setInterval(() => {
      if (!this.closed) {
        this.res.write(': ping\n\n');
      }
    }, 15000);

    // Handle client disconnect
    res.on('close', () => {
      this.close();
    });
  }

  /**
   * Emit an SSE event to the client.
   */
  emit(event: SSEEvent): void {
    if (this.closed) return;

    try {
      const data = JSON.stringify(event);
      this.res.write(`data: ${data}\n\n`);
    } catch (error) {
      console.error('SSE emit error:', error);
    }
  }

  /**
   * Close the SSE connection.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    try {
      this.res.end();
    } catch (error) {
      // Connection may already be closed
    }
  }

  /**
   * Check if the connection is still open.
   */
  isOpen(): boolean {
    return !this.closed;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BUFFERED SSE EMITTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Buffered SSE emitter that collects events for batch retrieval.
 * Useful for testing or non-streaming scenarios.
 */
export class BufferedSSEEmitter implements SSEEmitter {
  private events: SSEEvent[] = [];
  private closed: boolean = false;

  emit(event: SSEEvent): void {
    if (this.closed) return;
    this.events.push(event);
  }

  close(): void {
    this.closed = true;
  }

  /**
   * Get all collected events.
   */
  getEvents(): SSEEvent[] {
    return [...this.events];
  }

  /**
   * Get events of a specific type.
   */
  getEventsByType<T extends SSEEvent['type']>(
    type: T
  ): Extract<SSEEvent, { type: T }>[] {
    return this.events.filter(e => e.type === type) as Extract<SSEEvent, { type: T }>[];
  }

  /**
   * Clear all collected events.
   */
  clear(): void {
    this.events = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTIPLEXED SSE EMITTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Multiplexed SSE emitter that broadcasts to multiple emitters.
 * Useful for debugging (HTTP + console) or multi-client scenarios.
 */
export class MultiplexedSSEEmitter implements SSEEmitter {
  private emitters: SSEEmitter[] = [];

  constructor(emitters: SSEEmitter[]) {
    this.emitters = emitters;
  }

  /**
   * Add an emitter to the multiplex.
   */
  addEmitter(emitter: SSEEmitter): void {
    this.emitters.push(emitter);
  }

  /**
   * Remove an emitter from the multiplex.
   */
  removeEmitter(emitter: SSEEmitter): void {
    const index = this.emitters.indexOf(emitter);
    if (index !== -1) {
      this.emitters.splice(index, 1);
    }
  }

  emit(event: SSEEvent): void {
    for (const emitter of this.emitters) {
      try {
        emitter.emit(event);
      } catch (error) {
        console.error('Multiplexed emit error:', error);
      }
    }
  }

  close(): void {
    for (const emitter of this.emitters) {
      try {
        emitter.close();
      } catch (error) {
        // Ignore close errors
      }
    }
    this.emitters = [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS - Match SSEEvent types from execution-context.ts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an execution_start event.
 */
export function createStartEvent(
  executionId: string,
  nodeCount: number,
  estimatedMs: number = 0
): SSEEvent {
  return {
    type: 'execution_start',
    executionId,
    nodeCount,
    estimatedMs,
  };
}

/**
 * Create a node_status event.
 */
export function createNodeStatusEvent(
  nodeId: string,
  status: NodeExecutionState,
  durationMs?: number,
  error?: string,
  outputPreview?: string
): SSEEvent {
  return {
    type: 'node_status',
    nodeId,
    status,
    durationMs,
    error,
    outputPreview,
  };
}

/**
 * Create an execution_complete event.
 */
export function createCompleteEvent(
  totalDurationMs: number,
  successCount: number,
  failedCount: number,
  skippedCount: number
): SSEEvent {
  return {
    type: 'execution_complete',
    totalDurationMs,
    successCount,
    failedCount,
    skippedCount,
  };
}

/**
 * Create an execution_failed event.
 */
export function createFailedEvent(
  error: string,
  failedNodeId?: string
): SSEEvent {
  return {
    type: 'execution_failed',
    error,
    failedNodeId,
  };
}
