/**
 * Jobs Module
 */

const { JobQueueService, jobQueueService, InMemoryQueue } = require('./job-queue.service');

module.exports = {
  JobQueueService,
  jobQueueService,
  InMemoryQueue
};
