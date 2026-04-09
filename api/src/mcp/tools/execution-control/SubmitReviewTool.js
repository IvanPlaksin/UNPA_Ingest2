const { BaseTool } = require('../primitives/BaseTool');

class SubmitReviewTool extends BaseTool {
  getDefinition() {
    return {
      id: 'cycle.submit_review',
      name: 'Submit Cycle Review',
      version: '1.0.0',
      level: 2,
      category: 'execution-control',
      description: 'Submit a cross-review for a cycle. Reviewer agent analyzes plan, execution decisions, and results. APPROVED → task done. REJECTED → returns to work (auto in AUTONOMOUS, user-triggered in PLANNING).',
      inputSchema: {
        type: 'object',
        required: ['cycleId', 'verdict'],
        properties: {
          cycleId: { type: 'string', description: 'Execution cycle ID' },
          verdict: { type: 'string', enum: ['APPROVED', 'REJECTED', 'NEEDS_REVISION'], description: 'Review verdict' },
          strengths: { type: 'array', items: { type: 'string' }, description: 'What was done well' },
          weaknesses: { type: 'array', items: { type: 'string' }, description: 'What needs improvement' },
          recommendations: { type: 'array', items: { type: 'string' }, description: 'Specific recommendations for improvement' },
          summary: { type: 'string', description: 'Review summary' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['cycleId', 'verdict']);
    const reviewService = require('../../../services/backlog/review.service');
    const agentId = context?.agentId || 'agent:reviewer';
    const review = await reviewService.submitReview(args.cycleId, args, agentId);
    return this.success(review);
  }
}

module.exports = { SubmitReviewTool };
