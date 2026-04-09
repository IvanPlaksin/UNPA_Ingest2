const BaseTool = require('../primitives/BaseTool').BaseTool;

class UpdateStatusTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.update_status',
      name: 'Update BackLog Task Status',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Transition a BackLog task to a new status. Valid transitions: PROPOSED→APPROVED/REJECTED, APPROVED→IN_PROGRESS, IN_PROGRESS→REVIEW/BLOCKED, REVIEW→DONE.',
      inputSchema: {
        type: 'object',
        required: ['backlogId', 'action'],
        properties: {
          backlogId: { type: 'string', description: 'BackLog item ID' },
          action: { type: 'string', enum: ['approve', 'reject', 'start', 'block', 'unblock', 'review', 'complete', 'cancel'], description: 'Transition action' },
          reason: { type: 'string', description: 'Reason (required for reject/block)' },
          assignedTo: { type: 'string', description: 'Assigned agent/user (for start action)' },
          implementationNotes: { type: 'string', description: 'Notes about implementation (for review action)' },
          implementedFiles: { type: 'array', items: { type: 'string' }, description: 'List of modified files (for review action)' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          item: { type: 'object' },
          previousStatus: { type: 'string' },
          newStatus: { type: 'string' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE']
    };
  }

  async execute(args) {
    this.validateArgs(args, ['backlogId', 'action']);
    const backlogService = require('../../../services/backlog/backlog.service');

    const before = await backlogService.getById(args.backlogId);
    if (!before) this.error('NOT_FOUND', `BackLog item not found: ${args.backlogId}`);
    const previousStatus = before.status;

    let item;
    switch (args.action) {
      case 'approve': item = await backlogService.approve(args.backlogId, args.assignedTo || 'mcp'); break;
      case 'reject': item = await backlogService.reject(args.backlogId, 'mcp', args.reason || 'Rejected via MCP'); break;
      case 'start': item = await backlogService.start(args.backlogId, args.assignedTo || 'mcp-agent'); break;
      case 'block': item = await backlogService.block(args.backlogId, 'mcp', args.reason || ''); break;
      case 'unblock': item = await backlogService.unblock(args.backlogId); break;
      case 'review': item = await backlogService.submitForReview(args.backlogId, args.implementationNotes, args.implementedFiles); break;
      case 'complete': item = await backlogService.complete(args.backlogId, 'mcp'); break;
      case 'cancel': item = await backlogService.cancel(args.backlogId, 'mcp', args.reason || ''); break;
      default: this.error('INVALID_ACTION', `Unknown action: ${args.action}`);
    }

    return this.success({ item, previousStatus, newStatus: item.status });
  }
}

module.exports = { UpdateStatusTool };
