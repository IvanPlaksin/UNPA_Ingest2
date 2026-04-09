/**
 * Job Queue Service
 * Background job processing with BullMQ (Redis) and in-memory fallback
 *
 * Default queues: extraction, graph-update, batch, scheduled
 * Supports: addJob, addDelayedJob, addRepeatingJob, cancel, pause, resume
 *
 * @module services/jobs/job-queue.service
 */

const { EventEmitter } = require('events');

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY QUEUE FALLBACK (used when Redis is unavailable)
// ═══════════════════════════════════════════════════════════════════════════

class InMemoryQueue {
  constructor(name, processor, callbacks = {}) {
    this.name = name;
    this.processor = processor;
    this.callbacks = callbacks;
    this.jobs = new Map();
    this.repeatingJobs = [];
  }

  async add(data, options = {}) {
    const jobId = options.jobId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      id: jobId,
      data,
      status: 'waiting',
      progress: 0,
      result: null,
      error: null,
      createdAt: Date.now(),
      processedAt: null,
      finishedAt: null,
      updateProgress: async (p) => { job.progress = p; }
    };

    this.jobs.set(jobId, job);

    const delay = options.delay || 0;
    setTimeout(() => this._processJob(job), delay);

    return { id: jobId, queue: this.name, status: 'queued' };
  }

  async addRepeating(data, pattern, options = {}) {
    const jobId = options.jobId || `repeat_${Date.now()}`;
    this.repeatingJobs.push({ jobId, data, pattern });
    return { id: jobId, queue: this.name, status: 'scheduled', pattern };
  }

  async _processJob(job) {
    job.status = 'active';
    job.processedAt = Date.now();

    try {
      job.result = await this.processor(job);
      job.status = 'completed';
      job.finishedAt = Date.now();
      if (this.callbacks.onCompleted) {
        this.callbacks.onCompleted(job, job.result);
      }
    } catch (error) {
      job.error = error.message;
      job.status = 'failed';
      job.finishedAt = Date.now();
      if (this.callbacks.onFailed) {
        this.callbacks.onFailed(job, error);
      }
    }
  }

  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return {
      id: job.id,
      queue: this.name,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
      createdAt: job.createdAt,
      processedAt: job.processedAt,
      finishedAt: job.finishedAt
    };
  }

  getStatus() {
    const jobs = [...this.jobs.values()];
    return {
      name: this.name,
      waiting: jobs.filter(j => j.status === 'waiting').length,
      active: jobs.filter(j => j.status === 'active').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      delayed: 0,
      total: jobs.length
    };
  }

  cancelJob(jobId) {
    return this.jobs.delete(jobId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// JOB QUEUE SERVICE
// ═══════════════════════════════════════════════════════════════════════════

class JobQueueService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 50
      },
      ...options
    };

    this.queues = new Map();
    this.workers = new Map();
    this.processors = new Map();

    this.stats = {
      totalJobsAdded: 0,
      totalJobsCompleted: 0,
      totalJobsFailed: 0,
      byQueue: {}
    };

    this.initialized = false;
    this.redisAvailable = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  async initialize() {
    if (this.initialized) return;

    // Test Redis connectivity
    try {
      const Redis = require('ioredis');
      const conn = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        connectTimeout: 3000,
        lazyConnect: true
      });
      await conn.connect();
      await conn.ping();
      conn.disconnect();
      this.redisAvailable = true;
      console.log('[JobQueue] Redis connection verified');
    } catch {
      this.redisAvailable = false;
      console.warn('[JobQueue] Redis not available, using in-memory fallback');
    }

    // Create default queues
    await this.createQueue('extraction', this._extractionProcessor.bind(this));
    await this.createQueue('graph-update', this._graphUpdateProcessor.bind(this));
    await this.createQueue('batch', this._batchProcessor.bind(this));
    await this.createQueue('scheduled', this._scheduledProcessor.bind(this));

    this.initialized = true;
    console.log('[JobQueue] Service initialized');
  }

  async shutdown() {
    for (const [, worker] of this.workers) {
      if (typeof worker.close === 'function') await worker.close();
    }
    for (const [, queue] of this.queues) {
      if (this.redisAvailable && typeof queue.close === 'function') {
        await queue.close();
      }
    }
    console.log('[JobQueue] Service shut down');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // QUEUE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  async createQueue(name, processor, options = {}) {
    if (this.queues.has(name)) {
      return this.queues.get(name);
    }

    this.processors.set(name, processor);
    this.stats.byQueue[name] = { added: 0, completed: 0, failed: 0, active: 0 };

    if (this.redisAvailable) {
      try {
        const { Queue, Worker } = require('bullmq');
        const connection = {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null
        };

        const queue = new Queue(name, {
          connection,
          defaultJobOptions: { ...this.options.defaultJobOptions, ...options.jobOptions }
        });

        const worker = new Worker(name, processor, {
          connection,
          concurrency: options.concurrency || 3
        });

        worker.on('completed', (job, result) => this._onJobCompleted(name, job, result));
        worker.on('failed', (job, error) => this._onJobFailed(name, job, error));
        worker.on('progress', (job, progress) => this._onJobProgress(name, job, progress));

        this.queues.set(name, queue);
        this.workers.set(name, worker);
        return queue;
      } catch (err) {
        console.warn(`[JobQueue] BullMQ queue "${name}" creation failed, falling back:`, err.message);
      }
    }

    // In-memory fallback
    const inMemoryQueue = new InMemoryQueue(name, processor, {
      onCompleted: (job, result) => this._onJobCompleted(name, job, result),
      onFailed: (job, error) => this._onJobFailed(name, job, error),
      onProgress: (job, progress) => this._onJobProgress(name, job, progress)
    });

    this.queues.set(name, inMemoryQueue);
    return inMemoryQueue;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // JOB API
  // ═══════════════════════════════════════════════════════════════════════

  async addJob(queueName, jobData, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue "${queueName}" not found`);

    const jobId = options.jobId || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.stats.totalJobsAdded++;
    this.stats.byQueue[queueName].added++;

    if (this.redisAvailable && typeof queue.add === 'function' && !(queue instanceof InMemoryQueue)) {
      const job = await queue.add(jobData.type || 'default', jobData, { jobId, ...options });
      return { id: job.id, queue: queueName, status: 'queued' };
    }

    return queue.add(jobData, { jobId, ...options });
  }

  async addDelayedJob(queueName, jobData, delay, options = {}) {
    return this.addJob(queueName, jobData, { ...options, delay });
  }

  async addRepeatingJob(queueName, jobData, pattern, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue "${queueName}" not found`);

    if (this.redisAvailable && !(queue instanceof InMemoryQueue)) {
      const job = await queue.add(jobData.type || 'scheduled', jobData, {
        repeat: { pattern },
        ...options
      });
      return { id: job.id, queue: queueName, status: 'scheduled', pattern };
    }

    return queue.addRepeating(jobData, pattern, options);
  }

  async getJobStatus(queueName, jobId) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue "${queueName}" not found`);

    if (this.redisAvailable && !(queue instanceof InMemoryQueue)) {
      const job = await queue.getJob(jobId);
      if (!job) return null;

      const state = await job.getState();
      return {
        id: job.id,
        queue: queueName,
        status: state,
        data: job.data,
        progress: job.progress,
        result: job.returnvalue,
        failedReason: job.failedReason,
        attempts: job.attemptsMade,
        createdAt: job.timestamp,
        processedAt: job.processedOn,
        finishedAt: job.finishedOn
      };
    }

    return queue.getJobStatus(jobId);
  }

  async getQueueStatus(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue "${queueName}" not found`);

    if (this.redisAvailable && !(queue instanceof InMemoryQueue)) {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount()
      ]);
      return { name: queueName, waiting, active, completed, failed, delayed, total: waiting + active + delayed };
    }

    return queue.getStatus();
  }

  async cancelJob(queueName, jobId) {
    const queue = this.queues.get(queueName);
    if (!queue) throw new Error(`Queue "${queueName}" not found`);

    if (this.redisAvailable && !(queue instanceof InMemoryQueue)) {
      const job = await queue.getJob(jobId);
      if (job) { await job.remove(); return true; }
      return false;
    }

    return queue.cancelJob(jobId);
  }

  async pauseQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (queue && this.redisAvailable && typeof queue.pause === 'function') {
      await queue.pause();
    }
  }

  async resumeQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (queue && this.redisAvailable && typeof queue.resume === 'function') {
      await queue.resume();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════════════

  _onJobCompleted(queueName, job, result) {
    this.stats.totalJobsCompleted++;
    if (this.stats.byQueue[queueName]) {
      this.stats.byQueue[queueName].completed++;
      this.stats.byQueue[queueName].active = Math.max(0, this.stats.byQueue[queueName].active - 1);
    }
    this.emit('job:completed', { queue: queueName, jobId: job.id, result });
  }

  _onJobFailed(queueName, job, error) {
    this.stats.totalJobsFailed++;
    if (this.stats.byQueue[queueName]) {
      this.stats.byQueue[queueName].failed++;
      this.stats.byQueue[queueName].active = Math.max(0, this.stats.byQueue[queueName].active - 1);
    }
    this.emit('job:failed', { queue: queueName, jobId: job.id, error: error.message });
  }

  _onJobProgress(queueName, job, progress) {
    this.emit('job:progress', { queue: queueName, jobId: job.id, progress });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DEFAULT PROCESSORS
  // ═══════════════════════════════════════════════════════════════════════

  async _extractionProcessor(job) {
    const { text, domain, options } = job.data;
    await job.updateProgress(10);

    // Lazy-load to avoid circular dependencies
    const { unifiedExtractor } = require('../extraction');
    const result = await unifiedExtractor.extract(text, { domain, ...options });

    await job.updateProgress(100);
    return {
      entities: result.entities.length,
      relations: result.relations.length,
      metadata: result.metadata
    };
  }

  async _graphUpdateProcessor(job) {
    const { nodes, edges, operation } = job.data;
    await job.updateProgress(10);

    const { gnnRAGService } = require('../gnn');
    switch (operation) {
      case 'add':
        if (nodes) gnnRAGService.addNodes(nodes);
        if (edges) gnnRAGService.addEdges(edges);
        break;
      case 'clear':
        gnnRAGService.graphCache.nodes.clear();
        gnnRAGService.graphCache.edges.clear();
        gnnRAGService.graphCache.adjacency.clear();
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    await job.updateProgress(100);
    return { operation, nodesAffected: nodes?.length || 0, edgesAffected: edges?.length || 0 };
  }

  async _batchProcessor(job) {
    const { items, batchSize = 5 } = job.data;
    const results = [];
    const total = items.length;

    for (let i = 0; i < total; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = batch.map((item, idx) => ({
        index: i + idx,
        success: true,
        data: item
      }));
      results.push(...batchResults);
      await job.updateProgress(Math.round(((i + batch.length) / total) * 100));
    }

    return {
      total,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }

  async _scheduledProcessor(job) {
    const { task } = job.data;
    switch (task) {
      case 'cleanup':
        return { task, status: 'completed' };
      case 'stats':
        return { task, status: 'completed', stats: this.getStats() };
      default:
        return { task, status: 'unknown' };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════════

  getStats() {
    return {
      ...this.stats,
      initialized: this.initialized,
      redisAvailable: this.redisAvailable,
      queues: [...this.queues.keys()]
    };
  }
}

// Singleton
const jobQueueService = new JobQueueService();

module.exports = {
  JobQueueService,
  jobQueueService,
  InMemoryQueue
};
