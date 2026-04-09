class SafetyGuard {
  constructor(config = {}) {
    this.config = {
      godModeEnabled: false,
      godModeSessionId: null,
      godModeExpiresAt: null,
      maxToolsCreatedPerDay: config.maxToolsCreatedPerDay || 10,
      maxRecursionDepth: config.maxRecursionDepth || 3,
      protectedTools: config.protectedTools || ['primitive.*', 'meta.rollback_change'],
      ...config
    };
    this.dailyCounters = new Map();
    this.pendingApprovals = new Map();
  }

  async check(tool, args, context = {}) {
    const def = tool.getDefinition();

    // AUTO level - always allowed
    if (def.safetyLevel === 'AUTO') {
      return { allowed: true };
    }

    // GOD_MODE level - requires active god mode
    if (def.safetyLevel === 'GOD_MODE') {
      if (!this.isGodModeActive()) {
        return {
          allowed: false,
          reason: 'GOD_MODE_REQUIRED',
          requiredApproval: 'god_mode_activation'
        };
      }
    }

    // REQUIRES_APPROVAL level
    if (def.safetyLevel === 'REQUIRES_APPROVAL') {
      const approvalKey = `${def.id}:${JSON.stringify(args)}`;
      if (!this.pendingApprovals.has(approvalKey)) {
        return {
          allowed: false,
          reason: 'APPROVAL_REQUIRED',
          requiredApproval: 'user_confirmation',
          approvalKey
        };
      }
      const approval = this.pendingApprovals.get(approvalKey);
      if (approval.status !== 'approved') {
        return { allowed: false, reason: 'APPROVAL_PENDING' };
      }
      this.pendingApprovals.delete(approvalKey);
    }

    // Check daily limits for meta tools
    if (def.category === 'meta') {
      const today = new Date().toISOString().split('T')[0];
      const countKey = `${today}:${def.id}`;
      const count = this.dailyCounters.get(countKey) || 0;
      if (count >= this.config.maxToolsCreatedPerDay) {
        return {
          allowed: false,
          reason: 'DAILY_LIMIT_EXCEEDED',
          limit: this.config.maxToolsCreatedPerDay
        };
      }
      this.dailyCounters.set(countKey, count + 1);
    }

    // Check recursion depth
    if (context.recursionDepth && context.recursionDepth > this.config.maxRecursionDepth) {
      return {
        allowed: false,
        reason: 'MAX_RECURSION_EXCEEDED',
        limit: this.config.maxRecursionDepth
      };
    }

    return { allowed: true };
  }

  requestApproval(approvalKey, metadata = {}) {
    this.pendingApprovals.set(approvalKey, {
      status: 'pending',
      requestedAt: Date.now(),
      metadata
    });
    return approvalKey;
  }

  approve(approvalKey) {
    if (!this.pendingApprovals.has(approvalKey)) return false;
    this.pendingApprovals.get(approvalKey).status = 'approved';
    return true;
  }

  reject(approvalKey, reason) {
    if (!this.pendingApprovals.has(approvalKey)) return false;
    this.pendingApprovals.get(approvalKey).status = 'rejected';
    this.pendingApprovals.get(approvalKey).rejectionReason = reason;
    return true;
  }

  activateGodMode(sessionId, durationMs = 30 * 60 * 1000) {
    this.config.godModeEnabled = true;
    this.config.godModeSessionId = sessionId;
    this.config.godModeExpiresAt = Date.now() + durationMs;
    return { sessionId, expiresAt: this.config.godModeExpiresAt };
  }

  deactivateGodMode() {
    this.config.godModeEnabled = false;
    this.config.godModeSessionId = null;
    this.config.godModeExpiresAt = null;
  }

  isGodModeActive() {
    if (!this.config.godModeEnabled) return false;
    if (Date.now() > this.config.godModeExpiresAt) {
      this.deactivateGodMode();
      return false;
    }
    return true;
  }
}

module.exports = { SafetyGuard };
