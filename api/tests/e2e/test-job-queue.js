/**
 * Task 8.2 — Background Job Processing Tests
 *
 * Tests JobQueueService, InMemoryQueue, and job routes.
 */

// ── Test helpers ────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertTrue(val, msg) {
  if (!val) throw new Error(`${msg || 'Assertion failed'}: expected truthy, got ${JSON.stringify(val)}`);
}

async function test(name, fn, timeoutMs = 10000) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
    ]);
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(63)}`);
  console.log(title);
  console.log('═'.repeat(63));
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('Background Job Processing Tests (Task 8.2)');
  console.log('═'.repeat(63));

  const { JobQueueService, jobQueueService, InMemoryQueue } = require('../../src/services/jobs');

  // ============================================================
  // InMemoryQueue — Unit
  // ============================================================
  section('InMemoryQueue — Unit');

  await test('InMemoryQueue constructor sets name', async () => {
    const q = new InMemoryQueue('test', async () => 'ok');
    assertEqual(q.name, 'test');
    assertEqual(q.jobs.size, 0);
  });

  await test('InMemoryQueue.add queues a job', async () => {
    const q = new InMemoryQueue('test', async (job) => ({ processed: job.data.value }));
    const result = await q.add({ value: 42 }, { jobId: 'j1' });
    assertEqual(result.id, 'j1');
    assertEqual(result.queue, 'test');
    assertEqual(result.status, 'queued');
    assertTrue(q.jobs.has('j1'));
  });

  await test('InMemoryQueue processes job and completes', async () => {
    let completedData = null;
    const q = new InMemoryQueue('test', async (job) => ({ val: job.data.x * 2 }), {
      onCompleted: (job, result) => { completedData = result; }
    });
    await q.add({ x: 5 }, { jobId: 'j2' });
    await new Promise(r => setTimeout(r, 100));

    const status = q.getJobStatus('j2');
    assertEqual(status.status, 'completed');
    assertTrue(status.result.val === 10);
    assertTrue(completedData !== null);
    assertEqual(completedData.val, 10);
  });

  await test('InMemoryQueue handles processor errors', async () => {
    let failedError = null;
    const q = new InMemoryQueue('test', async () => { throw new Error('boom'); }, {
      onFailed: (job, error) => { failedError = error; }
    });
    await q.add({ x: 1 }, { jobId: 'j3' });
    await new Promise(r => setTimeout(r, 100));

    const status = q.getJobStatus('j3');
    assertEqual(status.status, 'failed');
    assertEqual(status.error, 'boom');
    assertTrue(failedError !== null);
  });

  await test('InMemoryQueue.getJobStatus returns null for unknown', async () => {
    const q = new InMemoryQueue('test', async () => {});
    assertEqual(q.getJobStatus('nonexistent'), null);
  });

  await test('InMemoryQueue.getStatus returns queue counts', async () => {
    const q = new InMemoryQueue('test', async () => 'ok');
    await q.add({ a: 1 }, { jobId: 'a1' });
    await q.add({ a: 2 }, { jobId: 'a2' });
    await new Promise(r => setTimeout(r, 100));

    const status = q.getStatus();
    assertEqual(status.name, 'test');
    assertEqual(status.completed, 2);
    assertEqual(status.total, 2);
  });

  await test('InMemoryQueue.cancelJob removes a job', async () => {
    const q = new InMemoryQueue('test', async () => {
      await new Promise(r => setTimeout(r, 5000)); // Long job
    });
    await q.add({ a: 1 }, { jobId: 'cancel1' });
    const removed = q.cancelJob('cancel1');
    assertTrue(removed);
    assertEqual(q.getJobStatus('cancel1'), null);
  });

  await test('InMemoryQueue delayed job processing', async () => {
    const q = new InMemoryQueue('test', async (job) => job.data);
    await q.add({ val: 'delayed' }, { jobId: 'delayed1', delay: 50 });

    // Immediately after add, job should exist
    assertTrue(q.jobs.has('delayed1'));

    // After delay, should be processed
    await new Promise(r => setTimeout(r, 200));
    const status = q.getJobStatus('delayed1');
    assertEqual(status.status, 'completed');
  });

  await test('InMemoryQueue.addRepeating stores job', async () => {
    const q = new InMemoryQueue('test', async () => {});
    const result = await q.addRepeating({ task: 'cleanup' }, '*/5 * * * *');
    assertTrue(result.id.startsWith('repeat_'));
    assertEqual(result.status, 'scheduled');
    assertEqual(result.pattern, '*/5 * * * *');
    assertEqual(q.repeatingJobs.length, 1);
  });

  await test('InMemoryQueue updateProgress works', async () => {
    let progressValues = [];
    const q = new InMemoryQueue('test', async (job) => {
      await job.updateProgress(25);
      progressValues.push(job.progress);
      await job.updateProgress(50);
      progressValues.push(job.progress);
      await job.updateProgress(100);
      progressValues.push(job.progress);
      return 'done';
    });
    await q.add({}, { jobId: 'prog1' });
    await new Promise(r => setTimeout(r, 100));

    assertEqual(progressValues.length, 3);
    assertEqual(progressValues[0], 25);
    assertEqual(progressValues[1], 50);
    assertEqual(progressValues[2], 100);
  });

  // ============================================================
  // JobQueueService — Unit
  // ============================================================
  section('JobQueueService — Unit');

  await test('JobQueueService class exists', async () => {
    assertTrue(typeof JobQueueService === 'function');
  });

  await test('jobQueueService is singleton', async () => {
    assertTrue(jobQueueService instanceof JobQueueService);
  });

  await test('Initial stats are zeroed', async () => {
    const svc = new JobQueueService();
    const stats = svc.getStats();
    assertEqual(stats.totalJobsAdded, 0);
    assertEqual(stats.totalJobsCompleted, 0);
    assertEqual(stats.totalJobsFailed, 0);
    assertEqual(stats.initialized, false);
    assertEqual(stats.redisAvailable, false);
    assertTrue(Array.isArray(stats.queues));
  });

  await test('createQueue creates InMemoryQueue when Redis unavailable', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    const q = await svc.createQueue('my-queue', async (job) => job.data);
    assertTrue(q instanceof InMemoryQueue);
    assertTrue(svc.queues.has('my-queue'));
    assertTrue(svc.processors.has('my-queue'));
    assertTrue(svc.stats.byQueue['my-queue'] !== undefined);
  });

  await test('createQueue returns existing queue on duplicate', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    const q1 = await svc.createQueue('dup', async () => {});
    const q2 = await svc.createQueue('dup', async () => {});
    assertTrue(q1 === q2);
  });

  await test('addJob throws for unknown queue', async () => {
    const svc = new JobQueueService();
    try {
      await svc.addJob('nonexistent', {});
      assertTrue(false, 'Should have thrown');
    } catch (e) {
      assertTrue(e.message.includes('not found'));
    }
  });

  await test('addJob increments stats', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    await svc.createQueue('stats-q', async () => 'ok');
    await svc.addJob('stats-q', { test: 1 });
    assertEqual(svc.stats.totalJobsAdded, 1);
    assertEqual(svc.stats.byQueue['stats-q'].added, 1);
  });

  await test('addDelayedJob passes delay option', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    await svc.createQueue('delay-q', async (job) => job.data);
    const result = await svc.addDelayedJob('delay-q', { val: 1 }, 100);
    assertTrue(result.id.startsWith('job_'));
    assertEqual(result.status, 'queued');
  });

  await test('addRepeatingJob works with InMemoryQueue', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    await svc.createQueue('repeat-q', async () => 'ok');
    const result = await svc.addRepeatingJob('repeat-q', { task: 'check' }, '0 * * * *');
    assertEqual(result.status, 'scheduled');
    assertEqual(result.pattern, '0 * * * *');
  });

  await test('getJobStatus returns job data', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    await svc.createQueue('status-q', async (job) => ({ doubled: job.data.n * 2 }));
    await svc.addJob('status-q', { n: 7 }, { jobId: 'status-j1' });
    await new Promise(r => setTimeout(r, 100));

    const status = await svc.getJobStatus('status-q', 'status-j1');
    assertTrue(status !== null);
    assertEqual(status.id, 'status-j1');
    assertEqual(status.status, 'completed');
    assertEqual(status.result.doubled, 14);
  });

  await test('getJobStatus returns null for unknown job', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    await svc.createQueue('null-q', async () => {});
    const status = await svc.getJobStatus('null-q', 'ghost');
    assertEqual(status, null);
  });

  await test('getQueueStatus returns counts', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    await svc.createQueue('count-q', async () => 'done');
    await svc.addJob('count-q', { a: 1 });
    await svc.addJob('count-q', { a: 2 });
    await new Promise(r => setTimeout(r, 100));

    const status = await svc.getQueueStatus('count-q');
    assertEqual(status.name, 'count-q');
    assertEqual(status.completed, 2);
    assertEqual(status.total, 2);
  });

  await test('cancelJob removes a queued job', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    await svc.createQueue('cancel-q', async () => {
      await new Promise(r => setTimeout(r, 10000));
    });
    await svc.addJob('cancel-q', {}, { jobId: 'cancel-j1' });
    const cancelled = await svc.cancelJob('cancel-q', 'cancel-j1');
    assertTrue(cancelled);
  });

  await test('Event emitted on job completion', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    await svc.createQueue('event-q', async () => 'result');

    let eventFired = false;
    svc.on('job:completed', (data) => { eventFired = true; });

    await svc.addJob('event-q', {});
    await new Promise(r => setTimeout(r, 100));

    assertTrue(eventFired, 'job:completed event should fire');
    assertEqual(svc.stats.totalJobsCompleted, 1);
  });

  await test('Event emitted on job failure', async () => {
    const svc = new JobQueueService();
    svc.redisAvailable = false;
    await svc.createQueue('fail-q', async () => { throw new Error('test error'); });

    let eventFired = false;
    svc.on('job:failed', (data) => { eventFired = true; });

    await svc.addJob('fail-q', {});
    await new Promise(r => setTimeout(r, 100));

    assertTrue(eventFired, 'job:failed event should fire');
    assertEqual(svc.stats.totalJobsFailed, 1);
  });

  // ============================================================
  // JobQueueService — Initialize (in-memory mode)
  // ============================================================
  section('JobQueueService — Initialize');

  await test('initialize creates default queues', async () => {
    const svc = new JobQueueService();
    await svc.initialize();
    assertTrue(svc.initialized);
    assertTrue(svc.queues.has('extraction'));
    assertTrue(svc.queues.has('graph-update'));
    assertTrue(svc.queues.has('batch'));
    assertTrue(svc.queues.has('scheduled'));
  });

  await test('initialize is idempotent', async () => {
    const svc = new JobQueueService();
    await svc.initialize();
    await svc.initialize(); // Second call should be no-op
    assertTrue(svc.initialized);
    assertEqual(svc.queues.size, 4);
  });

  await test('Default batch processor works', async () => {
    const svc = new JobQueueService();
    await svc.initialize();
    const result = await svc.addJob('batch', {
      type: 'batch',
      items: ['a', 'b', 'c'],
      batchSize: 2
    }, { jobId: 'batch-test-1' });

    await new Promise(r => setTimeout(r, 200));

    const status = await svc.getJobStatus('batch', 'batch-test-1');
    assertEqual(status.status, 'completed');
    assertEqual(status.result.total, 3);
    assertEqual(status.result.successful, 3);
  });

  await test('Default scheduled processor works', async () => {
    const svc = new JobQueueService();
    await svc.initialize();
    await svc.addJob('scheduled', { task: 'cleanup' }, { jobId: 'sched-test-1' });
    await new Promise(r => setTimeout(r, 100));

    const status = await svc.getJobStatus('scheduled', 'sched-test-1');
    assertEqual(status.status, 'completed');
    assertEqual(status.result.task, 'cleanup');
    assertEqual(status.result.status, 'completed');
  });

  // ============================================================
  // Jobs Routes — Mock req/res
  // ============================================================
  section('Jobs Routes — Mock req/res');

  const jobsRouter = require('../../src/routes/jobs.routes');

  // Initialize the singleton for route tests
  if (!jobQueueService.initialized) {
    await jobQueueService.initialize();
  }

  function findHandler(method, routePath) {
    for (const layer of jobsRouter.stack) {
      if (layer.route && layer.route.path === routePath) {
        const match = layer.route.methods[method];
        if (match) {
          return layer.route.stack[0].handle;
        }
      }
    }
    return null;
  }

  function mockReqRes(body = {}, params = {}, query = {}) {
    const req = { body, params, query };
    let statusCode = 200;
    let responseData = null;
    const res = {
      status(code) { statusCode = code; return res; },
      json(data) { responseData = data; },
      statusCode: () => statusCode,
      data: () => responseData
    };
    return { req, res, getStatus: () => statusCode, getData: () => responseData };
  }

  // POST /extraction
  await test('POST /extraction validates text', async () => {
    const handler = findHandler('post', '/extraction');
    assertTrue(handler !== null);
    const { req, res, getStatus, getData } = mockReqRes({});
    await handler(req, res);
    assertEqual(getStatus(), 400);
    assertTrue(getData().error.includes('text'));
  });

  await test('POST /extraction queues job', async () => {
    const handler = findHandler('post', '/extraction');
    const { req, res, getStatus, getData } = mockReqRes({ text: 'Extract entities from this text' });
    await handler(req, res);
    assertEqual(getStatus(), 202);
    assertTrue(getData().success);
    assertTrue(getData().job.id.startsWith('job_'));
    assertEqual(getData().job.status, 'queued');
  });

  // POST /batch
  await test('POST /batch validates items', async () => {
    const handler = findHandler('post', '/batch');
    const { req, res, getStatus, getData } = mockReqRes({});
    await handler(req, res);
    assertEqual(getStatus(), 400);
    assertTrue(getData().error.includes('items'));
  });

  await test('POST /batch queues job', async () => {
    const handler = findHandler('post', '/batch');
    const { req, res, getStatus, getData } = mockReqRes({ items: ['a', 'b', 'c'] });
    await handler(req, res);
    assertEqual(getStatus(), 202);
    assertTrue(getData().success);
    assertEqual(getData().itemCount, 3);
  });

  // POST /graph-update
  await test('POST /graph-update validates nodes/edges', async () => {
    const handler = findHandler('post', '/graph-update');
    const { req, res, getStatus, getData } = mockReqRes({});
    await handler(req, res);
    assertEqual(getStatus(), 400);
    assertTrue(getData().error.includes('nodes or edges'));
  });

  await test('POST /graph-update queues job', async () => {
    const handler = findHandler('post', '/graph-update');
    const { req, res, getStatus, getData } = mockReqRes({ nodes: [{ name: 'A' }] });
    await handler(req, res);
    assertEqual(getStatus(), 202);
    assertTrue(getData().success);
  });

  // GET /stats
  await test('GET /stats returns statistics', async () => {
    const handler = findHandler('get', '/stats');
    assertTrue(handler !== null);
    const { req, res, getData } = mockReqRes();
    await handler(req, res);
    assertTrue(getData().success);
    assertTrue(getData().stats.totalJobsAdded >= 0);
    assertTrue(Array.isArray(getData().stats.queues));
  });

  // GET /queue/:name/status
  await test('GET /queue/:name/status returns queue info', async () => {
    const handler = findHandler('get', '/queue/:name/status');
    assertTrue(handler !== null);
    const { req, res, getData } = mockReqRes({}, { name: 'batch' });
    await handler(req, res);
    assertTrue(getData().success);
    assertEqual(getData().queue.name, 'batch');
    assertTrue(typeof getData().queue.completed === 'number');
  });

  // POST /queue/:name/pause
  await test('POST /queue/:name/pause responds', async () => {
    const handler = findHandler('post', '/queue/:name/pause');
    assertTrue(handler !== null);
    const { req, res, getData } = mockReqRes({}, { name: 'batch' });
    await handler(req, res);
    assertTrue(getData().success);
    assertTrue(getData().message.includes('paused'));
  });

  // POST /queue/:name/resume
  await test('POST /queue/:name/resume responds', async () => {
    const handler = findHandler('post', '/queue/:name/resume');
    assertTrue(handler !== null);
    const { req, res, getData } = mockReqRes({}, { name: 'batch' });
    await handler(req, res);
    assertTrue(getData().success);
    assertTrue(getData().message.includes('resumed'));
  });

  // GET /:queue/:jobId
  await test('GET /:queue/:jobId returns 404 for unknown job', async () => {
    const handler = findHandler('get', '/:queue/:jobId');
    assertTrue(handler !== null);
    const { req, res, getStatus, getData } = mockReqRes({}, { queue: 'batch', jobId: 'nonexistent' });
    await handler(req, res);
    assertEqual(getStatus(), 404);
    assertEqual(getData().error, 'Job not found');
  });

  // DELETE /:queue/:jobId
  await test('DELETE /:queue/:jobId returns result', async () => {
    const handler = findHandler('delete', '/:queue/:jobId');
    assertTrue(handler !== null);
    const { req, res, getData } = mockReqRes({}, { queue: 'batch', jobId: 'ghost' });
    await handler(req, res);
    // Returns false since job doesn't exist
    assertEqual(getData().success, false);
    assertTrue(getData().message.includes('not found'));
  });

  // ============================================================
  // Module Exports
  // ============================================================
  section('Module Exports');

  const jobsModule = require('../../src/services/jobs');

  await test('Module exports JobQueueService', async () => {
    assertTrue(typeof jobsModule.JobQueueService === 'function');
  });

  await test('Module exports jobQueueService singleton', async () => {
    assertTrue(jobsModule.jobQueueService instanceof jobsModule.JobQueueService);
  });

  await test('Module exports InMemoryQueue', async () => {
    assertTrue(typeof jobsModule.InMemoryQueue === 'function');
  });

  await test('jobs.routes exports express router', async () => {
    assertTrue(typeof jobsRouter === 'function');
    assertTrue(jobsRouter.stack.length > 0);
  });

  // ── Summary ──
  console.log(`\n${'═'.repeat(63)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(63));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
