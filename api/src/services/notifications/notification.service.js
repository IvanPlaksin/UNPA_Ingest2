/**
 * Notification Service — event registry with categorized notifications.
 *
 * Categories: TASK_STATUS, CYCLE_PHASE, REVIEW_VERDICT, TOKEN_ALERT, SYSTEM
 * Stores in-memory with optional Memgraph persistence.
 * SSE broadcast to connected clients.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

const CATEGORIES = ['TASK_STATUS', 'CYCLE_PHASE', 'REVIEW_VERDICT', 'TOKEN_ALERT', 'SYSTEM'];
const MAX_NOTIFICATIONS = 500;

class NotificationService extends EventEmitter {
  constructor() {
    super();
    this._notifications = [];
    this._sseClients = new Set();
    this._metrics = {};
    for (const cat of CATEGORIES) {
      this._metrics[cat] = { total: 0, unread: 0 };
    }
  }

  /**
   * Create a notification
   */
  create({ category, title, message, entityId, entityType, severity = 'info', metadata = {} } = {}) {
    if (!CATEGORIES.includes(category)) {
      category = 'SYSTEM';
    }

    const notification = {
      id: uuidv4(),
      category,
      title,
      message,
      entityId: entityId || '',
      entityType: entityType || '',
      severity, // info, warning, error, success
      metadata,
      read: false,
      createdAt: new Date().toISOString()
    };

    this._notifications.unshift(notification);
    if (this._notifications.length > MAX_NOTIFICATIONS) {
      this._notifications = this._notifications.slice(0, MAX_NOTIFICATIONS);
    }

    this._metrics[category].total++;
    this._metrics[category].unread++;

    // Broadcast to SSE clients
    this._broadcast('notification', notification);
    this.emit('notification', notification);

    return notification;
  }

  /**
   * List notifications with optional filters
   */
  list({ category, unreadOnly = false, limit = 50 } = {}) {
    let items = this._notifications;
    if (category) items = items.filter(n => n.category === category);
    if (unreadOnly) items = items.filter(n => !n.read);
    return items.slice(0, limit);
  }

  /**
   * Mark notification as read
   */
  markRead(notificationId) {
    const n = this._notifications.find(n => n.id === notificationId);
    if (n && !n.read) {
      n.read = true;
      this._metrics[n.category].unread = Math.max(0, this._metrics[n.category].unread - 1);
    }
    return n;
  }

  /**
   * Mark all as read
   */
  markAllRead(category) {
    for (const n of this._notifications) {
      if (!category || n.category === category) {
        n.read = true;
      }
    }
    if (category) {
      this._metrics[category].unread = 0;
    } else {
      for (const cat of CATEGORIES) this._metrics[cat].unread = 0;
    }
  }

  /**
   * Get metrics per category
   */
  getMetrics() {
    const totalUnread = Object.values(this._metrics).reduce((s, m) => s + m.unread, 0);
    return {
      categories: { ...this._metrics },
      totalUnread,
      totalCount: this._notifications.length
    };
  }

  // ============================================================
  // SSE
  // ============================================================

  addSSEClient(res) {
    this._sseClients.add(res);
    res.on('close', () => this._sseClients.delete(res));
    // Send unread count immediately
    const metrics = this.getMetrics();
    res.write(`event: metrics\ndata: ${JSON.stringify(metrics)}\n\n`);
  }

  _broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this._sseClients) {
      try { res.write(msg); } catch { this._sseClients.delete(res); }
    }
  }

  // ============================================================
  // CONVENIENCE METHODS for BackLog events
  // ============================================================

  notifyTaskStatus(backlogId, oldStatus, newStatus, taskTitle) {
    return this.create({
      category: 'TASK_STATUS',
      title: `Task ${backlogId}: ${oldStatus} → ${newStatus}`,
      message: taskTitle || backlogId,
      entityId: backlogId,
      entityType: 'BackLogTask',
      severity: newStatus === 'DONE' ? 'success' : newStatus === 'REJECTED' ? 'error' : 'info'
    });
  }

  notifyCyclePhase(cycleId, backlogId, phase, iteration) {
    return this.create({
      category: 'CYCLE_PHASE',
      title: `Cycle ${iteration}: ${phase}`,
      message: `Task ${backlogId}, iteration ${iteration}`,
      entityId: cycleId,
      entityType: 'ExecutionCycle',
      severity: phase === 'COMPLETED' ? 'success' : phase === 'AWAITING_RETURN' ? 'warning' : 'info'
    });
  }

  notifyReviewVerdict(cycleId, backlogId, verdict) {
    return this.create({
      category: 'REVIEW_VERDICT',
      title: `Review: ${verdict}`,
      message: `Task ${backlogId}`,
      entityId: cycleId,
      entityType: 'ReviewRecord',
      severity: verdict === 'APPROVED' ? 'success' : 'error'
    });
  }

  notifyTokenAlert(cycleId, level, tokens, threshold) {
    return this.create({
      category: 'TOKEN_ALERT',
      title: `Token ${level}: ${tokens.toLocaleString()} / ${threshold.toLocaleString()}`,
      message: `Cycle ${cycleId}`,
      entityId: cycleId,
      entityType: 'ExecutionCycle',
      severity: level === 'BREAK' ? 'error' : 'warning'
    });
  }
}

module.exports = new NotificationService();
